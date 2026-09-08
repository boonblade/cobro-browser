// dist/가 커밋된 소스 상태와 일치하는지 확인한다(빌드 산출물을 git에 커밋하는 배포 방식이라
// dist/가 최신 소스보다 오래되면 안 된다 — npm/cli #8440 우회: npm이 git 전역 설치 시
// prepare 전에 devDependencies를 설치하지 않는 결함 때문에 dist/를 미리 빌드해 커밋한다).
//
// 임시 디렉터리에 같은 빌드를 한 번 더 돌려 dist/와 바이트 단위로 비교한다.
// esbuild 출력은 결정적(byte-for-byte 동일)임을 확인했다(2026-09-09, 두 번 빌드해 diff 없음).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FILES = ['server.js', 'overlay.js'];

const tmp = mkdtempSync(join(tmpdir(), 'cobro-dist-check-'));
try {
  try {
    execFileSync(process.execPath, ['scripts/build.mjs', tmp], { stdio: 'pipe' });
  } catch (err) {
    process.stderr.write(err.stderr ?? String(err));
    throw err;
  }

  let mismatch = false;
  for (const file of FILES) {
    const fresh = readFileSync(join(tmp, file));
    let committed;
    try {
      committed = readFileSync(join('dist', file));
    } catch {
      mismatch = true;
      break;
    }
    if (!fresh.equals(committed)) {
      mismatch = true;
      break;
    }
  }

  if (mismatch) {
    console.error('dist가 소스보다 오래됨 — npm run build 후 커밋');
    process.exit(1);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
