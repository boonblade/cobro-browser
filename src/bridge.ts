import { SessionCore } from './core/session.js';
import { ChannelServer } from './channel/server.js';
import { buildPayload } from './core/payload.js';
import type { Store } from './core/store.js';
import type { Batch, ConsoleEntry, DoneInfo, PageInfo } from './core/types.js';

export interface Bridge { core: SessionCore; channel: ChannelServer; port: number; token: string; done(info: DoneInfo): Batch[]; close(): Promise<void> }

export async function createBridge(opts: { store: Store; token: string; screenshot?: (b: Batch, page: PageInfo) => Promise<string | undefined>; consoleEntries?: () => ConsoleEntry[] }): Promise<Bridge> {
  const core = new SessionCore(opts.store);
  const channel = new ChannelServer({
    token: opts.token,
    onConnect: (reply) => reply({ type: 'state', session: core.session }),
    onMessage: (msg) => {
      switch (msg.type) {
        case 'page': core.setPage(msg.page, msg.detected); break;
        case 'draft': core.setDrafts(msg.batches); break;
        case 'redo': core.redo(msg.batchId); break;
        case 'resolved': core.markResolved(msg.batchId, msg.index, msg.missing); break;
        case 'send': {
          const batches = core.markSent(msg.batchIds, msg.page);
          void (async () => {
            for (const b of batches) {
              try { const p = await opts.screenshot?.(b, msg.page); if (p) { b.screenshot = p; } } catch (e) { console.error('[cobro] screenshot failed', e); }
            }
            core.deliver(buildPayload({ page: msg.page, batches, console: opts.consoleEntries?.() ?? [], refreshStrategy: core.effectiveStrategy() }));
          })();
          break;
        }
      }
    },
  });
  core.on('change', (s) => channel.broadcast({ type: 'state', session: s }));
  const port = await channel.listen();
  return {
    core, channel, port, token: opts.token,
    done(info) { const out = core.done(info); channel.broadcast({ type: 'done', info, strategy: core.effectiveStrategy() }); return out; },
    close: () => channel.close(),
  };
}
