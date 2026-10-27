import { createMusicConfig, createMusicClient, MusicError } from "../clients/musicAssistant.js";

const string = { type: "string", maxLength: 2048 };
export async function musicRoutes(app, options = {}) {
  const settings = options.settings || createMusicConfig();
  const client = createMusicClient(settings, options.clientOptions);
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!["POST", "PUT"].includes(req.method)) return;
    if (req.headers["sec-fetch-site"] === "cross-site") return reply.code(403).send({ error: "別サイトからの操作はできません" });
    if (req.headers.origin) {
      let host;
      try { host = new URL(req.headers.origin).host; } catch { /* reject below */ }
      if (host !== req.headers.host) return reply.code(403).send({ error: "別サイトからの操作はできません" });
    }
  });
  app.setErrorHandler((err, _req, reply) => {
    const code = err instanceof MusicError ? err.statusCode : err.validation ? 400 : 500;
    reply.code(code).send({ error: err instanceof MusicError ? err.message : code === 400 ? "入力値を確認してください" : "音楽機能の処理に失敗しました" });
  });
  app.get("/api/music/config", async () => settings.publicValue());
  app.put("/api/music/config", {
    schema: { body: { type: "object", additionalProperties: false, properties: {
      enabled: { type: "boolean" }, url: string, token: { type: "string", maxLength: 8192 },
      clearToken: { type: "boolean" }, defaultPlayer: string,
    } } },
  }, async req => settings.save(req.body));
  app.get("/api/music/players", async () => ({ players: await client.players() }));
  app.get("/api/music/search", {
    schema: { querystring: { type: "object", required: ["q"], properties: {
      q: { type: "string", minLength: 1, maxLength: 200 },
      type: { type: "string", enum: ["track", "album", "playlist"], default: "track" },
    } } },
  }, async req => {
    const query = req.query.q.trim();
    if (!query) throw new MusicError("検索する曲名などを入力してください", 400);
    return { items: await client.search(query, req.query.type) };
  });
  app.post("/api/music/control", {
    schema: { body: { type: "object", additionalProperties: false, required: ["playerId", "action"], properties: {
      playerId: { ...string, minLength: 1 },
      action: { type: "string", enum: ["play_media", "play_pause", "stop", "next", "previous", "volume"] },
      uri: { ...string, minLength: 1 }, volume: { type: "integer", minimum: 0, maximum: 100 },
    } } },
  }, async req => {
    const { playerId, action, uri, volume } = req.body;
    if (action === "play_media" && !uri) throw new MusicError("再生する曲を選んでください", 400);
    if (action === "volume" && volume === undefined) throw new MusicError("音量を指定してください", 400);
    return client.control(playerId, action, { uri, volume });
  });
}
