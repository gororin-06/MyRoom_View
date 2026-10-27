// The official manual permits saving the HTML5 viewer for local/offline use.
// Download to ignored runtime data; do not commit or redistribute vendor files.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "data", "spacedesk-viewer");
const base = "http://viewer.spacedesk.net/";
const files = ["spacedesk.min.js", "styles.css", "img/icon_ios.png", "img/favicon.ico", "img/logo-icon.png", "img/logo-icon@2x.png", "img/Logo.png", "img/help-tray.jpg", "img/help-about.jpg", "img/logo-icon-animation.gif", "img/logo-icon-animation@2x.gif", "img/cursor.gif"];
async function download(url) {
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "error" }); }
  catch (error) { throw new Error("Download failed: " + url + " (" + error.message + ")"); }
  if (!response.ok) throw new Error("HTTP " + response.status + ": " + url);
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length || data.length > 5_000_000) throw new Error("Unexpected asset size: " + url);
  return data;
}
try {
  let html = await download(base);
  if (!html.toString().includes("spacedesk HTML5 VIEWER")) throw new Error("The official viewer page has changed");
  // Keep navigation/warnings in MyRoom View when the vendor reconnects rapidly.
  if (!/<script\b[^>]*src=["']spacedesk\.min\.js["']/i.test(html.toString())) throw new Error("The official viewer script entry has changed");
  html = Buffer.from(html.toString().replace(/(<script\b[^>]*src=["']spacedesk\.min\.js["'])/i, '<script src="/desktop-viewer-bridge.js"></script>$1'));
  const results = await Promise.allSettled(files.map(async file => [file, await download(new URL(file, base))]));
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) throw new Error(failures.map(result => result.reason.message).join("\n"));
  const assets = [["index.html", html], ...results.map(result => result.value)];
  // Save the two fonts referenced by the official CSS for offline use as well.
  const cssAsset = assets.find(([file]) => file === "styles.css");
  let css = cssAsset[1].toString();
  const fonts = [...new Set(css.match(/https?:\/\/fonts\.gstatic\.com\/[\w/.-]+\.ttf/g) || [])];
  for (let index = 0; index < fonts.length; index++) {
    const font = "fonts/font-" + index + ".ttf";
    assets.push([font, await download(fonts[index].replace(/^http:/, "https:"))]);
    css = css.split(fonts[index]).join(font);
  }
  cssAsset[1] = Buffer.from(css);
  for (const [file, data] of assets) {
    const output = path.join(destination, file);
    await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, data);
  }
  await fs.writeFile(path.join(destination, "installation.json"), JSON.stringify({ source: base, installedAt: new Date().toISOString(), assets: assets.map(([file, data]) => ({ file, sha256: createHash("sha256").update(data).digest("hex") })) }, null, 2));
  console.log("Installed official spacedesk HTML5 viewer: " + destination);
  console.log("Windows側のspacedesk DRIVERは別途必要です。接続先は /settings#desktop で設定してください。");
} catch (error) { console.error("Viewer installation failed: " + error.message); process.exitCode = 1; }
