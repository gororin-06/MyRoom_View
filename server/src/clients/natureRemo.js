// Nature Remo Cloud API クライアント（室温・湿度・照度・エアコン操作）
// API: https://developer.nature.global/
import { config } from "../config.js";

const base = config.natureRemo.base;

function headers() {
  return {
    Authorization: `Bearer ${config.natureRemo.token}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

async function api(pathname, init = {}) {
  if (!config.natureRemo.token) throw new Error("NATURE_REMO_TOKEN が未設定です");
  const res = await fetch(base + pathname, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`Nature Remo API ${res.status}: ${await res.text().catch(() => "")}`);
  return res.status === 204 ? null : res.json();
}

/** デバイス一覧（センサー値：温度・湿度・照度） */
export async function getDevices() {
  return api("/1/devices");
}

/** 家電一覧（エアコンの状態を含む） */
export async function getAppliances() {
  return api("/1/appliances");
}

/** センサー＋エアコンをまとめて取得し、表示用に整形 */
export async function getState() {
  const [devices, appliances] = await Promise.all([getDevices(), getAppliances()]);

  // 代表デバイスのセンサー値
  const dev = devices[0] || {};
  const ev = dev.newest_events || {};
  const room = {
    deviceName: dev.name || null,
    temperature: ev.te?.val ?? null,
    humidity: ev.hu?.val ?? null,
    illuminance: ev.il?.val ?? null,
    movement: ev.mo?.val ?? null,
    updatedAt: ev.te?.created_at ?? null,
  };

  // 最初のエアコン
  const ac = appliances.find((a) => a.type === "AC" && a.aircon);
  let aircon = null;
  if (ac) {
    const s = ac.settings || {};
    const r = ac.aircon?.range || {};
    aircon = {
      id: ac.id,
      name: ac.nickname || "エアコン",
      power: s.button !== "power-off",        // "" = 運転中, "power-off" = 停止
      mode: s.mode || null,                   // cool/warm/dry/blow/auto
      temp: s.temp ? Number(s.temp) : null,
      tempUnit: s.temp_unit || "c",
      fan: s.vol || "auto",
      dir: s.dir || "auto",
      // 選択肢（モードごとに temp/vol が変わる）
      modes: r.modes ? Object.keys(r.modes) : [],
      range: r.modes || {},
    };
  }

  // 照明（LIGHT）
  const lights = appliances
    .filter((a) => a.type === "LIGHT" && a.light)
    .map((a) => {
      const st = a.light.state || {};
      return {
        id: a.id,
        name: a.nickname || "照明",
        power: st.power === "on" ? true : st.power === "off" ? false : null,
        brightness: st.brightness ?? null,
        buttons: (a.light.buttons || []).map((b) => b.name),
      };
    });

  return { room, aircon, lights, raw: { deviceCount: devices.length, applianceCount: appliances.length } };
}

/** 照明操作。button 例: "on" / "off" / "on-100" / "night" / "bright-up" / "bright-down" */
export async function setLight(applianceId, button) {
  const body = new URLSearchParams();
  body.set("button", String(button));
  return api(`/1/appliances/${applianceId}/light`, { method: "POST", body });
}

/** エアコン操作。settings: {power?, mode?, temp?, fan?, dir?} */
export async function setAircon(applianceId, settings) {
  const body = new URLSearchParams();
  if (settings.power === false) body.set("button", "power-off");
  if (settings.power === true) body.set("button", "");
  if (settings.mode != null) body.set("operation_mode", settings.mode);
  if (settings.temp != null) body.set("temperature", String(settings.temp));
  if (settings.fan != null) body.set("air_volume", settings.fan);
  if (settings.dir != null) body.set("air_direction", settings.dir);
  return api(`/1/appliances/${applianceId}/aircon_settings`, { method: "POST", body });
}
