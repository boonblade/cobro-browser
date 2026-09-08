"use strict";
(() => {
  // src/overlay/ui.ts
  var CSS2 = `
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
/* shadow root\uC758 \uC790\uC2DD\uC740 \uBAA8\uB450 position:fixed \uD615\uC81C \u2014 picker\uAC00 glass\uB97C toolbar/panel \uB4A4\uC5D0 append\uD558\uBBC0\uB85C \uC313\uC784 \uC21C\uC11C\uB97C \uBA85\uC2DC\uD55C\uB2E4 */
.glass{z-index:0}
.hover-box,.hover-badge,.band,.flash{z-index:1}
.toolbar,.panel{z-index:2}
`;
  var STATUS_TEXT = {
    idle: () => "\uC5D0\uC774\uC804\uD2B8 \uBBF8\uC5F0\uACB0",
    waiting: () => "\uD53C\uB4DC\uBC31 \uB300\uAE30 \uC911",
    sent: () => "\uC804\uC1A1\uB428 \u2014 \uC5D0\uC774\uC804\uD2B8 \uC751\uB2F5 \uB300\uAE30",
    working: (t) => "\uC218\uC815 \uC911" + (t ? ": " + t : ""),
    done: (t) => "\uC644\uB8CC" + (t ? ": " + t : "")
  };
  var BATCH_STATUS = { draft: "\uCD08\uC548", sent: "\uC804\uC1A1\uB428", done: "\uCC98\uB9AC\uB428", unanswered: "\uC751\uB2F5 \uC5C6\uC74C" };
  function createUI(h) {
    const host = document.createElement("div");
    host.setAttribute("data-cobro-host", "");
    host.setAttribute("popover", "manual");
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS2;
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    const selectBtn = document.createElement("button");
    selectBtn.textContent = "Select";
    selectBtn.onclick = () => h.onToggleSelect();
    const status = document.createElement("span");
    status.className = "status";
    const collapseBtn = document.createElement("button");
    collapseBtn.textContent = "Collapse";
    toolbar.append(selectBtn, status, collapseBtn);
    const panel = document.createElement("div");
    panel.className = "panel";
    root.append(style, toolbar, panel);
    let collapsed = false;
    let lastVm = null;
    collapseBtn.onclick = () => {
      collapsed = !collapsed;
      collapseBtn.textContent = collapsed ? "Expand" : "Collapse";
      if (lastVm) render(lastVm);
    };
    const textareas = /* @__PURE__ */ new Map();
    const mount = () => {
      if (!host.isConnected) document.documentElement.append(host);
      try {
        if (!host.matches(":popover-open")) host.showPopover();
      } catch {
        host.style.zIndex = "2147483647";
      }
    };
    const bump = () => {
      try {
        if (host.matches(":popover-open")) {
          host.hidePopover();
          host.showPopover();
        }
      } catch {
      }
    };
    document.addEventListener("toggle", (e) => {
      if (e.target !== host) bump();
    }, true);
    new MutationObserver((muts) => {
      if (!host.isConnected) mount();
      if (muts.some((m) => m.type === "attributes" && m.target.tagName === "DIALOG")) bump();
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    mount();
    const el = (tag, cls, text) => {
      const d = document.createElement(tag);
      if (cls) d.className = cls;
      if (text != null) d.textContent = text;
      return d;
    };
    function render(vm) {
      lastVm = vm;
      const active = root.activeElement;
      const wasTa = active instanceof HTMLTextAreaElement ? active : null;
      const sel = wasTa ? [wasTa.selectionStart, wasTa.selectionEnd] : null;
      selectBtn.classList.toggle("on", vm.selecting);
      status.textContent = vm.connected ? STATUS_TEXT[vm.agent.status](vm.agent.text) + (vm.strategy ? ` \xB7 \uAC31\uC2E0: ${vm.strategy}` : "") : "\uC5F0\uACB0 \uB04A\uAE40 \u2014 \uC7AC\uC5F0\uACB0 \uC911";
      status.classList.toggle("off", !vm.connected);
      const show = !collapsed && (vm.drafts.length > 0 || vm.history.length > 0);
      panel.classList.toggle("show", show);
      if (!show) return;
      panel.textContent = "";
      const cur = vm.drafts.find((b) => b.id === vm.current) ?? vm.drafts[vm.drafts.length - 1];
      if (vm.drafts.length > 1) {
        const tabs = el("div", "tabs");
        vm.drafts.forEach((b, i) => {
          const t = el("button", b === cur ? "on" : "", `#${i + 1} (${b.elements.length})`);
          t.onclick = () => h.onSelectBatch(b.id);
          tabs.append(t);
        });
        panel.append(tabs);
      }
      if (cur) {
        panel.append(el("h4", "", `\u25AE ${cur.elements.length} elements selected`));
        const list = el("div", "els");
        cur.elements.forEach((e, i) => {
          const row2 = el("div", e.missing ? "missing" : "");
          row2.append(el("span", "", `${i + 1}. ${e.selector.split(" > ").pop()}${e.react ? " \xB7 " + e.react.component : ""}${e.missing ? " \xB7 \uC694\uC18C \uC5C6\uC74C" : ""}`));
          const x = el("button", "", "\u2715");
          x.onclick = () => h.onRemoveElement(cur.id, i);
          row2.append(x);
          list.append(row2);
        });
        panel.append(list);
        let ta = textareas.get(cur.id);
        if (!ta) {
          ta = document.createElement("textarea");
          ta.placeholder = "\uC218\uC815 \uC694\uCCAD \uBA54\uBAA8\u2026";
          const id = cur.id;
          ta.addEventListener("input", () => h.onNoteInput(id, ta.value));
          textareas.set(id, ta);
        }
        if (ta.value !== cur.note) ta.value = cur.note;
        panel.append(ta);
      }
      const row = el("div", "row");
      const add = el("button", "", "Add batch");
      add.onclick = () => h.onAddBatch();
      const send = el("button", "send", "Send");
      send.disabled = vm.locked;
      send.onclick = () => h.onSend();
      row.append(add);
      if (vm.locked) {
        const unlock = el("button", "", "Unlock");
        unlock.title = "\uC5D0\uC774\uC804\uD2B8 \uC751\uB2F5 \uC5C6\uC774 \uB2E4\uC2DC \uBCF4\uB0B4\uAE30";
        unlock.onclick = () => h.onUnlock();
        row.append(unlock);
      }
      row.append(send);
      panel.append(row);
      if (vm.history.length) {
        const hist = el("div", "hist");
        for (const b of vm.history.slice(0, 20)) {
          const r = el("div");
          r.append(el("span", "", `[${BATCH_STATUS[b.status]}] ${b.note.slice(0, 40)}${b.summary ? " \u2192 " + b.summary.slice(0, 40) : ""}`));
          if (b.status === "done" || b.status === "unanswered") {
            const redo = el("button", "", "Redo");
            redo.onclick = () => h.onRedo(b.id);
            r.append(redo);
          }
          hist.append(r);
        }
        panel.append(hist);
      }
      for (const id of [...textareas.keys()]) if (!vm.drafts.some((b) => b.id === id)) textareas.delete(id);
      if (wasTa && sel && wasTa.isConnected) {
        wasTa.focus();
        wasTa.setSelectionRange(sel[0], sel[1]);
      }
    }
    function flash(selectors) {
      for (const s of selectors) {
        let target = null;
        try {
          target = document.querySelector(s);
        } catch {
        }
        if (!target) continue;
        const r = target.getBoundingClientRect();
        const f = el("div", "flash");
        Object.assign(f.style, { left: r.left - 2 + "px", top: r.top - 2 + "px", width: r.width + 4 + "px", height: r.height + 4 + "px" });
        root.append(f);
        setTimeout(() => f.remove(), 1700);
      }
    }
    function focusNote() {
      const ta = panel.querySelector("textarea");
      ta?.focus();
    }
    return { host, root, render, flash, focusNote };
  }

  // src/overlay/picker.ts
  function createPicker(opts) {
    const { root, host } = opts;
    const glass = document.createElement("div");
    glass.className = "glass";
    const box = document.createElement("div");
    box.className = "hover-box";
    const badge = document.createElement("div");
    badge.className = "hover-badge";
    const band = document.createElement("div");
    band.className = "band";
    root.append(glass, box, badge, band);
    let active = false;
    let dragStart = null;
    let dragging = false;
    let suppressClick = false;
    let target = null;
    const notOurs = (el) => el !== host && !host.contains(el) && el !== document.documentElement && el !== document.body;
    const pick = (x, y) => document.elementsFromPoint(x, y).find(notOurs) ?? null;
    const rectOf = (e) => ({ left: Math.min(dragStart.x, e.clientX), top: Math.min(dragStart.y, e.clientY), right: Math.max(dragStart.x, e.clientX), bottom: Math.max(dragStart.y, e.clientY) });
    const hide = () => {
      box.style.display = badge.style.display = "none";
      target = null;
    };
    const show = (el, x, y, label) => {
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
      badge.textContent = `${label}
${Math.round(r.width)}\xD7${Math.round(r.height)}`;
      badge.style.display = "block";
      const bw = badge.offsetWidth, bh = badge.offsetHeight;
      badge.style.left = Math.min(x + 14, innerWidth - bw - 8) + "px";
      badge.style.top = (y + 18 + bh > innerHeight ? y - bh - 8 : y + 18) + "px";
    };
    const labelOf = (el) => el.id ? "#" + el.id : el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map((c) => "." + c).join("");
    const inBand = (b) => {
      const within = /* @__PURE__ */ new Set();
      for (const el of document.body.querySelectorAll("*")) {
        if (!notOurs(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.left >= b.left && r.right <= b.right && r.top >= b.top && r.bottom <= b.bottom) within.add(el);
      }
      return [...within].filter((el) => !(el.parentElement && within.has(el.parentElement)));
    };
    glass.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        dragStart = { x: e.clientX, y: e.clientY };
        dragging = false;
      }
    });
    glass.addEventListener("mousemove", (e) => {
      if (dragStart && (dragging || Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 6)) {
        dragging = true;
        hide();
        const b = rectOf(e);
        Object.assign(band.style, { display: "block", left: b.left + "px", top: b.top + "px", width: b.right - b.left + "px", height: b.bottom - b.top + "px" });
        e.preventDefault();
        return;
      }
      const el = pick(e.clientX, e.clientY);
      if (!el) return hide();
      target = el;
      show(el, e.clientX, e.clientY, labelOf(el));
    });
    glass.addEventListener("mouseup", (e) => {
      if (!dragging) {
        dragStart = null;
        return;
      }
      e.preventDefault();
      opts.onBandPick(inBand(rectOf(e)));
      band.style.display = "none";
      dragStart = null;
      dragging = false;
      suppressClick = true;
    });
    glass.addEventListener("click", (e) => {
      e.preventDefault();
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (target) opts.onPick(target);
    });
    glass.addEventListener("mouseleave", hide);
    glass.addEventListener("wheel", (e) => {
      e.preventDefault();
      for (let cur = pick(e.clientX, e.clientY); cur && cur !== document.body; cur = cur.parentElement) {
        const cs = getComputedStyle(cur);
        if (/(auto|scroll)/.test(cs.overflowY) && cur.scrollHeight > cur.clientHeight) {
          cur.scrollBy(e.deltaX, e.deltaY);
          return;
        }
      }
      window.scrollBy(e.deltaX, e.deltaY);
    }, { passive: false });
    const setActive = (on) => {
      active = on;
      suppressClick = false;
      glass.style.display = on ? "block" : "none";
      if (!on) {
        hide();
        band.style.display = "none";
        dragStart = null;
        dragging = false;
      }
    };
    setActive(false);
    return { setActive, isActive: () => active, destroy: () => {
      glass.remove();
      box.remove();
      badge.remove();
      band.remove();
    } };
  }

  // src/overlay/guard.ts
  var BUBBLE_TYPES = [
    "pointerdown",
    "pointerup",
    "pointermove",
    "mousedown",
    "mouseup",
    "mousemove",
    "click",
    "dblclick",
    "contextmenu",
    "wheel",
    "touchstart",
    "touchend",
    "touchmove",
    "keydown",
    "keyup",
    "keypress",
    "focusin",
    "focusout",
    "input",
    "change"
  ];
  var FOCUS_TYPES = ["focus", "blur", "focusin", "focusout"];
  function installGuards(host) {
    const isOurs = (e) => e.composedPath().includes(host);
    const bubbleStop = (e) => {
      e.stopPropagation();
    };
    const captureStop = (e) => {
      if (isOurs(e) || e instanceof FocusEvent && e.relatedTarget instanceof Node && host.contains(e.relatedTarget)) e.stopImmediatePropagation();
    };
    for (const t of BUBBLE_TYPES) host.addEventListener(t, bubbleStop);
    for (const t of FOCUS_TYPES) window.addEventListener(t, captureStop, true);
    return () => {
      for (const t of BUBBLE_TYPES) host.removeEventListener(t, bubbleStop);
      for (const t of FOCUS_TYPES) window.removeEventListener(t, captureStop, true);
    };
  }

  // src/overlay/channel.ts
  var NativeWS = window.WebSocket;
  var nativeSend = NativeWS.prototype.send;
  function connectChannel(opts) {
    let ws = null;
    let delay = 500;
    let closed = false;
    const queue = [];
    const raw = (m) => {
      if (ws && ws.readyState === NativeWS.OPEN) nativeSend.call(ws, JSON.stringify(m));
    };
    const connect = () => {
      if (closed) return;
      const sock = new NativeWS(`ws://127.0.0.1:${opts.port}`);
      ws = sock;
      sock.onopen = () => {
        delay = 500;
        raw({ type: "hello", token: opts.token });
        while (queue.length) raw(queue.shift());
        opts.onOpen();
      };
      sock.onmessage = (ev) => {
        try {
          opts.onMessage(JSON.parse(String(ev.data)));
        } catch {
        }
      };
      sock.onclose = (ev) => {
        ws = null;
        opts.onClose();
        if (closed || ev.code === 4001) return;
        setTimeout(connect, delay);
        delay = Math.min(delay * 2, 8e3);
      };
      sock.onerror = () => {
      };
    };
    connect();
    return {
      send(m) {
        if (ws && ws.readyState === NativeWS.OPEN) raw(m);
        else if (m.type !== "hello") queue.push(m);
      },
      close() {
        closed = true;
        ws?.close();
      }
    };
  }

  // src/overlay/selector.ts
  var esc = (s) => typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, "\\$1");
  function seg(el) {
    if (el.id) return "#" + esc(el.id);
    const dt = el.getAttribute("data-testid");
    if (dt) return `[data-testid="${dt.replace(/"/g, '\\"')}"]`;
    let s = el.tagName.toLowerCase();
    s += [...el.classList].slice(0, 2).map((c) => "." + esc(c)).join("");
    const p = el.parentElement;
    if (p) {
      const sib = [...p.children].filter((c) => c.tagName === el.tagName);
      if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(el) + 1})`;
    }
    return s;
  }
  function uniqueSelector(el) {
    const parts = [];
    for (let cur = el; cur && cur !== document.body && cur !== document.documentElement && parts.length < 8; cur = cur.parentElement) {
      const s = seg(cur);
      parts.unshift(s);
      if (s.startsWith("#") || s.startsWith("[data-testid")) break;
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const cand = parts.slice(i).join(" > ");
      try {
        if (document.querySelectorAll(cand).length === 1) return cand;
      } catch {
      }
    }
    return parts.join(" > ");
  }

  // src/overlay/inspect.ts
  var STYLE_KEYS = [
    "display",
    "position",
    "width",
    "height",
    "padding",
    "margin",
    "gap",
    "color",
    "background-color",
    "font-size",
    "font-weight",
    "border-radius"
  ];
  function reactInfo(el) {
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    if (!key) return void 0;
    let f = el[key] ?? null;
    for (let i = 0; f && i < 30; i++, f = f.return ?? null) {
      const t = f.type;
      if (t && typeof t !== "string") {
        const name = t.displayName || t.name;
        if (name) {
          const src = f._debugSource;
          return src?.fileName ? { component: name, source: `${src.fileName}${src.lineNumber ? ":" + src.lineNumber : ""}` } : { component: name };
        }
      }
    }
    return void 0;
  }
  function inspectElement(el) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const styles = {};
    for (const k of STYLE_KEYS) {
      const v = cs.getPropertyValue(k);
      if (v && (k === "display" || v !== "none" && v !== "normal")) styles[k] = v;
    }
    const info = {
      selector: uniqueSelector(el),
      tag: el.tagName.toLowerCase(),
      classes: [...el.classList],
      text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
      rect: { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      styles
    };
    const react = reactInfo(el);
    if (react) info.react = react;
    return info;
  }

  // src/overlay/refresh.ts
  var DONE_EVENT = "cobro:done";
  function detectStrategy() {
    if (document.querySelector('script[src*="/@vite/client"]')) return "none";
    if (Object.keys(window).some((k) => k.startsWith("webpackHotUpdate"))) return "none";
    const next = window.__NEXT_DATA__;
    if (next?.buildId === "development") return "none";
    return "reload";
  }
  function applyDone(info, strategy, reload = () => location.reload()) {
    window.dispatchEvent(new CustomEvent(DONE_EVENT, { detail: info }));
    if (strategy === "reload") reload();
  }

  // src/overlay/index.ts
  (() => {
    if (window.top !== window) return;
    const PORT = __COBRO_PORT__;
    const TOKEN = __COBRO_TOKEN__;
    const boot = () => {
      if (document.documentElement.hasAttribute("data-cobro")) return;
      document.documentElement.setAttribute("data-cobro", "1");
      let session = null;
      let drafts = null;
      let current = null;
      let unlocked = false;
      let connected = false;
      let draftTimer = null;
      const pageInfo = () => ({ url: location.href, title: document.title, viewport: { w: innerWidth, h: innerHeight } });
      const newBatch = () => ({ id: crypto.randomUUID(), note: "", elements: [], status: "draft", createdAt: (/* @__PURE__ */ new Date()).toISOString() });
      const ensureCurrent = () => {
        drafts ??= [];
        let b = drafts.find((d) => d.id === current);
        if (!b) {
          b = newBatch();
          drafts.push(b);
          current = b.id;
        }
        return b;
      };
      const flushDraft = () => {
        if (draftTimer) {
          clearTimeout(draftTimer);
          draftTimer = null;
        }
        chan.send({ type: "draft", batches: drafts ?? [] });
      };
      const pushDraft = () => {
        if (draftTimer) clearTimeout(draftTimer);
        draftTimer = setTimeout(flushDraft, 300);
      };
      const vm = () => ({
        selecting: picker.isActive(),
        connected,
        agent: session?.agent ?? { status: "idle", text: "" },
        strategy: session ? session.strategy ?? session.detected : null,
        drafts: drafts ?? [],
        current,
        history: (session?.batches ?? []).filter((b) => b.status !== "draft").slice().reverse(),
        locked: !unlocked && (session?.agent.status === "sent" || session?.agent.status === "working")
      });
      const render = () => ui.render(vm());
      const addEl = (b, el, toggle) => {
        const info = inspectElement(el);
        const i = b.elements.findIndex((e) => e.selector === info.selector);
        if (i >= 0) {
          if (toggle) b.elements.splice(i, 1);
        } else b.elements.push(info);
      };
      const resolveDraft = (b) => ({ ...b, status: "draft", elements: b.elements.map((e, i) => {
        let found = null;
        try {
          found = document.querySelector(e.selector);
        } catch {
        }
        const missing = !found;
        if (missing !== !!e.missing) chan.send({ type: "resolved", batchId: b.id, index: i, missing });
        return { ...e, missing };
      }) });
      const ui = createUI({
        onToggleSelect: () => {
          picker.setActive(!picker.isActive());
          render();
        },
        onNoteInput: (id, note) => {
          const b = drafts?.find((d) => d.id === id);
          if (b) {
            b.note = note;
            pushDraft();
          }
        },
        onSelectBatch: (id) => {
          current = id;
          render();
        },
        onAddBatch: () => {
          drafts ??= [];
          const b = newBatch();
          drafts.push(b);
          current = b.id;
          pushDraft();
          render();
        },
        onRemoveElement: (id, i) => {
          const b = drafts?.find((d) => d.id === id);
          if (b) {
            b.elements.splice(i, 1);
            pushDraft();
            render();
          }
        },
        onSend: () => {
          const ready = (drafts ?? []).filter((b) => b.elements.length && b.note.trim());
          if (!ready.length) {
            ui.focusNote();
            return;
          }
          flushDraft();
          chan.send({ type: "send", batchIds: ready.map((b) => b.id), page: pageInfo() });
          drafts = (drafts ?? []).filter((b) => !ready.includes(b));
          current = null;
          unlocked = false;
          picker.setActive(false);
          render();
        },
        onRedo: (id) => chan.send({ type: "redo", batchId: id }),
        onUnlock: () => {
          unlocked = true;
          render();
        }
      });
      const picker = createPicker({
        root: ui.root,
        host: ui.host,
        onPick: (el) => {
          addEl(ensureCurrent(), el, true);
          pushDraft();
          render();
          ui.focusNote();
        },
        onBandPick: (els) => {
          const b = ensureCurrent();
          for (const el of els) addEl(b, el, false);
          pushDraft();
          render();
        }
      });
      window.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.shiftKey && e.code === "KeyF") {
          e.preventDefault();
          picker.setActive(!picker.isActive());
          render();
        } else if (e.key === "Escape" && picker.isActive()) {
          picker.setActive(false);
          render();
        }
      }, true);
      installGuards(ui.host);
      const onMessage = (m) => {
        if (m.type === "state") {
          session = m.session;
          const nonDraft = new Set(m.session.batches.filter((b) => b.status !== "draft").map((b) => b.id));
          const serverDrafts = m.session.batches.filter((b) => b.status === "draft");
          if (drafts === null) {
            drafts = serverDrafts.map(resolveDraft);
            current = drafts[drafts.length - 1]?.id ?? null;
          } else {
            drafts = drafts.filter((d) => !nonDraft.has(d.id));
            for (const b of serverDrafts) if (!nonDraft.has(b.id) && !drafts.some((d) => d.id === b.id)) {
              drafts.push(resolveDraft(b));
              current = b.id;
            }
          }
          render();
        } else if (m.type === "done") {
          ui.flash(m.info.selectors);
          flushDraft();
          applyDone(m.info, m.strategy);
        }
      };
      const chan = connectChannel({
        port: PORT,
        token: TOKEN,
        onMessage,
        onOpen: () => {
          connected = true;
          chan.send({ type: "page", page: pageInfo(), detected: detectStrategy() });
          render();
        },
        onClose: () => {
          connected = false;
          render();
        }
      });
      render();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  })();
})();
