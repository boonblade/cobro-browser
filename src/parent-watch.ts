/** 부모(호스트) 프로세스 생존 주기 감시(R76). stdin close가 안 오는 환경(Windows) 대비 — 순수 함수, import 부작용 없음(R78) */
export function startParentWatch(o: { isParentAlive: () => boolean; onDead: () => void; intervalMs: number }): () => void {
  const interval = setInterval(() => {
    if (!o.isParentAlive()) { clearInterval(interval); o.onDead(); }
  }, o.intervalMs);
  interval.unref(); // 서버 종료를 막지 않는다
  return () => clearInterval(interval);
}
