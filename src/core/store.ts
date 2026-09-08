import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Session } from './types.js';

export function emptySession(): Session {
  return { version: 1, page: null, batches: [], agent: { status: 'idle', text: '' }, strategy: null, detected: null };
}

export class Store {
  readonly dir: string;
  private readonly file: string;
  private readonly shots: string;
  constructor(dir: string) {
    this.dir = dir; this.file = join(dir, 'session.json'); this.shots = join(dir, 'shots');
    mkdirSync(this.shots, { recursive: true });
  }
  load(): Session | null {
    if (!existsSync(this.file)) return null;
    try {
      const s = JSON.parse(readFileSync(this.file, 'utf8')) as Session;
      return s && s.version === 1 && Array.isArray(s.batches) ? s : null;
    } catch { return null; }
  }
  save(session: Session): void {
    const tmp = this.file + '.' + process.pid + '.tmp';
    writeFileSync(tmp, JSON.stringify(session, null, 2));
    renameSync(tmp, this.file); // 같은 볼륨 내 rename = 원자적 교체
  }
  shotPath(batchId: string): string { return join(this.shots, batchId.replace(/[^a-zA-Z0-9_-]/g, '_') + '.png'); }
  pruneShots(keepIds: string[], max = 50): void {
    const keep = new Set(keepIds.map((id) => this.shotPath(id)));
    const files = readdirSync(this.shots).filter((f) => f.endsWith('.png')).map((f) => join(this.shots, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs); // 최신 우선
    let kept = 0;
    for (const f of files) {
      if (keep.has(f) || kept < max) { kept++; continue; }
      unlinkSync(f);
    }
  }
}
