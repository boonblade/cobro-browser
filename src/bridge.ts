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
      // 페이지에서 온 메시지는 전부 데이터다 — 쓰기 전에 형태를 확인하고, 어긋나면 한 줄 남기고 버린다
      const bad = (why: string) => console.error(`[cobro] bridge: ${msg.type} 메시지를 무시한다 — ${why}`);
      switch (msg.type) {
        case 'page':
          if (!msg.page || typeof msg.page.url !== 'string') return bad('page.url이 없다');
          core.setPage(msg.page, msg.detected); break;
        case 'draft':
          if (!Array.isArray(msg.batches)) return bad('batches가 배열이 아니다');
          core.setDrafts(msg.batches); break;
        case 'redo':
          if (typeof msg.batchId !== 'string') return bad('batchId가 문자열이 아니다');
          core.redo(msg.batchId); break;
        case 'resolved':
          if (typeof msg.batchId !== 'string') return bad('batchId가 문자열이 아니다');
          core.markResolved(msg.batchId, msg.index, msg.missing); break;
        case 'send': {
          if (!Array.isArray(msg.batchIds) || !msg.page || typeof msg.page.url !== 'string') return bad('batchIds 배열이나 page.url이 없다');
          const batches = core.markSent(msg.batchIds, msg.page);
          void (async () => {
            // 무엇이 던지든 wait는 반드시 풀어준다 — 스크린샷·콘솔 없이라도 최소 페이로드를 배달한다
            try {
              for (const b of batches) {
                try { const p = await opts.screenshot?.(b, msg.page); if (p) core.setScreenshot(b.id, p); } catch (e) { console.error('[cobro] screenshot failed', (e as Error).message); }
              }
              core.deliver(buildPayload({ page: msg.page, batches, console: opts.consoleEntries?.() ?? [], refreshStrategy: core.effectiveStrategy() }));
            } catch (e) {
              console.error('[cobro] send 처리 실패 — 최소 페이로드로 배달한다', (e as Error).message);
              core.deliver({
                origin: 'human', sentAt: new Date().toISOString(), page: msg.page,
                batches: batches.map((b) => ({ id: b.id, note: b.note, elements: b.elements })),
                console: [], refreshStrategy: core.effectiveStrategy(),
              });
            }
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
