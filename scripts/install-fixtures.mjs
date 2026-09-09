// e2e 픽스처 의존성 — 이미 설치돼 있으면 건너뛴다(매 e2e 실행마다 npm ci를 다시 돌리지 않기 위함)
// npm은 셸로 실행한다: Windows에서 npm.cmd를 shell 없이 spawn하면 Node 18.20+가 EINVAL을 던진다(CVE-2024-27980 완화)
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const dir = 'test/fixtures/vite-app';
if (existsSync(`${dir}/node_modules`)) {
  console.error(`[cobro] ${dir}/node_modules 존재 — 설치를 건너뛴다`);
} else {
  execSync(`npm ci --prefix ${dir}`, { stdio: 'inherit' });
}
