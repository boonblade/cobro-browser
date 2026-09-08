import type { AgentStatus, Batch, RefreshStrategy } from '../core/types.js';

export interface ViewModel { selecting: boolean; connected: boolean; agent: { status: AgentStatus; text: string }; strategy: RefreshStrategy | null; drafts: Batch[]; current: string | null; history: Batch[]; locked: boolean }
export interface UIHandlers { onToggleSelect(): void; onNoteInput(id: string, note: string): void; onSelectBatch(id: string): void; onAddBatch(): void; onRemoveElement(id: string, index: number): void; onSend(): void; onRedo(id: string): void; onUnlock(): void }

const CSS = `
:host{position:fixed;inset:0;margin:0;padding:0;border:0;background:transparent;width:100vw;height:100vh;overflow:visible;pointer-events:none;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#e8ecf5}
:host::backdrop{display:none}
*{box-sizing:border-box}
.glass{position:fixed;inset:0;pointer-events:auto;cursor:crosshair;display:none}
.hover-box{position:fixed;display:none;border:2px solid #e35d5d;background:rgba(227,93,93,.08);border-radius:2px;pointer-events:none}
.hover-badge{position:fixed;display:none;background:#1c2333;border:1px solid #e35d5d;border-radius:4px;padding:4px 8px;white-space:pre;color:#fff;pointer-events:none;max-width:480px}
.band{position:fixed;display:none;border:1.5px dashed #e35d5d;background:rgba(227,93,93,.06);pointer-events:none}
.toolbar{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:6px;align-items:center;background:#0e111a;border:1px solid #2a3350;border-radius:999px;padding:6px 10px;box-shadow:0 4px 16px rgba(0,0,0,.5);pointer-events:auto}
.toolbar button,.panel button{font:inherit;color:#9db8ef;background:transparent;border:1px solid transparent;border-radius:999px;padding:4px 10px;cursor:pointer}
.toolbar button.on{color:#fff;background:#e35d5d;border-color:#e35d5d}
.status{color:#aab6d0;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.status.off{color:#f0b429}
.panel{position:fixed;right:14px;bottom:60px;width:320px;background:#171b28;border:1px solid #e35d5d;border-radius:8px;padding:10px 12px;box-shadow:0 4px 16px rgba(0,0,0,.5);pointer-events:auto;display:none}
.panel.show{display:block}
.panel h4{margin:0 0 6px;color:#e35d5d;font-size:11px}
.els{max-height:110px;overflow:auto;margin-bottom:8px;color:#aab6d0;font-size:11px}
.els div{display:flex;justify-content:space-between;gap:6px;word-break:break-all}
.els .missing{color:#f0b429}
.els button{padding:0 6px}
textarea{width:100%;height:54px;resize:none;font:inherit;color:#e8ecf5;background:#0e111a;border:1px solid #3a4a72;border-radius:4px;padding:4px 6px;margin-bottom:8px}
.row{display:flex;justify-content:flex-end;gap:6px;align-items:center}
.row .send{color:#fff;background:#e35d5d;border-color:#e35d5d;font-weight:700}
.row .send:disabled{opacity:.4;cursor:not-allowed}
.tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px}
.tabs button.on{background:#232c42;color:#fff}
.hist{margin-top:8px;border-top:1px solid #262e47;padding-top:6px;max-height:120px;overflow:auto;font-size:11px;color:#8291b0}
.hist div{display:flex;justify-content:space-between;gap:6px}
.flash{position:fixed;border:2px solid #4fd18b;border-radius:2px;pointer-events:none;animation:cobroflash 1.6s ease-out forwards}
@keyframes cobroflash{0%{opacity:1}100%{opacity:0}}
/* shadow root의 자식은 모두 position:fixed 형제 — picker가 glass를 toolbar/panel 뒤에 append하므로 쌓임 순서를 명시한다 */
.glass{z-index:0}
.hover-box,.hover-badge,.band,.flash{z-index:1}
.toolbar,.panel{z-index:2}
`;

const STATUS_TEXT: Record<AgentStatus, (t: string) => string> = {
  idle: () => '에이전트 미연결', waiting: () => '피드백 대기 중', sent: () => '전송됨 — 에이전트 응답 대기',
  working: (t) => '수정 중' + (t ? ': ' + t : ''), done: (t) => '완료' + (t ? ': ' + t : ''),
};
const BATCH_STATUS: Record<Batch['status'], string> = { draft: '초안', sent: '전송됨', done: '처리됨', unanswered: '응답 없음' };

