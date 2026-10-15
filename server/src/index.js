import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import { config } from "./config.js";
import { getSettings, saveSettings, DEFAULT_SETTINGS } from "./settings.js";
import { startPolling, getState, subscribe, refreshAfterSettingsChange } from "./services/poller.js";
import * as remo from "./clients/natureRemo.js";
import { checkAndMaybeUpdate, getUpdateStatus, latestRelease } from "./services/updater.js";

const app = Fastify({ logger: { level: "info", transport: undefined } });

// 静的ファイル（フロント）
app.register(fastifyStatic, { root: config.webDir, prefix: "/" });

// ---- API ----
app.get("/api/state", async () => getState());

// SSE: リアルタイム配信
app.get("/api/stream", (req, reply) => {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const unsub = subscribe(reply);
  req.raw.on("close", unsub);
});

// エアコン操作
app.post("/api/aircon", async (req, reply) => {
  const s = getState();
  const id = s.aircon?.id;
  if (!id) return reply.code(503).send({ error: "エアコンがまだ取得できていません" });
  try {
    await remo.setAircon(id, req.body || {});
    // 反映を待って再取得
    setTimeout(async () => {
      try { const r = await remo.getState(); } catch {}
    }, 500);
    return { ok: true };
  } catch (e) {
    return reply.code(502).send({ error: String(e.message) });
  }
});

// 設定
app.get("/api/settings", async () => getSettings());
app.put("/api/settings", async (req) => {
  const allowed = Object.keys(DEFAULT_SETTINGS);
  const patch = {};
  for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
  const next = saveSettings(patch);
  refreshAfterSettingsChange();
  return next;
});

// アップデート
app.get("/api/update", async () => getUpdateStatus());
app.post("/api/update/check", async () => {
  await checkAndMaybeUpdate(app.log);
  return getUpdateStatus();
});
app.get("/api/update/latest", async (_req, reply) => {
  try { return await latestRelease(); } catch (e) { return reply.code(502).send({ error: String(e.message) }); }
});

// 災害情報だけ欲しい時用
app.get("/api/disaster", async () => {
  const s = getState();
  return { warnings: s.warnings, quake: s.quake, typhoon: s.typhoon };
});

// ヘルスチェック
app.get("/api/health", async () => ({ ok: true, version: getUpdateStatus().current }));

// /settings で設定ページを返す
app.get("/settings", (req, reply) => reply.sendFile("settings.html"));

async function main() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  startPolling(app.log);
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`MyRoom View: http://${config.host}:${config.port}`);
  if (!config.natureRemo.token) app.log.warn("NATURE_REMO_TOKEN 未設定（室温・エアコンは取得できません）");
}
main().catch((e) => { app.log.error(e); process.exit(1); });
