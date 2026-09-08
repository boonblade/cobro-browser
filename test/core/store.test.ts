import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, writeFileSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, emptySession } from '../../src/core/store.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cobro-')); });

describe('Store', () => {
  it('load returns null when nothing saved', () => {
    expect(new Store(dir).load()).toBeNull();
  });
  it('save then load round-trips and leaves no temp file', () => {
    const s = new Store(dir);
    const session = emptySession();
    session.agent.text = 'hi';
    s.save(session);
    expect(s.load()).toEqual(session);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
  });
  it('load returns null on corrupt json', () => {
    const s = new Store(dir);
    writeFileSync(join(dir, 'session.json'), '{oops');
    expect(s.load()).toBeNull();
  });
  it('pruneShots keeps listed ids and newest up to max', () => {
    const s = new Store(dir);
    const baseTime = Date.now();
    const ids = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 4; i++) {
      const id = ids[i]!;
      writeFileSync(s.shotPath(id), 'x');
      // Set distinct mtimes: oldest → d newest (base time + 1000ms per file)
      const mtime = new Date(baseTime + i * 1000);
      utimesSync(s.shotPath(id), mtime, mtime);
    }
    s.pruneShots(['d'], 2);
    const left = readdirSync(join(dir, 'shots')).sort();
    expect(left).toHaveLength(2);
    expect(left).toContain('d.png');
    expect(existsSync(s.shotPath('a'))).toBe(false);
  });
});
