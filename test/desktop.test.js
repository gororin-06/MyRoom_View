import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import Fastify from "fastify";
import { createDesktopConfig, viewerInstalled, probeDesktop } from "../server/src/clients/desktop.js";
import { desktopRoutes } from "../server/src/routes/desktop.js";

test("desktop config validates IPv4 and persists; route reports installation separately from connectivity", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "myroom-desktop-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const settings = createDesktopConfig(path.join(dir, "desktop.json"));
  const app = Fastify(); t.after(() => app.close());
  let probes = 0;
  app.register(desktopRoutes, { settings, isInstalled: () => true, probe: async host => {
    probes++; assert.equal(host, "192.0.2.50"); return { reachable: true, port: 28252 };
  } });
  assert.equal((await app.inject("/api/desktop/config")).json().enabled, false);
  assert.equal((await app.inject({ method: "POST", url: "/api/desktop/check" })).statusCode, 400);
  for (const host of ["file:///etc/passwd", "192.0.2.1:80", "hostname", "256.0.0.1"]) {
    const bad = await app.inject({ method: "PUT", url: "/api/desktop/config", payload: { enabled: true, host } });
    assert.equal(bad.statusCode, 400); assert.equal(settings.read().enabled, false);
  }
  const saved = await app.inject({ method: "PUT", url: "/api/desktop/config", payload: { enabled: true, host: "192.0.2.50", name: "作業用PC" } });
  assert.equal(saved.statusCode, 200); assert.equal(saved.json().viewerInstalled, true);
  assert.equal(createDesktopConfig(path.join(dir, "desktop.json")).read().name, "作業用PC");
  assert.deepEqual((await app.inject({ method: "POST", url: "/api/desktop/check" })).json(), { reachable: true, port: 28252, viewerInstalled: true });
  assert.equal(probes, 1);
  const denied = await app.inject({ method: "PUT", url: "/api/desktop/config", headers: { origin: "https://other.example" }, payload: { enabled: false } });
  assert.equal(denied.statusCode, 403); assert.equal(settings.read().enabled, true);
  assert.equal(viewerInstalled(dir), false);
  for (const file of ["index.html", "spacedesk.min.js", "styles.css"]) fs.writeFileSync(path.join(dir, file), "fixture");
  assert.equal(viewerInstalled(dir), true);
});

test("desktop TCP check reports reachability without claiming a display session", async t => {
  const server = net.createServer(socket => socket.end());
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { if (server.listening) server.close(); });
  const port = server.address().port;
  assert.deepEqual(await probeDesktop("127.0.0.1", { port, timeout: 100 }), { reachable: true, port });
  await new Promise(resolve => server.close(resolve));
  assert.equal((await probeDesktop("127.0.0.1", { port, timeout: 100 })).reachable, false);
});

test("single-PC config migrates to multiple PCs and checks only the selected saved target", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "myroom-desktop-multi-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "desktop.json");
  const legacy = JSON.stringify({ enabled: true, name: "既存PC", host: "192.0.2.50" });
  fs.writeFileSync(file, legacy);
  const settings = createDesktopConfig(file);
  assert.equal(settings.read().targets[0].id, "legacy");
  assert.equal(fs.readFileSync(file, "utf8"), legacy);
  const targets = [...settings.read().targets, { id: "second", name: "別のWindows PC", host: "192.0.2.51" }];
  const app = Fastify(); t.after(() => app.close());
  const checked = [];
  app.register(desktopRoutes, { settings, isInstalled: () => true, probe: async host => { checked.push(host); return { reachable: true, port: 28252 }; } });
  let response = await app.inject({ method: "PUT", url: "/api/desktop/config", payload: { enabled: true, targets, defaultTargetId: "second" } });
  assert.equal(response.statusCode, 200); assert.equal(response.json().host, "192.0.2.51");
  await app.inject({ method: "POST", url: "/api/desktop/check" });
  await app.inject({ method: "POST", url: "/api/desktop/check?targetId=legacy" });
  assert.deepEqual(checked, ["192.0.2.51", "192.0.2.50"]);
  assert.equal((await app.inject({ method: "POST", url: "/api/desktop/check?targetId=unregistered" })).statusCode, 400);
  assert.equal(checked.length, 2);
  const original = fs.readFileSync(file, "utf8");
  for (const patch of [
    { targets: [targets[0], { ...targets[1], id: "legacy" }] },
    { targets: [targets[0], { ...targets[1], host: targets[0].host }] },
    { defaultTargetId: "missing" }, { targets: [] },
  ]) {
    response = await app.inject({ method: "PUT", url: "/api/desktop/config", payload: patch });
    assert.equal(response.statusCode, 400); assert.equal(fs.readFileSync(file, "utf8"), original);
  }
  settings.save({ targets: [targets[1]], defaultTargetId: "second" });
  assert.equal(settings.read().targets.length, 1);
  settings.save({ enabled: false, targets: [] });
  assert.equal(settings.read().defaultTargetId, "");
});