export function createUI(h: UIHandlers) {
  const host = document.createElement('div');
  host.setAttribute('data-cobro-host', '');
  host.setAttribute('popover', 'manual');
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = CSS;
  const toolbar = document.createElement('div'); toolbar.className = 'toolbar';
  const selectBtn = document.createElement('button'); selectBtn.textContent = 'Select'; selectBtn.onclick = () => h.onToggleSelect();
  const status = document.createElement('span'); status.className = 'status';
  const collapseBtn = document.createElement('button'); collapseBtn.textContent = 'Collapse';
  toolbar.append(selectBtn, status, collapseBtn);
  const panel = document.createElement('div'); panel.className = 'panel';
  root.append(style, toolbar, panel);
  let collapsed = false; let lastVm: ViewModel | null = null;
  collapseBtn.onclick = () => { collapsed = !collapsed; collapseBtn.textContent = collapsed ? 'Expand' : 'Collapse'; if (lastVm) render(lastVm); };
  const textareas = new Map<string, HTMLTextAreaElement>();

  const mount = () => {
    if (!host.isConnected) document.documentElement.append(host);
    try { if (!host.matches(':popover-open')) host.showPopover(); } catch { /* popover 미지원: fixed + 최대 z-index로 폴백 */ host.style.zIndex = '2147483647'; }
  };
  const bump = () => { try { if (host.matches(':popover-open')) { host.hidePopover(); host.showPopover(); } } catch { /* 무시 */ } };
  // 페이지가 나중에 띄운 dialog/popover가 top layer 위로 올라오면 우리를 다시 맨 위로
  document.addEventListener('toggle', (e) => { if (e.target !== host) bump(); }, true);
  new MutationObserver((muts) => {
    if (!host.isConnected) mount();
    if (muts.some((m) => m.type === 'attributes' && (m.target as Element).tagName === 'DIALOG')) bump();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  mount();

  const el = (tag: string, cls?: string, text?: string) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };

  function render(vm: ViewModel) {
    lastVm = vm;
    selectBtn.classList.toggle('on', vm.selecting);
    status.textContent = vm.connected ? STATUS_TEXT[vm.agent.status](vm.agent.text) + (vm.strategy ? ` · 갱신: ${vm.strategy}` : '') : '연결 끊김 — 재연결 중';
    status.classList.toggle('off', !vm.connected);
    const show = !collapsed && (vm.drafts.length > 0 || vm.history.length > 0);
    panel.classList.toggle('show', show);
    if (!show) return;
    panel.textContent = '';
    const cur = vm.drafts.find((b) => b.id === vm.current) ?? vm.drafts[vm.drafts.length - 1];
    if (vm.drafts.length > 1) {
      const tabs = el('div', 'tabs');
      vm.drafts.forEach((b, i) => { const t = el('button', b === cur ? 'on' : '', `#${i + 1} (${b.elements.length})`); t.onclick = () => h.onSelectBatch(b.id); tabs.append(t); });
      panel.append(tabs);
    }
    if (cur) {
      panel.append(el('h4', '', `▮ ${cur.elements.length} elements selected`));
      const list = el('div', 'els');
      cur.elements.forEach((e, i) => {
        const row = el('div', e.missing ? 'missing' : '');
        row.append(el('span', '', `${i + 1}. ${e.selector.split(' > ').pop()}${e.react ? ' · ' + e.react.component : ''}${e.missing ? ' · 요소 없음' : ''}`));
        const x = el('button', '', '✕'); x.onclick = () => h.onRemoveElement(cur.id, i); row.append(x);
        list.append(row);
      });
      panel.append(list);
      let ta = textareas.get(cur.id);
      if (!ta) { ta = document.createElement('textarea'); ta.placeholder = '수정 요청 메모…'; const id = cur.id; ta.addEventListener('input', () => h.onNoteInput(id, ta!.value)); textareas.set(id, ta); }
      if (ta.value !== cur.note) ta.value = cur.note;
      panel.append(ta);
    }
    const row = el('div', 'row');
    const add = el('button', '', 'Add batch'); add.onclick = () => h.onAddBatch();
    const send = el('button', 'send', 'Send') as HTMLButtonElement; send.disabled = vm.locked; send.onclick = () => h.onSend();
    row.append(add);
    if (vm.locked) { const unlock = el('button', '', 'Unlock'); unlock.title = '에이전트 응답 없이 다시 보내기'; unlock.onclick = () => h.onUnlock(); row.append(unlock); }
    row.append(send);
    panel.append(row);
    if (vm.history.length) {
      const hist = el('div', 'hist');
      for (const b of vm.history.slice(0, 20)) {
        const r = el('div');
        r.append(el('span', '', `[${BATCH_STATUS[b.status]}] ${b.note.slice(0, 40)}${b.summary ? ' → ' + b.summary.slice(0, 40) : ''}`));
        if (b.status === 'done' || b.status === 'unanswered') { const redo = el('button', '', 'Redo'); redo.onclick = () => h.onRedo(b.id); r.append(redo); }
        hist.append(r);
      }
      panel.append(hist);
    }
    for (const id of [...textareas.keys()]) if (!vm.drafts.some((b) => b.id === id)) textareas.delete(id);
  }
  function flash(selectors: string[]) {
    for (const s of selectors) {
      let target: Element | null = null;
      try { target = document.querySelector(s); } catch { /* 선택자 불량 */ }
      if (!target) continue;
      const r = target.getBoundingClientRect();
      const f = el('div', 'flash');
      Object.assign(f.style, { left: r.left - 2 + 'px', top: r.top - 2 + 'px', width: r.width + 4 + 'px', height: r.height + 4 + 'px' });
      root.append(f); setTimeout(() => f.remove(), 1700);
    }
  }
  function focusNote() { const ta = panel.querySelector('textarea'); ta?.focus(); }
  return { host, root, render, flash, focusNote };
}
