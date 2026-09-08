const esc = (s: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, '\\$1'));

function seg(el: Element): string {
  if (el.id) return '#' + esc(el.id);
  const dt = el.getAttribute('data-testid');
  if (dt) return `[data-testid="${dt.replace(/"/g, '\\"')}"]`;
  let s = el.tagName.toLowerCase();
  s += [...el.classList].slice(0, 2).map((c) => '.' + esc(c)).join('');
  const p = el.parentElement;
  if (p) {
    const sib = [...p.children].filter((c) => c.tagName === el.tagName);
    if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(el) + 1})`;
  }
  return s;
}

export function uniqueSelector(el: Element): string {
  const parts: string[] = [];
  for (let cur: Element | null = el; cur && cur !== document.body && cur !== document.documentElement && parts.length < 8; cur = cur.parentElement) {
    const s = seg(cur);
    parts.unshift(s);
    if (s.startsWith('#') || s.startsWith('[data-testid')) break;
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const cand = parts.slice(i).join(' > ');
    try { if (document.querySelectorAll(cand).length === 1) return cand; } catch { /* 비정상 선택자 */ }
  }
  return parts.join(' > ');
}
