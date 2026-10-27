import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { createMusicConfig, createMusicClient } from "../server/src/clients/musicAssistant.js";
import { musicRoutes } from "../server/src/routes/music.js";
import { getState } from "../server/src/services/poller.js";

const player = { player_id: "windows-office", name: "音楽用Windows PC", available: true, enabled: true,
  playback_state: "playing", volume_level: 36, current_media: { title: "テスト曲", artist: "歌手" } };

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "myroom-music-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const settings = createMusicConfig(path.join(dir, "music-assistant.json"));
  const calls = [];
  const upstream = Fastify();
  let mode = "ok";
  upstream.post("/api", async (req, reply) => {
    calls.push({ ...req.body, authorization: req.headers.authorization });
    if (mode === "auth") return reply.code(401).send("Do not expose upstream-token-secret");
    if (mode === "redirect") return reply.redirect("http://127.0.0.1:1/steal");
    if (mode === "invalid") return reply.type("text/html").send("<html>Proxy failure</html>");
    if (mode === "slow") { await new Promise(resolve => setTimeout(resolve, 100)); return []; }
    if (req.body.command === "players/all") return mode === "offline" ? [{ ...player, available: false }] : [player];
    if (req.body.command === "music/search") return {
      tracks: [{ uri: "ytmusic://track/abc", name: "曲<&>", media_type: "track", artists: [{ name: "歌手" }], provider: "ytmusic--one", available: true }],
      albums: [], playlists: [{ uri: "library://playlist/1", name: "お気に入り", media_type: "playlist" }],
    };
    return null;
  });
  await upstream.listen({ host: "127.0.0.1", port: 0 });
  t.after(() => upstream.close());
  const url = "http://127.0.0.1:" + upstream.server.address().port;
  const app = Fastify();
  app.register(musicRoutes, { settings }); await app.ready(); t.after(() => app.close());
  return { settings, app, calls, url, mode: value => { mode = value; },
    connect: () => settings.save({ enabled: true, url, token: "upstream-token-secret" }) };
}

