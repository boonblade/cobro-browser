#!/usr/bin/env node

// src/server.ts
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "node:fs";
import { join as join2, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/core/store.ts
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
function emptySession() {
  return { version: 1, page: null, batches: [], agent: { status: "idle", text: "" }, strategy: null, detected: null };
}
var Store = class _Store {
  dir;
  file;
  shots;
  constructor(dir) {
    this.dir = dir;
    this.file = join(dir, "session.json");
    this.shots = join(dir, "shots");
    mkdirSync(this.shots, { recursive: true });
  }
  load() {
    if (!existsSync(this.file)) return null;
    try {
      const s = JSON.parse(readFileSync(this.file, "utf8"));
      return s && s.version === 1 && Array.isArray(s.batches) ? s : null;
    } catch {
      return null;
    }
  }
  save(session) {
    const tmp = this.file + "." + process.pid + ".tmp";
    writeFileSync(tmp, JSON.stringify(session, null, 2));
    renameSync(tmp, this.file);
  }
  static safe(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_");
  }
  shotPath(batchId) {
    return join(this.shots, _Store.safe(batchId) + ".png");
  }
  /** 사람이 요청한 스크린샷. prune은 shots/ 최상위만 훑으므로 여기 놓인 파일은 배치 샷을 밀어내지 않는다 */
  manualShotPath(name) {
    const dir = join(this.shots, "manual");
    mkdirSync(dir, { recursive: true });
    return join(dir, _Store.safe(name) + ".png");
  }
  pruneShots(keepIds, max = 50) {
    const keep = new Set(keepIds.map((id) => this.shotPath(id)));
    const files = readdirSync(this.shots).filter((f) => f.endsWith(".png")).map((f) => join(this.shots, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    let kept = 0;
    for (const f of files) {
      if (keep.has(f)) continue;
      if (kept < max) {
        kept++;
        continue;
      }
      unlinkSync(f);
    }
  }
};

// src/core/session.ts
import { EventEmitter } from "node:events";
var SessionCore = class extends EventEmitter {
  constructor(store2) {
    super();
    this.store = store2;
    this.s = store2.load() ?? emptySession();
    if (this.s.agent.status === "waiting" || this.s.agent.status === "working") this.s.agent = { status: "idle", text: "" };
  }
  s;
  queue = [];
  waiter = null;
  get session() {
    return this.s;
  }
  commit() {
    this.store.save(this.s);
    this.emit("change", this.s);
  }
  setPage(page, detected) {
    this.s.page = page;
    this.s.detected = detected;
    this.commit();
  }
  setStrategy(strategy) {
    this.s.strategy = strategy;
    this.commit();
  }
  effectiveStrategy() {
    return this.s.strategy ?? this.s.detected ?? "reload";
  }
  setDrafts(batches) {
    const others = this.s.batches.filter((b) => b.status !== "draft");
    this.s.batches = [...others, ...batches.map((b) => ({ ...b, status: "draft" }))];
    this.commit();
  }
  markSent(batchIds, page) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const sent = [];
    for (const b of this.s.batches) {
      if (b.status === "sent") b.status = "unanswered";
      if (b.status === "draft" && batchIds.includes(b.id)) {
        b.status = "sent";
        b.sentAt = now;
        sent.push(b);
      }
    }
    this.s.page = page;
    this.s.agent = { status: "sent", text: "" };
    this.commit();
    return sent;
  }
  setScreenshot(batchId, path) {
    const b = this.s.batches.find((x) => x.id === batchId);
    if (!b) return;
    b.screenshot = path;
    this.commit();
  }
  deliver(payload, extra = {}) {
    const item = { payload, ...extra };
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.resolve({ status: "sent", ...item });
    } else this.queue.push(item);
  }
  wait(timeoutMs, onTick, opts = {}) {
    if (this.waiter) {
      const prev = this.waiter;
      this.waiter = null;
      prev.resolve({ status: "pending" });
    }
    const queued = this.queue.shift();
    if (queued) return Promise.resolve({ status: "sent", ...queued });
    if (this.s.agent.status !== "sent") {
      this.s.agent = { status: "waiting", text: "" };
      this.commit();
    }
    const tickMs2 = opts.tickMs ?? 3e4;
    const started = Date.now();
    return new Promise((resolve) => {
      const finish = (r) => {
        clearInterval(iv);
        clearTimeout(to);
        opts.signal?.removeEventListener("abort", onAbort);
        if (this.waiter?.resolve === wrapped) this.waiter = null;
        resolve(r);
      };
      const wrapped = (r) => finish(r);
      const onAbort = () => finish({ status: "pending" });
      const iv = setInterval(() => {
        void onTick?.(Date.now() - started);
      }, tickMs2);
      const to = setTimeout(() => finish({ status: "pending" }), timeoutMs);
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      this.waiter = { resolve: wrapped };
    });
  }
  setAgentText(text2) {
    this.s.agent = { status: "working", text: text2 };
    this.commit();
  }
  done(info) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const out = [];
    for (const b of this.s.batches) if (b.status === "sent") {
      b.status = "done";
      b.doneAt = now;
      b.summary = info.summary;
      out.push(b);
    }
    this.s.agent = { status: "done", text: info.summary };
    this.store.pruneShots(this.s.batches.filter((b) => b.status !== "done").map((b) => b.id));
    this.commit();
    return out;
  }
  markResolved(batchId, index, missing) {
    const e = this.s.batches.find((b) => b.id === batchId)?.elements[index];
    if (!e) return;
    e.missing = missing;
    this.commit();
  }
};

