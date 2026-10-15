// 気象庁 防災情報 API クライアント（無料・トークン不要）
// 天気予報 / 警報・注意報 / 地震 / 台風
import { config } from "../config.js";

const B = "https://www.jma.go.jp/bosai";

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "MyRoomView/0.1" } });
  if (!res.ok) throw new Error(`JMA ${res.status} ${url}`);
  return res.json();
}

// 天気コード → アイコン/テキスト（主要コードの抜粋。未知はコード先頭で推定）
const WX_ICON = {
  "100": ["☀", "晴れ"], "101": ["🌤", "晴れ時々くもり"], "102": ["🌦", "晴れ一時雨"],
  "110": ["🌤", "晴れのちくもり"], "111": ["⛅", "晴れのちくもり"], "112": ["🌦", "晴れのち雨"],
  "200": ["☁", "くもり"], "201": ["⛅", "くもり時々晴れ"], "202": ["🌧", "くもり一時雨"],
  "210": ["⛅", "くもりのち晴れ"], "211": ["☁", "くもりのち晴れ"], "212": ["🌧", "くもりのち雨"],
  "300": ["🌧", "雨"], "301": ["🌦", "雨時々晴れ"], "302": ["🌧", "雨"], "311": ["🌦", "雨のち晴れ"],
  "400": ["🌨", "雪"], "500": ["🌧", "雨"],
};
function wxIcon(code) {
  if (WX_ICON[code]) return WX_ICON[code];
  const c = String(code || "")[0];
  return c === "1" ? ["☀", "晴れ"] : c === "2" ? ["☁", "くもり"] : c === "3" ? ["🌧", "雨"] : c === "4" ? ["🌨", "雪"] : ["⛅", "—"];
}

/** 天気予報（地域コード） */
export async function getWeather(areaCode = config.jma.areaCode) {
  const data = await getJson(`${B}/forecast/data/forecast/${areaCode}.json`);
  const short = data[0];
  const weekly = data[1];
  const ts = short.timeSeries;
  const wxSeries = ts[0];
  const popSeries = ts.find((t) => t.areas?.[0]?.pops);
  const tempShort = ts.find((t) => t.areas?.[0]?.temps);

  const area0 = wxSeries.areas[0];
  const code = area0.weatherCodes?.[0];
  const [icon, text] = wxIcon(code);

  // 週間から最高/最低・数日分
  let forecast = [];
  try {
    const wts = weekly.timeSeries;
    const tempW = wts.find((t) => t.areas?.[0]?.tempsMax);
    const wxW = wts.find((t) => t.areas?.[0]?.weatherCodes);
    const times = (wxW?.timeDefines || []).slice(0, 5);
    forecast = times.map((t, i) => {
      const [ic] = wxIcon(wxW.areas[0].weatherCodes[i]);
      return {
        date: t,
        icon: ic,
        max: tempW?.areas[0]?.tempsMax?.[i] ?? null,
        min: tempW?.areas[0]?.tempsMin?.[i] ?? null,
      };
    });
  } catch {}

  return {
    region: area0.area?.name || null,
    icon,
    condition: text,
    code,
    pop: popSeries?.areas?.[0]?.pops?.[0] ?? null,
    tempMax: tempShort?.areas?.[0]?.temps?.[1] ?? null,
    tempMin: tempShort?.areas?.[0]?.temps?.[0] ?? null,
    forecast,
    reportTime: short.reportDatetime,
  };
}

// 警報・注意報コード → 名称（主要）
const WARN_NAME = {
  "02": "暴風雪警報", "03": "大雨警報", "04": "洪水警報", "05": "暴風警報", "06": "大雪警報",
  "07": "波浪警報", "08": "高潮警報", "10": "大雨注意報", "12": "大雪注意報", "13": "風雪注意報",
  "14": "雷注意報", "15": "強風注意報", "16": "波浪注意報", "17": "融雪注意報", "18": "洪水注意報",
  "19": "高潮注意報", "20": "濃霧注意報", "21": "乾燥注意報", "22": "なだれ注意報", "23": "低温注意報",
  "24": "霜注意報", "25": "着氷注意報", "26": "着雪注意報", "32": "暴風雪特別警報", "33": "大雨特別警報",
  "35": "暴風特別警報", "36": "大雪特別警報", "37": "波浪特別警報", "38": "高潮特別警報",
};
function warnLevel(code) {
  const n = Number(code);
  if (n >= 32) return "emergency"; // 特別警報
  if (n <= 8) return "warning";    // 警報
  return "advisory";               // 注意報
}

