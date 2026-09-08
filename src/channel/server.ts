import { WebSocketServer, WebSocket } from 'ws';
import type { OverlayMsg, ServerMsg } from '../core/types.js';

type Routed = Exclude<OverlayMsg, { type: 'hello' }>;
type Reply = (m: ServerMsg) => void;

export class ChannelServer {
  private wss: WebSocketServer | null = null;
  private authed = new Set<WebSocket>();
  constructor(private readonly opts: { token: string; onMessage: (msg: Routed, reply: Reply) => void; onConnect?: (reply: Reply) => void; authTimeoutMs?: number }) {}

  listen(): Promise<number> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
      this.wss = wss;
      wss.once('error', reject);
      wss.on('listening', () => {
        const addr = wss.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
      wss.on('connection', (ws) => {
        const reply: Reply = (m) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
        const authTimer = setTimeout(() => { if (!this.authed.has(ws)) { console.error('[cobro] channel: unauthorized connection closed (auth timeout)'); ws.close(4001, 'auth timeout'); } }, this.opts.authTimeoutMs ?? 3000);
        authTimer.unref();
        ws.on('message', (data) => {
          let msg: OverlayMsg;
          try { msg = JSON.parse(data.toString()) as OverlayMsg; } catch { return; }
          if (!this.authed.has(ws)) {
            if (msg?.type === 'hello' && msg.token === this.opts.token) { clearTimeout(authTimer); this.authed.add(ws); this.opts.onConnect?.(reply); }
            else { console.error('[cobro] channel: unauthorized connection closed (invalid auth message)'); ws.close(4001, 'unauthorized'); }
            return;
          }
          if (msg?.type === 'hello') return;
          // 핸들러가 던져도 프로세스를 죽이지 않는다 — 소켓은 열린 채로 다음 메시지를 계속 받는다
          try { this.opts.onMessage(msg as Routed, reply); }
          catch (e) { console.error('[cobro] channel: handler failed', (e as Error).message); }
        });
        ws.on('close', () => { clearTimeout(authTimer); this.authed.delete(ws); });
        ws.on('error', () => { /* close가 뒤따른다 */ });
      });
    });
  }
  broadcast(m: ServerMsg): void {
    const s = JSON.stringify(m);
    for (const ws of this.authed) if (ws.readyState === WebSocket.OPEN) ws.send(s);
  }
  clientCount(): number { return this.authed.size; }
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) return resolve();
      for (const ws of this.wss.clients) ws.terminate();
      this.wss.close(() => resolve());
      this.wss = null; this.authed.clear();
    });
  }
}
