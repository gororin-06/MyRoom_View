import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

export class MusicError extends Error {
  constructor(message, statusCode = 502) { super(message); this.statusCode = statusCode; }
}

const defaults = { enabled: false, url: "", token: "", defaultPlayer: "" };

function imageUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}
const seconds = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

// Separate from public settings: credentials must never enter /api/state or SSE.
export function createMusicConfig(file = path.join(config.dataDir, "music-assistant.json")) {
  function read() {
    try { return { ...defaults, ...JSON.parse(fs.readFileSync(file, "utf8")) }; }
    catch (e) { if (e.code === "ENOENT") return { ...defaults }; throw e; }
  }
  function publicValue() {
    const { token, ...value } = read();
    return { ...value, tokenConfigured: !!token };
  }
  function save(patch) {
    const next = read();
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    if (patch.url !== undefined) {
      const raw = patch.url.trim().replace(/\/+$/, "");
      if (raw) {
        let url;
        try { url = new URL(raw); } catch { throw new MusicError("接続先URLが正しくありません", 400); }
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
          throw new MusicError("接続先は認証情報・クエリーを含まないHTTP/HTTPSのURLにしてください", 400);
        }
      }
      // Never send an existing credential to a newly entered server by accident.
      if (raw !== next.url) next.token = "";
      next.url = raw;
    }
    if (patch.clearToken) next.token = "";
    if (patch.token?.trim()) next.token = patch.token.trim();
    if (/[\r\n]/.test(next.token)) throw new MusicError("トークンに改行を含めることはできません", 400);
    if (patch.defaultPlayer !== undefined) next.defaultPlayer = patch.defaultPlayer;
    if (next.enabled && (!next.url || !next.token)) throw new MusicError("有効にするには接続先URLとトークンが必要です", 400);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + ".tmp", JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(file + ".tmp", file);
    return publicValue();
  }
  return { read, publicValue, save };
}

export function createMusicClient(settings, { fetchImpl = fetch, timeout = 15_000 } = {}) {
  async function command(command, args = {}) {
    const cfg = settings.read();
    if (!cfg.enabled || !cfg.url || !cfg.token) throw new MusicError("設定画面でMusic Assistantの接続を有効にしてください", 503);
    let response;
    try {
      response = await fetchImpl(cfg.url + "/api", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(timeout),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.token },
        body: JSON.stringify({ message_id: randomUUID(), command, args }),
      });
    } catch { throw new MusicError("Music Assistantに接続できません。接続先・ネットワークを確認してください"); }
    if (response.status === 401 || response.status === 403) throw new MusicError("Music Assistantのトークン・操作権限を確認してください");
    if (!response.ok) throw new MusicError("Music Assistantが操作を受け付けませんでした（HTTP " + response.status + "）");
    // The HTTP API returns the command result directly (unlike WebSocket).
    try { return await response.json(); }
    catch { throw new MusicError("Music Assistantから正しい応答を取得できませんでした"); }
  }
  async function players() {
    const result = await command("players/all");
    if (!Array.isArray(result)) throw new MusicError("再生先一覧の応答形式を確認してください");
    return result.filter(p => p.enabled !== false).map(p => ({
      id: p.player_id, name: p.name || p.player_id, available: p.available === true,
      state: p.playback_state || p.state || "idle", volume: p.volume_level ?? null,
      title: p.current_media?.title || "", artist: p.current_media?.artist || "",
      image: imageUrl(p.current_media?.image_url),
      duration: seconds(p.current_media?.duration), elapsed: seconds(p.elapsed_time),
    }));
  }
  async function requirePlayer(id) {
    const player = (await players()).find(p => p.id === id);
    if (!player || !player.available) throw new MusicError("再生先がオフラインです。Windows PCと再生アプリを確認してください", 409);
    return player;
  }
  return {
    players,
    async search(query, type) {
      const result = await command("music/search", { search_query: query, media_types: [type], limit: 25 });
      const items = result[{ track: "tracks", album: "albums", playlist: "playlists" }[type]];
      if (!Array.isArray(items)) throw new MusicError("検索結果の応答形式を確認してください");
      return items.filter(i => i.uri).map(i => ({
        uri: i.uri, name: i.name, type: i.media_type || type,
        artist: (i.artists || []).map(a => a.name).join(" / "),
        provider: i.provider, available: i.available !== false,
        album: i.album?.name || "", duration: seconds(i.duration),
        image: (i.metadata?.images || []).map(image => imageUrl(image.path)).find(Boolean) || "",
      }));
    },
    async control(id, action, { uri, volume } = {}) {
      await requirePlayer(id);
      if (action === "play_media") {
        await command("player_queues/play_media", { queue_id: id, media: uri, option: "replace" });
      } else if (action === "volume") {
        await command("players/cmd/volume_set", { player_id: id, volume_level: volume });
      } else {
        await command("players/cmd/" + action, { player_id: id });
      }
      return { ok: true };
    },
  };
}