// src/channel/server.ts
import { WebSocketServer, WebSocket } from "ws";
var ChannelServer = class {
  constructor(opts) {
    this.opts = opts;
  }
  wss = null;
  authed = /* @__PURE__ */ new Set();
  listen() {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
      this.wss = wss;
      wss.once("error", reject);
      wss.on("listening", () => {
        const addr = wss.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
      wss.on("connection", (ws) => {
        const reply = (m) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
        };
        const authTimer = setTimeout(() => {
          if (!this.authed.has(ws)) {
            console.error("[cobro] channel: unauthorized connection closed (auth timeout)");
            ws.close(4001, "auth timeout");
          }
        }, this.opts.authTimeoutMs ?? 3e3);
        authTimer.unref();
        ws.on("message", (data) => {
          let msg;
          try {
            msg = JSON.parse(data.toString());
          } catch {
            return;
          }
          if (!this.authed.has(ws)) {
            if (msg?.type === "hello" && msg.token === this.opts.token) {
              clearTimeout(authTimer);
              this.authed.add(ws);
              this.opts.onConnect?.(reply);
            } else {
              console.error("[cobro] channel: unauthorized connection closed (invalid auth message)");
              ws.close(4001, "unauthorized");
            }
            return;
          }
          if (msg?.type === "hello") return;
          try {
            this.opts.onMessage(msg, reply);
          } catch (e) {
            console.error("[cobro] channel: handler failed", e.message);
          }
        });
        ws.on("close", () => {
          clearTimeout(authTimer);
          this.authed.delete(ws);
        });
        ws.on("error", () => {
        });
      });
    });
  }
  broadcast(m) {
    const s = JSON.stringify(m);
    for (const ws of this.authed) if (ws.readyState === WebSocket.OPEN) ws.send(s);
  }
  clientCount() {
    return this.authed.size;
  }
  close() {
    return new Promise((resolve) => {
      if (!this.wss) return resolve();
      for (const ws of this.wss.clients) ws.terminate();
      this.wss.close(() => resolve());
      this.wss = null;
      this.authed.clear();
    });
  }
};

// src/core/payload.ts
function dedupeConsole(entries, max = 10) {
  const map = /* @__PURE__ */ new Map();
  for (const e of entries) {
    const text2 = e.text.slice(0, 300);
    const key = e.level + "\n" + text2;
    const cur = map.get(key);
    if (cur) {
      cur.count++;
      if (e.at > cur.last) cur.last = e.at;
    } else map.set(key, { level: e.level, text: text2, count: 1, last: e.at });
  }
  return [...map.values()].sort((a, b) => a.last < b.last ? 1 : a.last > b.last ? -1 : 0).slice(0, max);
}
function buildPayload(input) {
  return {
    origin: "human",
    sentAt: (input.now ?? /* @__PURE__ */ new Date()).toISOString(),
    page: input.page,
    batches: input.batches.map((b) => ({ id: b.id, note: b.note, elements: b.elements, ...b.screenshot ? { screenshot: b.screenshot } : {} })),
    console: input.console,
    refreshStrategy: input.refreshStrategy
  };
}

