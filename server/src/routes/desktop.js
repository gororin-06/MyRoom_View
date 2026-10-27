import { createDesktopConfig, viewerInstalled, probeDesktop } from "../clients/desktop.js";

export async function desktopRoutes(app, options = {}) {
  const settings = options.settings || createDesktopConfig();
  const installed = options.isInstalled || viewerInstalled;
  const probe = options.probe || probeDesktop;
  const state = () => ({ ...settings.read(), viewerInstalled: installed(), port: 28252 });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!["PUT", "POST"].includes(req.method)) return;
    let originHost = req.headers.host;
    try { if (req.headers.origin) originHost = new URL(req.headers.origin).host; } catch { originHost = null; }
    if (originHost !== req.headers.host || req.headers["sec-fetch-site"] === "cross-site") return reply.code(403).send({ error: "別サイトからの操作はできません" });
  });
  app.setErrorHandler((error, _req, reply) => reply.code(error.statusCode === 400 || error.validation ? 400 : 500).send({ error: error.statusCode === 400 ? error.message : error.validation ? "入力値を確認してください" : "拡張ディスプレイの処理に失敗しました" }));
  app.get("/api/desktop/config", async () => state());
  app.put("/api/desktop/config", { schema: { body: { type: "object", additionalProperties: false, properties: {
    enabled: { type: "boolean" }, name: { type: "string", maxLength: 80 }, host: { type: "string", maxLength: 64 },
    defaultTargetId: { type: "string", maxLength: 64 },
    targets: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, required: ["name", "host"], properties: {
      id: { type: "string", maxLength: 64 }, name: { type: "string", maxLength: 80 }, host: { type: "string", maxLength: 64 },
    } } },
  } } } }, async req => { settings.save(req.body); return state(); });
  app.post("/api/desktop/check", { schema: { querystring: { type: "object", properties: { targetId: { type: "string", maxLength: 64 } } } } }, async (req, reply) => {
    const cfg = settings.read();
    if (!cfg.enabled || !cfg.host) return reply.code(400).send({ error: "接続先を保存し、拡張ディスプレイを有効にしてください" });
    const target = cfg.targets.find(target => target.id === (req.query.targetId || cfg.defaultTargetId));
    if (!target) return reply.code(400).send({ error: "登録済みの接続先PCを選択してください" });
    return { ...await probe(target.host), viewerInstalled: installed() };
  });
}
