// サービスの死活履歴を「日ごとの集計(checks/up)」で保存し、過去30日の稼働率を算出する。
// SQLite等の native 依存を避け、小さな JSON ファイルで実装。
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const FILE = path.join(config.dataDir, "uptime.json");
const KEEP_DAYS = 35;

let data = null; // { [serviceKey]: { [YYYY-MM-DD]: {c:checks, u:up} } }

function load() {
  if (data) return data;
  try {
    data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    data = {};
  }
  return data;
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(data));
    } catch {}
  }, 2000);
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function prune(byDay) {
  const keys = Object.keys(byDay).sort();
  while (keys.length > KEEP_DAYS) delete byDay[keys.shift()];
}

/** 1回のチェック結果を記録 */
export function record(serviceKey, up) {
  load();
  const byDay = (data[serviceKey] ||= {});
  const k = dayKey();
  const b = (byDay[k] ||= { c: 0, u: 0 });
  b.c += 1;
  if (up) b.u += 1;
  prune(byDay);
  scheduleSave();
}

/** 過去30日の稼働率(%)。データが無ければ null */
export function uptime30(serviceKey) {
  load();
  const byDay = data[serviceKey];
  if (!byDay) return null;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let c = 0, u = 0;
  for (const [k, b] of Object.entries(byDay)) {
    if (new Date(k) >= since) { c += b.c; u += b.u; }
  }
  if (!c) return null;
  return Math.round((u / c) * 1000) / 10; // 小数第1位
}
