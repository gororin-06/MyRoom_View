// GitHub Releases を監視し、新しいリリースが出たら取得・展開・再起動する。
// 実際の入れ替えは運用形態(Docker / bare)で分岐。ここでは検知とフックを提供する。
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { config, ROOT } from "../config.js";
import { getSettings } from "../settings.js";

const execFileP = promisify(execFile);

function readFileSafe(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

export function currentVersion() {
  try {
    return "v" + JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  } catch { return "v0.0.0"; }
}

export async function latestRelease() {
  const repo = config.update.repo;
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "MyRoomView" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const j = await res.json();
  return { tag: j.tag_name, name: j.name, url: j.html_url, publishedAt: j.published_at, tarball: j.tarball_url };
}

function cmp(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

let lastCheck = { at: null, latest: null, upToDate: true };

export function getUpdateStatus() {
  return { current: currentVersion(), ...lastCheck, autoEnabled: config.update.auto && getSettings().autoUpdate !== false };
}

/** 新バージョンを検知。自動更新が有効なら適用する。 */
export async function checkAndMaybeUpdate(log = console) {
  let latest;
  try { latest = await latestRelease(); } catch (e) { log.warn?.(`更新チェック失敗: ${e.message}`); return; }
  const cur = currentVersion();
  const upToDate = cmp(latest.tag, cur) <= 0;
  lastCheck = { at: Date.now(), latest, upToDate };
  if (upToDate) return;

  log.info?.(`新しいリリース ${latest.tag} を検知（現在 ${cur}）`);
  if (!(config.update.auto && getSettings().autoUpdate !== false)) {
    log.info?.("自動アップデートは無効のため適用しません");
    return;
  }
  await applyUpdate(latest, log);
}

/**
 * リリースを適用。
 * - Docker Compose 運用: `docker compose pull && up -d` を試す
 * - bare(git) 運用: `git fetch && git checkout <tag> && npm ci` → プロセス終了(外部のsystemd/PM2が再起動)
 */
async function applyUpdate(latest, log) {
  const compose = fs.existsSync(path.join(ROOT, "docker-compose.yml")) && process.env.IN_DOCKER !== "1";
  try {
    if (fs.existsSync(path.join(ROOT, ".git"))) {
      log.info?.("git からアップデートを適用します");
      const lockPath = path.join(ROOT, "package-lock.json");
      const lockBefore = readFileSafe(lockPath);
      await execFileP("git", ["fetch", "--tags", "--depth", "1"], { cwd: ROOT });
      await execFileP("git", ["checkout", latest.tag], { cwd: ROOT });
      // 依存が変わった時だけ再インストール。破壊的な `npm ci`（node_modules を全削除）は
      // 使わず `npm install` にして、失敗時も既存の node_modules を壊さない（旧状態で起動可能）。
      if (readFileSafe(lockPath) !== lockBefore) {
        log.info?.("依存関係が変化したため再インストールします");
        await execFileP("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], { cwd: ROOT });
      } else {
        log.info?.("依存関係に変更なし。インストールをスキップします");
      }
      log.info?.("再起動します（supervisor による再起動を想定）");
      process.exit(0);
    } else if (compose) {
      log.info?.("docker compose でアップデートを適用します");
      await execFileP("docker", ["compose", "pull"], { cwd: ROOT });
      await execFileP("docker", ["compose", "up", "-d"], { cwd: ROOT });
    } else {
      log.warn?.("適用方法を判定できませんでした。docs/update.md を参照してください。");
    }
  } catch (e) {
    log.error?.(`アップデート適用に失敗: ${e.message}`);
  }
}
