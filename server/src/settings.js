// ユーザー設定の保存（data/settings.json）。別端末の設定画面やディスプレイから更新される。
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const FILE = path.join(config.dataDir, "settings.json");
const FIRST_RUN_FILE = path.join(config.dataDir, "first-run.txt");

export const DEFAULT_SETTINGS = {
  roomName: "リビング",
  interval: 7,          // スライド切替(秒)
  idle: 20,             // 操作後スライドショーに戻るまで(秒)
  weather: true,
  room: true,
  server: true,
  slideOrder: ["clock", "weather", "room", "server"], // スライドの表示順
  region: "千葉県",
  nightStart: 0,        // 深夜モード 開始(時)
  nightEnd: 6,          // 深夜モード 終了(時)
  autoUpdate: true,
  // プロジェクター連動：指定サービスが down→up（起動）した時、照明がONなら確認後に消灯
  // { enabled, trigger: "host:port", lightId, seconds }
  projector: { enabled: false, trigger: "", lightId: "", seconds: 10 },
  // 自前監視するサービス（Zabbixに無いもの）: ノードのhostごとにサービスを紐付け
  // { host, name, services: [{ name, port }] }
  servers: [],
  // Zabbixから取得したホストのうち、非表示にするもの（hostid配列）
  hiddenHosts: [],
};

let cache = null;

function ensureDir() {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

export function getFirstRun() {
  ensureDir();
  try {
    const t = Number(fs.readFileSync(FIRST_RUN_FILE, "utf8").trim());
    if (t) return t;
  } catch {}
  const now = Date.now();
  try { fs.writeFileSync(FIRST_RUN_FILE, String(now)); } catch {}
  return now;
}

/** 運用開始から30日経過していれば true（稼働率を表示してよい） */
export function isMatured() {
  return Date.now() - getFirstRun() >= 30 * 24 * 60 * 60 * 1000;
}

export function getSettings() {
  if (cache) return cache;
  ensureDir();
  try {
    cache = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  cache = next;
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
}