/** 警報・注意報（地域コード） */
export async function getWarnings(areaCode = config.jma.areaCode) {
  const data = await getJson(`${B}/warning/data/warning/${areaCode}.json`);
  const out = [];
  const seen = new Set();
  for (const at of data.areaTypes || []) {
    for (const a of at.areas || []) {
      for (const w of a.warnings || []) {
        if (w.status === "発表警報・注意報なし" || w.status === "解除") continue;
        if (!WARN_NAME[w.code] || seen.has(w.code)) continue;
        seen.add(w.code);
        out.push({ code: w.code, name: WARN_NAME[w.code], level: warnLevel(w.code) });
      }
    }
  }
  const maxLevel = out.some((w) => w.level === "emergency") ? "emergency"
    : out.some((w) => w.level === "warning") ? "warning"
    : out.length ? "advisory" : "none";
  return { items: out, maxLevel, reportTime: data.reportDatetime };
}

const INT_ORDER = ["1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"];
function intGte(a, b) {
  return INT_ORDER.indexOf(a) >= INT_ORDER.indexOf(b);
}

/** 最新の地震情報。表示条件（最小震度・対象市区町村）を満たす時だけ active:true */
export async function getQuake() {
  const list = await getJson(`${B}/quake/data/list.json`);
  const latest = (list || []).find((x) => x.json);
  if (!latest) return { active: false };

  let detail = null;
  try { detail = await getJson(`${B}/quake/data/${latest.json}`); } catch {}

  const maxInt = latest.maxi || detail?.Body?.Intensity?.Observation?.MaxInt || null;
  const body = detail?.Body || {};
  const eq = body.Earthquake || {};
  const hypo = eq.Hypocenter?.Area?.Name || latest.anm || "不明";

  // 市区町村ごとの震度を収集
  const cities = [];
  try {
    for (const pref of body.Intensity?.Observation?.Pref || []) {
      for (const area of pref.Area || []) {
        for (const city of area.City || []) {
          cities.push({ name: city.Name, int: city.MaxInt, pref: pref.Name });
        }
      }
    }
  } catch {}

  const watch = config.jma.quakeWatchCities;
  const hitCity = cities.find((c) => watch.some((w) => c.name?.includes(w.replace(/市$/, "")) || c.name?.includes(w)));
  const meetsMin = maxInt && intGte(maxInt, config.jma.quakeMinIntensity);
  // 表示条件: 最小震度以上 かつ 対象市区町村で観測
  const active = Boolean(meetsMin && (hitCity || watch.length === 0));

  return {
    active,
    maxInt,
    hypocenter: hypo,
    magnitude: eq.Magnitude || latest.mag || null,
    depth: eq.Hypocenter?.Area?.Coordinate || null,
    time: eq.OriginTime || latest.at || null,
    tsunami: body.Comments?.Forecast?.Text || (body.Tsunami ? "情報あり" : "なし"),
    cities,
    watchHit: hitCity?.name || null,
  };
}

/** 台風（活動中の有無と基本情報・進路）。無ければ active:false */
export async function getTyphoon() {
  let ids = [];
  try { ids = await getJson(`${B}/typhoon/data/targetTc.json`); } catch {}
  if (!Array.isArray(ids) || ids.length === 0) return { active: false };

  const tc = ids[0];
  // 予報・実況データ（存在すれば）
  let forecast = null;
  try { forecast = await getJson(`${B}/typhoon/data/${tc}_forecast.json`); } catch {}

  return {
    active: true,
    id: tc,
    count: ids.length,
    // 詳細パースは実データ構造に合わせて今後拡張。まずは活動中であることを返す。
    forecast: forecast || null,
  };
}
