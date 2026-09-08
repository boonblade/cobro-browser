import { WebSocketServer, WebSocket } from 'ws';
import type { OverlayMsg, ServerMsg } from '../core/types.js';

type Routed = Exclude<OverlayMsg, { type: 'hello' }>;
type Reply = (m: ServerMsg) => void;

export class ChannelServer {
  private wss: WebSocketServer | null = null;
  private authed = new Set<WebSocket>();
  constructor(private readonly opts: { token: string; onMessage: (msg: Routed, reply: Reply) => void; onConnect?: (reply: Reply) => void }) {}

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
        const authTimer = setTimeout(() => { if (!this.authed.has(ws)) ws.close(4001, 'auth timeout'); }, 3000);
        ws.on('message', (data) => {
          let msg: OverlayMsg;
          try { msg = JSON.parse(data.toString()) as OverlayMsg; } catch { return; }
          if (!this.authed.has(ws)) {
            if (msg?.type === 'hello' && msg.token === this.opts.token) { clearTimeout(authTimer); this.authed.add(ws); this.opts.onConnect?.(reply); }
            else ws.close(4001, 'unauthorized');
            return;
          }
          if (msg?.type === 'hello') return;
          this.opts.onMessage(msg as Routed, reply);
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