// src/bridge.ts
async function createBridge(opts) {
  const core = new SessionCore(opts.store);
  const channel = new ChannelServer({
    token: opts.token,
    onConnect: (reply) => reply({ type: "state", session: core.session }),
    onMessage: (msg) => {
      const bad = (why) => console.error(`[cobro] bridge: ${msg.type} \uBA54\uC2DC\uC9C0\uB97C \uBB34\uC2DC\uD55C\uB2E4 \u2014 ${why}`);
      switch (msg.type) {
        case "page":
          if (!msg.page || typeof msg.page.url !== "string") return bad("page.url\uC774 \uC5C6\uB2E4");
          core.setPage(msg.page, msg.detected);
          break;
        case "draft":
          if (!Array.isArray(msg.batches)) return bad("batches\uAC00 \uBC30\uC5F4\uC774 \uC544\uB2C8\uB2E4");
          core.setDrafts(msg.batches);
          break;
        case "resolved":
          if (typeof msg.batchId !== "string") return bad("batchId\uAC00 \uBB38\uC790\uC5F4\uC774 \uC544\uB2C8\uB2E4");
          core.markResolved(msg.batchId, msg.index, msg.missing);
          break;
        case "send": {
          if (!Array.isArray(msg.batchIds) || !msg.page || typeof msg.page.url !== "string") return bad("batchIds \uBC30\uC5F4\uC774\uB098 page.url\uC774 \uC5C6\uB2E4");
          const page = msg.page;
          const batchIds = msg.batchIds;
          void (async () => {
            let batches = [];
            try {
              batches = core.markSent(batchIds, page);
              for (const b of batches) {
                try {
                  const p = await opts.screenshot?.(b, page);
                  if (p) core.setScreenshot(b.id, p);
                } catch (e) {
                  console.error("[cobro] screenshot failed", e.message);
                }
              }
              core.deliver(buildPayload({ page, batches, console: opts.consoleEntries?.() ?? [], refreshStrategy: core.effectiveStrategy() }));
            } catch (e) {
              console.error("[cobro] send \uCC98\uB9AC \uC2E4\uD328 \u2014 \uCD5C\uC18C \uD398\uC774\uB85C\uB4DC\uB85C \uBC30\uB2EC\uD55C\uB2E4", e.message);
              if (batches.length === 0) batches = core.session.batches.filter((b) => batchIds.includes(b.id));
              core.deliver({
                origin: "human",
                sentAt: (/* @__PURE__ */ new Date()).toISOString(),
                page,
                batches: batches.map((b) => ({ id: b.id, note: b.note, elements: b.elements })),
                console: [],
                refreshStrategy: core.effectiveStrategy()
              });
            }
          })().catch((e) => console.error("[cobro] send \uBCF5\uAD6C \uC2E4\uD328 \u2014 \uC774 \uC804\uC1A1\uC740 \uBC30\uB2EC\uB418\uC9C0 \uC54A\uB294\uB2E4", e.message));
          break;
        }
      }
    }
  });
  core.on("change", (s) => channel.broadcast({ type: "state", session: s }));
  const port = await channel.listen();
  return {
    core,
    channel,
    port,
    token: opts.token,
    done(info) {
      const out = core.done(info);
      channel.broadcast({ type: "done", info, strategy: core.effectiveStrategy() });
      return out;
    },
    close: () => channel.close()
  };
}

