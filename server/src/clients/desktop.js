import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

export const VIEWER_DIR = path.join(config.dataDir, "spacedesk-viewer");
export function viewerInstalled(dir = VIEWER_DIR) {
  return ["index.html", "spacedesk.min.js", "styles.css"].every(file => fs.existsSync(path.join(dir, file)));
}
export function createDesktopConfig(file = path.join(config.dataDir, "desktop.json")) {
  const invalid = message => { const error = new Error(message); error.statusCode = 400; throw error; };
  function normalize(raw) {
    // Migrate the original single-PC settings without losing its address.
    const targets = Array.isArray(raw.targets) ? raw.targets.map(target => ({ ...target }))
      : raw.host ? [{ id: "legacy", name: raw.name || "デスクトップPC", host: raw.host }] : [];
    if (targets.length > 20) invalid("登録できるPCは20台までです");
    const ids = new Set(), hosts = new Set();
    for (const target of targets) {
      target.id = target.id || randomUUID();
      if (typeof target.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(target.id) || ids.has(target.id)) invalid("PCの識別子が重複しているか正しくありません");
      if (typeof target.host !== "string" || !net.isIPv4(target.host.trim())) invalid("拡張元Windows PCのIPv4アドレスを入力してください（例: 192.168.1.50）");
      if (typeof target.name !== "string" || target.name.length > 80) invalid("PCの名前は80文字以内で入力してください");
      target.name = target.name.trim() || "デスクトップPC"; target.host = target.host.trim();
      if (hosts.has(target.host)) invalid("同じIPアドレスのPCが重複しています");
      ids.add(target.id); hosts.add(target.host);
    }
    if (raw.enabled && !targets.length) invalid("有効にするには接続先PCを1台以上登録してください");
    let defaultTargetId = raw.defaultTargetId || targets[0]?.id || "";
    if (!targets.length) defaultTargetId = "";
    if (defaultTargetId && !ids.has(defaultTargetId)) invalid("標準の接続先を登録済みのPCから選択してください");
    const selected = targets.find(target => target.id === defaultTargetId);
    return { enabled: raw.enabled === true, targets, defaultTargetId, name: selected?.name || "デスクトップPC", host: selected?.host || "" };
  }
  function read() {
    try { return normalize(JSON.parse(fs.readFileSync(file, "utf8"))); }
    catch (e) { if (e.code === "ENOENT") return normalize({ enabled: false }); throw e; }
  }
  function save(patch) {
    const previous = read();
    const input = { ...previous, ...patch };
    if (!Object.hasOwn(patch, "targets") && (Object.hasOwn(patch, "host") || Object.hasOwn(patch, "name"))) {
      const target = input.targets.find(target => target.id === previous.defaultTargetId);
      if (target) {
        if (patch.host !== undefined) target.host = patch.host;
        if (patch.name !== undefined) target.name = patch.name;
      } else if (patch.host || patch.enabled) {
        input.targets = [{ id: "legacy", name: patch.name || "デスクトップPC", host: patch.host || "" }];
        input.defaultTargetId = "legacy";
      }
    }
    const value = normalize(input);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + ".tmp", JSON.stringify({ enabled: value.enabled, targets: value.targets, defaultTargetId: value.defaultTargetId }, null, 2), { mode: 0o600 });
    fs.renameSync(file + ".tmp", file);
    return read();
  }
  return { read, save };
}
export function probeDesktop(host, { port = 28252, timeout = 2500 } = {}) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const finish = reachable => { socket.destroy(); resolve({ reachable, port }); };
    socket.setTimeout(timeout, () => finish(false));
    socket.once("connect", () => finish(true)); socket.once("error", () => finish(false));
  });
}
