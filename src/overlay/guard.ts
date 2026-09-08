// 1겹: host에서 버블 차단 → document/window의 버블 리스너(MUI focusin 트랩, Radix/Bootstrap, "바깥 클릭" 핸들러, 전역 단축키)가 못 본다.
//      우리 shadow 내부 리스너(target 단계)는 이미 실행된 뒤라 영향 없음. React 앱 리스너는 root 컨테이너에 붙어 있어 우리 host를 아예 거치지 않는다.
// 2겹: 포커스 계열만 window 캡처에서 stopImmediatePropagation → document/window 캡처 트랩(focus-trap 라이브러리, Headless UI)까지 차단.
//      우리는 window 수준 포커스 리스너가 없으므로 안전. (마우스·키는 캡처에서 끊으면 우리 target 리스너까지 죽으므로 1겹만.)
const BUBBLE_TYPES = ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu',
  'wheel', 'touchstart', 'touchend', 'touchmove', 'keydown', 'keyup', 'keypress', 'focusin', 'focusout', 'input', 'change'] as const;
const FOCUS_TYPES = ['focus', 'blur', 'focusin', 'focusout'] as const;

export function installGuards(host: HTMLElement): () => void {
  const isOurs = (e: Event) => e.composedPath().includes(host);
  const bubbleStop = (e: Event) => { e.stopPropagation(); };
  const captureStop = (e: Event) => { if (isOurs(e) || (e instanceof FocusEvent && e.relatedTarget instanceof Node && host.contains(e.relatedTarget))) e.stopImmediatePropagation(); };
  for (const t of BUBBLE_TYPES) host.addEventListener(t, bubbleStop);
  for (const t of FOCUS_TYPES) window.addEventListener(t, captureStop, true);
  return () => {
    for (const t of BUBBLE_TYPES) host.removeEventListener(t, bubbleStop);
    for (const t of FOCUS_TYPES) window.removeEventListener(t, captureStop, true);
  };
}