test("connection settings persist privately; URL change requires a new credential", async t => {
  const f = await fixture(t);
  assert.equal(f.settings.publicValue().enabled, false);
  const response = await f.app.inject({ method: "PUT", url: "/api/music/config", payload: { enabled: true, url: f.url, token: "upstream-token-secret" } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().tokenConfigured, true);
  assert.ok(!response.body.includes("upstream-token-secret"));
  f.settings.save({ defaultPlayer: player.player_id, token: "" });
  assert.equal(f.settings.read().token, "upstream-token-secret");
  assert.equal(f.settings.publicValue().defaultPlayer, player.player_id);
  assert.throws(() => f.settings.save({ url: "http://different-host:8095" }), /トークン/);
  assert.equal(f.settings.read().url, f.url);
  assert.throws(() => f.settings.save({ url: "file:///etc/passwd" }), /HTTP/);
  f.settings.save({ enabled: false, clearToken: true });
  assert.equal(f.settings.publicValue().tokenConfigured, false);
  assert.ok(!JSON.stringify(getState()).includes("upstream-token-secret"));
});

test("HTTP API returns raw results; search, playlist playback and commands use upstream arguments", async t => {
  const f = await fixture(t); f.connect();
  const players = await f.app.inject("/api/music/players");
  assert.equal(players.statusCode, 200);
  assert.deepEqual(players.json().players[0], { id: player.player_id, name: player.name, available: true, state: "playing", volume: 36, title: "テスト曲", artist: "歌手", image: "", duration: null, elapsed: null });
  let result = await f.app.inject("/api/music/search?q=" + encodeURIComponent("歌手") + "&type=track");
  assert.equal(result.json().items[0].uri, "ytmusic://track/abc");
  assert.deepEqual(f.calls.at(-1).args, { search_query: "歌手", media_types: ["track"], limit: 25 });
  result = await f.app.inject("/api/music/search?q=test&type=playlist");
  assert.equal(result.json().items[0].uri, "library://playlist/1");
  for (const [action, extra, command, args] of [
    ["play_media", { uri: "library://playlist/1" }, "player_queues/play_media", { queue_id: player.player_id, media: "library://playlist/1", option: "replace" }],
    ["volume", { volume: 0 }, "players/cmd/volume_set", { player_id: player.player_id, volume_level: 0 }],
    ...["play_pause", "previous", "next", "stop"].map(action => [action, {}, "players/cmd/" + action, { player_id: player.player_id }]),
  ]) {
    const response = await f.app.inject({ method: "POST", url: "/api/music/control", payload: { playerId: player.player_id, action, ...extra } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(f.calls.at(-1).command, command);
    assert.deepEqual(f.calls.at(-1).args, args);
    assert.equal(f.calls.at(-1).authorization, "Bearer upstream-token-secret");
  }
});

test("disabled integration, bad input, cross-site requests and offline players fail without playback", async t => {
  const f = await fixture(t);
  assert.equal((await f.app.inject("/api/music/players")).statusCode, 503);
  f.connect();
  for (const payload of [
    { playerId: player.player_id, action: "volume", volume: 101 },
    { playerId: player.player_id, action: "volume" },
    { playerId: player.player_id, action: "play_media" },
    { playerId: player.player_id, action: "arbitrary_command" },
  ]) assert.equal((await f.app.inject({ method: "POST", url: "/api/music/control", payload })).statusCode, 400);
  assert.equal((await f.app.inject("/api/music/search?q=%20")).statusCode, 400);
  assert.equal((await f.app.inject("/api/music/search?q=a&type=unknown")).statusCode, 400);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.app.inject({ method: "PUT", url: "/api/music/config", headers: { origin: "https://evil.example" }, payload: { enabled: false } })).statusCode, 403);
  assert.equal(f.settings.read().enabled, true);
  f.mode("offline");
  const offline = await f.app.inject({ method: "POST", url: "/api/music/control", payload: { playerId: player.player_id, action: "next" } });
  assert.equal(offline.statusCode, 409);
  assert.ok(f.calls.every(c => c.command === "players/all"));
});

test("authentication, redirect, malformed response and timeouts produce safe errors", async t => {
  const f = await fixture(t); f.connect();
  for (const mode of ["auth", "redirect", "invalid"]) {
    f.mode(mode);
    const result = await f.app.inject("/api/music/players");
    assert.equal(result.statusCode, 502);
    assert.ok(!result.body.includes("upstream-token-secret"));
  }
  f.mode("slow");
  const client = createMusicClient(f.settings, { timeout: 20 });
  await assert.rejects(client.players(), /接続できません/);
});

test("artwork and time metadata remain optional and reject non-HTTP image URLs", async () => {
  const client = createMusicClient({ read: () => ({ enabled: true, url: "http://music.test", token: "test" }) }, {
    fetchImpl: async (_url, request) => {
      const cmd = JSON.parse(request.body).command;
      return new Response(JSON.stringify(cmd === "players/all" ? [{ ...player, elapsed_time: 65, current_media: {
        title: "曲", image_url: "https://i.ytimg.com/cover.jpg", duration: 240,
      } }] : { tracks: [{ uri: "ytmusic://track/1", name: "曲", duration: 240, album: { name: "アルバム" }, metadata: {
        images: [{ path: "javascript:alert(1)" }, { path: "https://i.ytimg.com/cover.jpg" }],
      } }, { uri: "ytmusic://track/2", name: "不正な画像", duration: -1, metadata: { images: [{ path: "data:image/svg+xml,test" }] } }] }));
    },
  });
  const p = (await client.players())[0];
  assert.equal(p.image, "https://i.ytimg.com/cover.jpg");
  assert.equal(p.elapsed, 65); assert.equal(p.duration, 240);
  const items = await client.search("query", "track");
  assert.equal(items[0].album, "アルバム"); assert.equal(items[0].image, p.image);
  assert.equal(items[1].image, ""); assert.equal(items[1].duration, null);
});
