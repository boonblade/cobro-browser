// test/fixtures/serve.mjs — 4173, csp.html에만 엄격 CSP 헤더
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
createServer(async (req, res) => {
  const p = (req.url ?? '/').split('?')[0];
  const file = join(dir, p === '/' ? 'basic.html' : p);
  try {
    const body = await readFile(file);
    const h = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (p.endsWith('csp.html')) h['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self'";
    res.writeHead(200, h); res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(4173, '127.0.0.1', () => console.error('fixtures on 4173'));
