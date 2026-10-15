// 各データソースを定期ポーリングし、メモリ上に最新状態をキャッシュする。
// フロントは /api/state を見るだけ（レート制限や外部APIを直接叩かせない）。
import { config } from "../config.js";
import * as remo from "../clients/natureRemo.js";
import * as jma from "../clients/jma.js";
import * as zabbix from "../clients/zabbix.js";
import { checkAll } from "./serviceChecker.js";
import { getSettings } from "../settings.js";
import { checkAndMaybeUpdate, getUpdateStatus } from "./updater.js";

const state = {
  room: null, aircon: null,
  weather: null, warnings: null, quake: null, typhoon: null,
  nodes: null, services: null,
  errors: {},
  updatedAt: {},
};

const subscribers = new Set();
let log = console;

function set(key, value) {
  state[key] = value;
  state.updatedAt[key] = Date.now();
  delete state.errors[key];
  broadcast();
}
function fail(key, err) {
  state.errors[key] = String(err?.message || err);
  log.warn?.(`[${key}] ${state.errors[key]}`);
  broadcast();
}

function broadcast() {
  const payload = `data: ${JSON.stringify(getState())}\n\n`;
  for (const res of subscribers) { try { res.raw.write(payload); } catch {} }
}

export function getState() {
  return { ...state, settings: publicSettings(), update: safe(getUpdateStatus) };
}
function safe(fn) { try { return fn(); } catch { return null; } }
function publicSettings() {
  const s = getSettings();
  return {
    roomName: s.roomName, interval: s.interval, idle: s.idle,
    weather: s.weather, room: s.room, server: s.server, region: s.region,
    nightStart: s.nightStart, nightEnd: s.nightEnd, autoUpdate: s.autoUpdate,
  };
}

export function subscribe(res) {
  subscribers.add(res);
  res.raw.write(`data: ${JSON.stringify(getState())}\n\n`);
  return () => subscribers.delete(res);
}

// --- 各ポーリングタスク ---
async function pollRemo() {
  try { const r = await remo.getState(); set("room", r.room); set("aircon", r.aircon); }
  catch (e) { fail("room", e); }
}
async function pollWeather() {
  try { set("weather", await jma.getWeather(regionCode())); } catch (e) { fail("weather", e); }
}
async function pollWarnings() {
  try { set("warnings", await jma.getWarnings(regionCode())); } catch (e) { fail("warnings", e); }
}
async function pollQuake() {
  try { set("quake", await jma.getQuake()); } catch (e) { fail("quake", e); }
}
async function pollTyphoon() {
  try { set("typhoon", await jma.getTyphoon()); } catch (e) { fail("typhoon", e); }
}
async function pollZabbix() {
  if (!config.zabbix.url) return;
  try {
    const hidden = new Set(getSettings().hiddenHosts || []);
    set("nodes", (await zabbix.getNodes()).filter((n) => !hidden.has(n.hostid)));
  } catch (e) { fail("nodes", e); }
}
async function pollServices() {
  try { set("services", await checkAll()); } catch (e) { fail("services", e); }
}

// JMA 地域コード（settings.region → コード）
const REGION_CODE = {
  "北海道（札幌）": "016000", "千葉県": "120000", "東京都": "130000",
  "愛知県（名古屋）": "230000", "大阪府": "270000", "福岡県": "400000", "沖縄県（那覇）": "471000",
};
function regionCode() {
  return REGION_CODE[getSettings().region] || config.jma.areaCode;
}

function every(ms, fn) { fn(); return setInterval(fn, ms); }

export function startPolling(logger = console) {
  log = logger;
  const timers = [
    every(config.intervals.remo, pollRemo),
    every(config.intervals.weather, pollWeather),
    every(config.intervals.warning, pollWarnings),
    every(config.intervals.quake, pollQuake),
    every(config.intervals.typhoon, pollTyphoon),
    every(config.intervals.zabbix, pollZabbix),
    every(config.intervals.services, pollServices),
    every(config.intervals.update, () => checkAndMaybeUpdate(log)),
  ];
  return () => timers.forEach(clearInterval);
}

// 設定変更時に即時再ポーリング
export function refreshAfterSettingsChange() {
  pollServices(); pollWeather(); pollWarnings(); pollZabbix();
}
