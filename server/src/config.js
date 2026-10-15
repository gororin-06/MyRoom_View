// 環境変数の読み込み（.env を依存なしでパース）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");

function loadDotEnv() {
  const p = path.join(ROOT, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadDotEnv();

const bool = (v, d) => (v === undefined ? d : /^(1|true|yes|on)$/i.test(v));

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  dataDir: path.join(ROOT, "data"),
  webDir: path.join(ROOT, "web", "public"),

  natureRemo: {
    token: process.env.NATURE_REMO_TOKEN || "",
    base: "https://api.nature.global",
  },
  jma: {
    areaCode: process.env.JMA_AREA_CODE || "120000",
    quakeWatchCities: (process.env.QUAKE_WATCH_CITIES || "市原市,千葉市").split(",").map((s) => s.trim()).filter(Boolean),
    quakeMinIntensity: process.env.QUAKE_MIN_INTENSITY || "3",
  },
  zabbix: {
    url: process.env.ZABBIX_URL || "",
    token: process.env.ZABBIX_TOKEN || "",
  },
  update: {
    repo: process.env.GITHUB_REPO || "gororin-06/MyRoom_View",
    auto: bool(process.env.AUTO_UPDATE, true),
  },

  // ポーリング間隔(ms)
  intervals: {
    remo: 60_000,      // Nature Remo: レート制限(5分30回)に配慮
    weather: 10 * 60_000,
    warning: 5 * 60_000,
    quake: 60_000,
    typhoon: 10 * 60_000,
    zabbix: 60_000,
    services: 60_000,  // サービスのTCP死活チェック
    update: 6 * 60 * 60_000,
  },
};
