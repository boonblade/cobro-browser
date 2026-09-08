import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Store, emptySession } from './store.js';
import type { Batch, DoneInfo, PageInfo, Payload, RefreshStrategy, Session, WaitResult } from './types.js';

type Waiter = { resolve: (r: WaitResult) => void };

export class SessionCore extends EventEmitter {
  private s: Session;
  private queue: Array<{ payload: Payload; browserRestarted?: boolean }> = [];
  private waiter: Waiter | null = null;

  constructor(private readonly store: Store) {
    super();
    this.s = store.load() ?? emptySession();
    // 재시작 시 'waiting'/'working'은 의미가 없다 → idle
    if (this.s.agent.status === 'waiting' || this.s.agent.status === 'working') this.s.agent = { status: 'idle', text: '' };
  }
  get session(): Session { return this.s; }

  private commit(): void { this.store.save(this.s); this.emit('change', this.s); }

  setPage(page: PageInfo, detected: RefreshStrategy): void { this.s.page = page; this.s.detected = detected; this.commit(); }
  setStrategy(strategy: RefreshStrategy | null): void { this.s.strategy = strategy; this.commit(); }
  effectiveStrategy(): RefreshStrategy { return this.s.strategy ?? this.s.detected ?? 'reload'; }

  setDrafts(batches: Batch[]): void {
    const others = this.s.batches.filter((b) => b.status !== 'draft');
    this.s.batches = [...others, ...batches.map((b) => ({ ...b, status: 'draft' as const }))];
    this.commit();
  }
  markSent(batchIds: string[], page: PageInfo): Batch[] {
    const now = new Date().toISOString();
    const sent: Batch[] = [];
    for (const b of this.s.batches) {
      if (b.status === 'sent') b.status = 'unanswered';
      if (b.status === 'draft' && batchIds.includes(b.id)) { b.status = 'sent'; b.sentAt = now; sent.push(b); }
    }
    this.s.page = page; this.s.agent = { status: 'sent', text: '' };
    this.commit();
    return sent;
  }
  deliver(payload: Payload, extra: { browserRestarted?: boolean } = {}): void {
    const item = { payload, ...extra };
    if (this.waiter) { const w = this.waiter; this.waiter = null; w.resolve({ status: 'sent', ...item }); }
    else this.queue.push(item);
  }
  wait(timeoutMs: number, onTick?: (elapsedMs: number) => void | Promise<void>, opts: { tickMs?: number; signal?: AbortSignal } = {}): Promise<WaitResult> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve({ status: 'sent', ...queued });
    if (this.s.agent.status !== 'sent') { this.s.agent = { status: 'waiting', text: '' }; this.commit(); }
    const tickMs = opts.tickMs ?? 30_000;
    const started = Date.now();
    return new Promise<WaitResult>((resolve) => {
      const finish = (r: WaitResult) => { clearInterval(iv); clearTimeout(to); opts.signal?.removeEventListener('abort', onAbort); if (this.waiter?.resolve === wrapped) this.waiter = null; resolve(r); };
      const wrapped = (r: WaitResult) => finish(r);
      const onAbort = () => finish({ status: 'pending' });
      const iv = setInterval(() => { void onTick?.(Date.now() - started); }, tickMs);
      const to = setTimeout(() => finish({ status: 'pending' }), timeoutMs);
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      this.waiter = { resolve: wrapped };
    });
  }
  setAgentText(text: string): void { this.s.agent = { status: 'working', text }; this.commit(); }
  done(info: DoneInfo): Batch[] {
    const now = new Date().toISOString();
    const out: Batch[] = [];
    for (const b of this.s.batches) if (b.status === 'sent') { b.status = 'done'; b.doneAt = now; b.summary = info.summary; out.push(b); }
    this.s.agent = { status: 'done', text: info.summary };
    this.store.pruneShots(this.s.batches.filter((b) => b.status !== 'done').map((b) => b.id));
    this.commit();
    return out;
  }
  redo(batchId: string): Batch | null {
    const src = this.s.batches.find((b) => b.id === batchId && (b.status === 'done' || b.status === 'unanswered'));
    if (!src) return null;
    const clone: Batch = { id: randomUUID(), note: src.note, elements: src.elements.map((e) => ({ ...e })), status: 'draft', createdAt: new Date().toISOString() };
    this.s.batches.push(clone); this.commit();
    return clone;
  }
  markResolved(batchId: string, index: number, missing: boolean): void {
    const e = this.s.batches.find((b) => b.id === batchId)?.elements[index];
    if (!e) return;
    e.missing = missing; this.commit();
  }
}
