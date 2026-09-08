import type { OverlayMsg, ServerMsg } from '../core/types.js';

// init script는 페이지 스크립트보다 먼저 실행된다 → 페이지가 WebSocket을 몽키패치하기 전의 원본을 잡아둔다
const NativeWS = window.WebSocket;
const nativeSend = NativeWS.prototype.send;

export function connectChannel(opts: { port: number; token: string; onMessage: (m: ServerMsg) => void; onOpen: () => void; onClose: () => void }) {
  let ws: WebSocket | null = null;
  let delay = 500;
  let closed = false;
  const queue: OverlayMsg[] = [];

  const raw = (m: OverlayMsg) => { if (ws && ws.readyState === NativeWS.OPEN) nativeSend.call(ws, JSON.stringify(m)); };
  const connect = () => {
    if (closed) return;
    const sock = new NativeWS(`ws://127.0.0.1:${opts.port}`);
    ws = sock;
    sock.onopen = () => {
      delay = 500;
      raw({ type: 'hello', token: opts.token });
      while (queue.length) raw(queue.shift()!);
      opts.onOpen();
    };
    sock.onmessage = (ev) => { try { opts.onMessage(JSON.parse(String(ev.data)) as ServerMsg); } catch { /* 무시 */ } };
    sock.onclose = (ev) => {
      ws = null; opts.onClose();
      if (closed || ev.code === 4001) return; // 인증 실패는 재시도 무의미
      setTimeout(connect, delay); delay = Math.min(delay * 2, 8000);
    };
    sock.onerror = () => { /* onclose가 뒤따른다 */ };
  };
  connect();
  return {
    send(m: OverlayMsg) { if (ws && ws.readyState === NativeWS.OPEN) raw(m); else if (m.type !== 'hello') queue.push(m); },
    close() { closed = true; ws?.close(); },
  };
}