// src/browser/launcher.ts
import { chromium, webkit, firefox } from "playwright-core";
var INSTALL_HINT = "Chrome \uB610\uB294 Edge\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. Chrome\uC744 \uC124\uCE58\uD558\uAC70\uB098 COBRO_BROWSER_CHANNEL(chrome|msedge|chromium)\uC744 \uC9C0\uC815\uD558\uC138\uC694. \uBC88\uB4E4 Chromium: npx playwright-core install chromium\nWebKit/Firefox \uC5D4\uC9C4: npx playwright-core install webkit firefox";
function parseEngine(v) {
  return v === "webkit" || v === "firefox" || v === "chromium" ? v : "chromium";
}
function channelOrder(explicit, env) {
  const named = [...new Set([explicit, env, "chrome", "msedge"].filter((c) => !!c))];
  return [...named, void 0];
}
function chromiumLaunchOptions(o) {
  return {
    headless: o.headless,
    channel: o.channel === "chromium" ? void 0 : o.channel,
    bypassCSP: true,
    viewport: null,
    args: ["--disable-infobars"],
    ignoreDefaultArgs: ["--enable-automation"],
    chromiumSandbox: o.sandbox
  };
}
var BrowserLauncher = class {
  constructor(opts) {
    this.opts = opts;
  }
  ctx = null;
  page = null;
  launchedOnce = false;
  raw = [];
  isAlive() {
    return !!this.ctx && !!this.page && !this.page.isClosed();
  }
  wasLaunched() {
    return this.launchedOnce;
  }
  injected() {
    return this.opts.overlaySource.replace(/__COBRO_PORT__/g, String(this.opts.port)).replace(/__COBRO_TOKEN__/g, JSON.stringify(this.opts.token));
  }
  async launch() {
    const engine2 = this.opts.engine ?? "chromium";
    if (engine2 !== "chromium") {
      const type = engine2 === "webkit" ? webkit : firefox;
      try {
        this.ctx = await type.launchPersistentContext(this.opts.profileDir, {
          headless: this.opts.headless ?? false,
          bypassCSP: true,
          viewport: null
        });
      } catch (e) {
        throw new Error(INSTALL_HINT + "\n" + engine2 + ": " + e.message.split("\n")[0]);
      }
    } else {
      const tried = [];
      const order = channelOrder(this.opts.channel, process.env.COBRO_BROWSER_CHANNEL);
      for (const sandbox of [true, false]) {
        for (const channel of order) {
          try {
            this.ctx = await chromium.launchPersistentContext(this.opts.profileDir, chromiumLaunchOptions({
              headless: this.opts.headless ?? false,
              channel,
              sandbox
            }));
            break;
          } catch (e) {
            tried.push(`${channel ?? "bundled"}${sandbox ? "" : " (no-sandbox)"}: ${e.message.split("\n")[0]}`);
            this.ctx = null;
          }
        }
        if (this.ctx) {
          if (!sandbox) console.error("[cobro] Chromium \uC0CC\uB4DC\uBC15\uC2A4\uB97C \uCF1C\uACE0 \uB744\uC6B0\uC9C0 \uBABB\uD574 --no-sandbox\uB85C \uC2E4\uD589\uD55C\uB2E4 \u2014 \uBE0C\uB77C\uC6B0\uC800\uAC00 \uACBD\uACE0 \uC904\uC744 \uD45C\uC2DC\uD55C\uB2E4");
          break;
        }
      }
      if (!this.ctx) throw new Error(INSTALL_HINT + "\n" + tried.join("\n"));
    }
    await this.ctx.addInitScript(this.injected());
    this.page = this.ctx.pages()[0] ?? await this.ctx.newPage();
    this.attach(this.page);
    this.ctx.on("close", () => {
      this.ctx = null;
      this.page = null;
    });
    this.ctx.on("page", (p) => {
      this.page = p;
      this.attach(p);
    });
  }
  attach(p) {
    const push = (level, text2) => {
      this.raw.push({ level, text: text2, at: (/* @__PURE__ */ new Date()).toISOString() });
      if (this.raw.length > 200) this.raw.splice(0, this.raw.length - 200);
    };
    p.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") push(m.type(), m.text());
    });
    p.on("pageerror", (e) => push("pageerror", e.message));
    p.on("requestfailed", (r) => push("requestfailed", `${r.method()} ${r.url()} \u2014 ${r.failure()?.errorText ?? ""}`));
    p.on("load", () => {
      if (p === this.page) this.raw = [];
    });
  }
  async open(url) {
    const restarted = !this.isAlive() && this.launchedOnce;
    if (!this.isAlive()) {
      await this.launch();
      this.launchedOnce = true;
    }
    await this.page.goto(url, { waitUntil: "load" });
    return { title: await this.page.title(), restarted };
  }
  async rectOfSelector(selector) {
    const p = this.page;
    const box = await p.locator(selector).first().boundingBox({ timeout: 2e3 }).catch(() => null);
    if (!box) {
      console.error(`[cobro] screenshot: selector\uB85C \uC694\uC18C\uB97C \uCC3E\uC9C0 \uBABB\uD574 \uBDF0\uD3EC\uD2B8\uB97C \uCC0D\uB294\uB2E4 \u2014 ${selector}`);
      return void 0;
    }
    const scroll = await p.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    return { x: box.x + scroll.x, y: box.y + scroll.y, w: box.width, h: box.height };
  }
  async screenshot(opts) {
    if (!this.isAlive()) throw new Error("browser not open");
    const p = this.page;
    const rect = opts.rect ?? (opts.selector ? await this.rectOfSelector(opts.selector) : void 0);
    if (rect) {
      const pad = 16;
      const clip = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: Math.max(1, rect.w + pad * 2), height: Math.max(1, rect.h + pad * 2) };
      try {
        await p.screenshot({ path: opts.outPath, clip, fullPage: true });
        return opts.outPath;
      } catch (e) {
        console.error("[cobro] clip screenshot failed, falling back to viewport", e.message);
      }
    }
    await p.screenshot({ path: opts.outPath });
    return opts.outPath;
  }
  consoleEntries() {
    return dedupeConsole(this.raw);
  }
  async close() {
    const c = this.ctx;
    this.ctx = null;
    this.page = null;
    if (c) await c.close().catch(() => {
    });
  }
};

// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
var text = (v) => ({ content: [{ type: "text", text: JSON.stringify(v) }] });
function createMcpServer(deps) {
  const { core, browser } = deps;
  const server = new McpServer({ name: "cobro-browser", version: deps.version });
  let restartedPending = false;
  const browserGone = () => browser.wasLaunched() && !browser.isAlive();
  server.registerTool("open", {
    description: "URL\uC744 \uC804\uC6A9 \uBE0C\uB77C\uC6B0\uC800\uC5D0 \uC5F4\uACE0 \uD53C\uB4DC\uBC31 \uC624\uBC84\uB808\uC774\uB97C \uCF20\uB2E4. \uBE0C\uB77C\uC6B0\uC800\uAC00 \uC5C6\uC73C\uBA74 \uB744\uC6B4\uB2E4. \uC800\uC7A5\uB41C \uCD08\uC548\xB7\uC774\uB825\uC744 \uBCF5\uAD6C\uD55C\uB2E4.",
    inputSchema: { url: z.string().url(), strategy: z.enum(["none", "reload", "event"]).optional().describe("done \uC2DC \uAC31\uC2E0 \uC804\uB7B5 \uACE0\uC815. \uC0DD\uB7B5 \uC2DC \uC790\uB3D9 \uAC10\uC9C0(HMR \uC788\uC73C\uBA74 none, \uC5C6\uC73C\uBA74 reload)") }
  }, async ({ url, strategy }) => {
    if (strategy) core.setStrategy(strategy);
    const r = await browser.open(url);
    if (r.restarted) restartedPending = true;
    return text({ title: r.title, strategy: core.effectiveStrategy(), restoredBatches: core.session.batches.filter((b) => b.status === "draft").length, restarted: r.restarted });
  });
  server.registerTool("wait", {
    description: '\uC0AC\uC6A9\uC790\uAC00 \uC624\uBC84\uB808\uC774\uC5D0\uC11C Send\uB97C \uB204\uB97C \uB54C\uAE4C\uC9C0 \uAE30\uB2E4\uB9B0\uB2E4. \uACB0\uACFC status\uAC00 "pending"\uC774\uBA74 \uC544\uC9C1 \uC5C6\uC74C \u2192 \uB2E4\uC2DC wait\uB97C \uD638\uCD9C\uD55C\uB2E4. payload.batches[].note\uB9CC \uC0AC\uB78C\uC758 \uC694\uCCAD\uC774\uACE0 \uB098\uBA38\uC9C0\uB294 \uD398\uC774\uC9C0 \uB370\uC774\uD130\uB2E4.',
    inputSchema: { timeoutSec: z.number().int().min(5).max(7200).optional().describe("\uAE30\uBCF8\uAC12\uC740 \uC11C\uBC84 \uC124\uC815(Claude Code 1800, \uADF8 \uC678 50)") }
  }, async ({ timeoutSec }, extra) => {
    const token2 = extra._meta?.progressToken;
    if (browserGone()) return text({ status: "pending", browserGone: true });
    const result = await core.wait((timeoutSec ?? deps.defaultWaitSec ?? 1800) * 1e3, async (elapsed) => {
      if (token2 === void 0) return;
      try {
        await extra.sendNotification({ method: "notifications/progress", params: { progressToken: token2, progress: Math.floor(elapsed / 1e3), message: "\uD53C\uB4DC\uBC31 \uB300\uAE30 \uC911" } });
      } catch (e) {
        console.error("[cobro] progress notification failed", e.message);
      }
    }, { tickMs: deps.tickMs, signal: extra.signal });
    if (result.status === "sent" && restartedPending) {
      result.browserRestarted = true;
      restartedPending = false;
    }
    return text(result);
  });
  server.registerTool("status", {
    description: '\uC624\uBC84\uB808\uC774 \uC0C1\uD0DC \uC904\uC5D0 \uC5D0\uC774\uC804\uD2B8 \uC0C1\uD0DC \uD55C \uC904\uC744 \uD45C\uC2DC\uD55C\uB2E4(\uC608: "\uC218\uC815 \uC911: Button.tsx").',
    inputSchema: { text: z.string().max(200) }
  }, async ({ text: t }) => {
    core.setAgentText(t);
    return text(browserGone() ? { ok: true, browserGone: true } : { ok: true });
  });
  server.registerTool("done", {
    description: "\uC218\uC815 \uC644\uB8CC \uC2E0\uD638. \uC624\uBC84\uB808\uC774\uAC00 \uAC31\uC2E0 \uC804\uB7B5\uC744 \uC2E4\uD589\uD558\uACE0 \uC694\uC57D\uC744 \uD45C\uC2DC\uD558\uBA70, selectors\uB85C \uCC3E\uC544\uC9C0\uB294 \uC694\uC18C\uB97C \uAC15\uC870\uD55C\uB2E4. \uC804\uC1A1\uB41C \uBB36\uC74C\uC744 \uCC98\uB9AC\uB428\uC73C\uB85C \uBC14\uAFBC\uB2E4. \uB9E4 \uC218\uC815 \uD6C4 \uBC18\uB4DC\uC2DC \uD638\uCD9C.",
    inputSchema: { summary: z.string().max(500), selectors: z.array(z.string()).optional(), changedFiles: z.array(z.string()).optional() }
  }, async ({ summary, selectors, changedFiles }) => {
    const out = deps.done({ summary, selectors: selectors ?? [], changedFiles: changedFiles ?? [] });
    return text(browserGone() ? { ok: true, doneBatches: out.length, browserGone: true } : { ok: true, doneBatches: out.length });
  });
  server.registerTool("screenshot", {
    description: "\uD604\uC7AC \uD654\uBA74\uC744 PNG \uD30C\uC77C\uB85C \uC800\uC7A5\uD558\uACE0 \uACBD\uB85C\uB97C \uB3CC\uB824\uC900\uB2E4. \uC774\uBBF8\uC9C0\uB294 \uB300\uD654\uC5D0 \uB123\uC9C0 \uC54A\uB294\uB2E4.",
    inputSchema: { selector: z.string().optional().describe("\uC774 \uC120\uD0DD\uC790\uB85C \uCC3E\uC740 \uCCAB \uC694\uC18C \uC8FC\uBCC0\uB9CC \uC798\uB77C\uB0B8\uB2E4. \uC0DD\uB7B5 \uC2DC \uBDF0\uD3EC\uD2B8") }
  }, async ({ selector }) => text({ path: await browser.screenshot({ selector, outPath: deps.manualShotPath("manual-" + Date.now()) }) }));
  server.registerTool(
    "close",
    { description: "\uBE0C\uB77C\uC6B0\uC800\uB97C \uB2EB\uACE0 \uC138\uC158\uC744 \uC815\uB9AC\uD55C\uB2E4.", inputSchema: {} },
    async () => {
      try {
        await browser.close();
      } catch (e) {
        console.error("[cobro] browser close failed", e.message);
      } finally {
        await deps.onClose?.();
      }
      return text({ ok: true });
    }
  );
  return server;
}

// src/server.ts
var here = dirname(fileURLToPath(import.meta.url));
var overlaySource = readFileSync2(join2(here, "overlay.js"), "utf8");
var { version } = JSON.parse(readFileSync2(join2(here, "..", "package.json"), "utf8"));
var stateDir = process.env.COBRO_STATE_DIR ?? join2(process.cwd(), ".cobro");
var engine = parseEngine(process.env.COBRO_BROWSER);
if (process.env.COBRO_BROWSER && engine !== process.env.COBRO_BROWSER) console.error(`[cobro] COBRO_BROWSER=${process.env.COBRO_BROWSER} \uBB34\uC2DC \u2014 chromium|webkit|firefox \uC911 \uD558\uB098. chromium \uC0AC\uC6A9`);
var profileDir = join2(process.env.COBRO_PROFILE_DIR ?? join2(homedir(), ".cobro", "profile"), engine);
var envInt = (v, min, name) => {
  const n = Number(v);
  if (v !== void 0 && Number.isFinite(n) && n >= min) return n;
  if (v !== void 0) console.error(`[cobro] ${name}=${v} \uBB34\uC2DC \u2014 ${min} \uC774\uC0C1\uC758 \uC218\uB9CC \uBC1B\uB294\uB2E4. \uAE30\uBCF8\uAC12\uC744 \uC4F4\uB2E4`);
  return void 0;
};
var defaultWaitSec = envInt(process.env.COBRO_WAIT_SEC, 5, "COBRO_WAIT_SEC") ?? 1800;
var tickMs = envInt(process.env.COBRO_TICK_MS, 1e3, "COBRO_TICK_MS");
var token = randomBytes(24).toString("hex");
var store = new Store(stateDir);
var configStrategy = () => {
  const file = join2(stateDir, "config.json");
  if (!existsSync2(file)) return void 0;
  try {
    const v = JSON.parse(readFileSync2(file, "utf8")).refreshStrategy;
    if (v === "none" || v === "reload" || v === "event") return v;
    if (v !== void 0) console.error(`[cobro] ${file}\uC758 refreshStrategy \uBB34\uC2DC \u2014 none|reload|event\uB9CC \uBC1B\uB294\uB2E4`);
  } catch (e) {
    console.error(`[cobro] ${file}\uC744 \uC77D\uC9C0 \uBABB\uD574 \uBB34\uC2DC\uD55C\uB2E4: ${e.message}`);
  }
  return void 0;
};
var union = (rects) => {
  if (!rects.length) return void 0;
  const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
};
var launcher = null;
var bridge = await createBridge({
  store,
  token,
  screenshot: async (b) => launcher?.isAlive() ? launcher.screenshot({ rect: union(b.elements.filter((e) => !e.missing).map((e) => e.rect)), outPath: store.shotPath(b.id) }) : void 0,
  consoleEntries: () => launcher?.consoleEntries() ?? []
});
var fixed = configStrategy();
if (fixed) bridge.core.setStrategy(fixed);
launcher = new BrowserLauncher({ overlaySource, port: bridge.port, token, profileDir, headless: process.env.COBRO_HEADLESS === "1", engine });
var mcp = createMcpServer({
  core: bridge.core,
  browser: launcher,
  done: (info) => bridge.done(info),
  manualShotPath: (n) => store.manualShotPath(n),
  defaultWaitSec,
  tickMs,
  version,
  onClose: async () => {
  }
});
await mcp.connect(new StdioServerTransport());
console.error(`[cobro] ready \xB7 state=${stateDir} \xB7 ws=127.0.0.1:${bridge.port}`);
var closing = false;
var shutdown = async () => {
  if (closing) return;
  closing = true;
  await Promise.race([Promise.all([launcher?.close(), bridge.close()]), new Promise((r) => setTimeout(r, 5e3))]);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.on("close", shutdown);
