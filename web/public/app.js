"use strict";
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;

  var MODES = {
    cool: { name: "冷房", ic: "❄", color: "#3b9eff", soft: "rgba(59,158,255,.18)" },
    warm: { name: "暖房", ic: "☀", color: "#ff8a3d", soft: "rgba(255,138,61,.18)" },
    dry:  { name: "除湿", ic: "💧", color: "#2fd4c4", soft: "rgba(47,212,196,.18)" },
    blow: { name: "送風", ic: "🌀", color: "#8aa0b8", soft: "rgba(138,160,184,.2)" },
    auto: { name: "自動", ic: "◐", color: "#51c777", soft: "rgba(81,199,119,.18)" },
  };
  var FANL = { auto: "自動", "1": "弱", "2": "中", "3": "強" };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); };

  var state = {};        // 最新の /api/state
  var settings = {};     // state.settings
  var localAc = null;    // 操作中のエアコン値（楽観的更新）
  var bootVersion = null; // 起動時のアプリ版。アップデート後に変わったら自動リロード
  var ambientMusicActive = false;

  // ---------- data layer (SSE + poll fallback) ----------
  function applyState(s) {
    state = s || {}; settings = state.settings || {};
    document.dispatchEvent(new CustomEvent("room-settings", { detail: settings }));
    // アップデート適用でサーバーが再起動しバージョンが変わったら、表示を自動リロード
    var v = state.update && state.update.current;
    if (v) {
      if (bootVersion && v !== bootVersion) { location.reload(); return; }
      if (!bootVersion) bootVersion = v;
    }
    render();
    checkProjector();
  }
  function connect() {
    try {
      var es = new EventSource("/api/stream");
      es.onmessage = function (e) { try { applyState(JSON.parse(e.data)); } catch (_) {} };
      es.onerror = function () { es.close(); setTimeout(poll, 3000); };
    } catch (_) { poll(); }
  }
  function poll() {
    fetch("/api/state").then(function (r) { return r.json(); }).then(applyState).catch(function () {});
    setTimeout(poll, 15000);
  }

  // ---------- render ----------
  function render() {
    renderRoomName();
    renderWeather();
    renderRoom();
    renderAircon();
    renderLights();
    renderServers();
    renderSettingsUrl();
    buildOrder();
    checkDisaster();
  }

  function renderRoomName() {
    var n = settings.roomName || "リビング";
    ["roomName", "roomName2", "roomName3", "roomNameMusic"].forEach(function (id) { if ($(id)) $(id).textContent = n; });
  }

  function renderWeather() {
    var w = state.weather; if ($("wxRegion")) $("wxRegion").textContent = settings.region || "—";
    if (!w) return;
    $("wxIcon").textContent = w.icon || "⛅";
    $("wxTemp").innerHTML = (w.tempMax != null ? w.tempMax : "--") + '<span class="u">°</span>';
    $("wxCond").textContent = w.condition || "—";
    var chips = [["最高 / 最低", (w.tempMax != null ? w.tempMax : "--") + "° / " + (w.tempMin != null ? w.tempMin : "--") + "°"], ["降水確率", (w.pop != null ? w.pop : "--") + "%"]];
    $("wxChips").innerHTML = chips.map(function (c) { return '<div class="wx-chip"><span class="k">' + c[0] + '</span><span class="v">' + esc(c[1]) + "</span></div>"; }).join("");
    var days = (w.forecast || []).slice(0, 4);
    $("wxFc").innerHTML = days.map(function (d, i) {
      var dt = new Date(d.date); var lbl = i === 0 ? "今日" : (["日", "月", "火", "水", "木", "金", "土"][dt.getDay()]);
      return '<div class="wx-day' + (i === 0 ? " t" : "") + '"><span class="d">' + lbl + '</span><span class="i">' + (d.icon || "⛅") + '</span><span class="r">' + (d.max != null ? d.max : "--") + '°<small>/' + (d.min != null ? d.min : "--") + '°</small></span></div>';
    }).join("");
  }

  function feel(t) { return t == null ? "—" : t >= 28 ? "やや暑い" : t >= 24 ? "快適" : t >= 18 ? "やや涼しい" : "寒い"; }
  function renderRoom() {
    var r = state.room || {};
    var t = r.temperature;
    $("ambientMusicRoom").textContent = [t != null ? t + "°C" : "", r.humidity != null ? r.humidity + "%" : ""].filter(Boolean).join(" / ");
    ["roomTempBig"].forEach(function () {});
    if ($("roomTempBig")) $("roomTempBig").innerHTML = (t != null ? t : "--") + '<span class="u">°C</span>';
    if ($("roomHum")) $("roomHum").textContent = (r.humidity != null ? r.humidity : "--") + "%";
    if ($("roomLux")) $("roomLux").textContent = (r.illuminance != null ? Math.round(r.illuminance) : "--") + " lx";
    if ($("dTemp")) $("dTemp").innerHTML = (t != null ? t : "--") + '<span class="u">°C</span>';
    if ($("dHum")) $("dHum").innerHTML = (r.humidity != null ? r.humidity : "--") + "<small>%</small>";
    if ($("dLux")) $("dLux").innerHTML = (r.illuminance != null ? Math.round(r.illuminance) : "--") + "<small>lx</small>";
    if ($("dFeel")) $("dFeel").textContent = feel(t);
    if ($("dUpdated")) $("dUpdated").textContent = r.updatedAt ? "最終更新 " + new Date(r.updatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "—";
    // room slide の AC 概要
    pushTempHist(t);
    drawSpark();
  }

  function acView() { return localAc || state.aircon; }
  function applyModeColor(mode) {
    var m = MODES[mode] || MODES.cool;
    root.style.setProperty("--mode", m.color);
    root.style.setProperty("--mode-soft", m.soft);
    return m;
  }
  function renderAircon() {
    var ac = acView();
    var dot = $("remoDot");
    if (state.errors && state.errors.room) { if (dot) dot.classList.add("off"); if ($("remoStatus")) $("remoStatus").textContent = "Nature Remo 未接続"; }
    else { if (dot) dot.classList.remove("off"); if ($("remoStatus")) $("remoStatus").textContent = "Nature Remo 接続中"; }
    if (!ac) {
      if ($("roomAc")) $("roomAc").textContent = "エアコン情報なし";
      return;
    }
    var m = applyModeColor(ac.mode);
    $("modeName").textContent = m.name; $("modeBadge").querySelector(".ic").textContent = m.ic;
    $("setTemp").textContent = ac.temp != null ? ac.temp : "--";
    $("setTemp2").textContent = ac.temp != null ? ac.temp : "--";
    $("ac").classList.toggle("is-off", !ac.power);
    $("statePill").textContent = ac.power ? "運転中" : "停止中"; $("statePill").classList.toggle("on", !!ac.power);
    $("powerLabel").textContent = ac.power ? "運転を停止" : "運転を開始";
    $("dFan").textContent = FANL[ac.fan] || ac.fan || "—";
    $("dDir").textContent = ac.dir || "自動";
    setPressed("modeSeg", "mode", ac.mode);
    setPressed("fanSeg", "fan", ac.fan);
    if ($("roomAc")) $("roomAc").innerHTML = ac.power ? (m.ic + " " + m.name + " " + (ac.temp != null ? ac.temp + "°C" : "") + " ・ 運転中") : "停止中";
  }
  function setPressed(container, attr, val) {
    var box = $(container); if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-" + attr) === String(val) ? "true" : "false");
    });
  }

  // エアコン操作（楽観更新 → API）
  function sendAircon(patch) {
    var ac = acView(); if (!ac) return;
    localAc = Object.assign({}, ac, patch);
    renderAircon();
    fetch("/api/aircon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
      .catch(function () {})
      .finally(function () { setTimeout(function () { localAc = null; }, 4000); });
  }
  $("powerBtn").addEventListener("click", function () { var ac = acView(); if (ac) sendAircon({ power: !ac.power }); });
  $("plus").addEventListener("click", function () { var ac = acView(); if (ac && ac.temp != null) sendAircon({ temp: ac.temp + 1 }); });
  $("minus").addEventListener("click", function () { var ac = acView(); if (ac && ac.temp != null) sendAircon({ temp: ac.temp - 1 }); });
  $("modeSeg").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) sendAircon({ mode: b.getAttribute("data-mode") }); });
  $("fanSeg").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) sendAircon({ fan: b.getAttribute("data-fan") }); });

  // ---------- 照明（Nature Remo LIGHT） ----------
  function renderLights() {
    var panel = $("lightPanel"); if (!panel) return;
    var lights = state.lights || [];
    if (!lights.length) { panel.hidden = true; return; }
    panel.hidden = false;
    $("lightList").innerHTML = lights.map(function (l) {
      var has = function (b) { return (l.buttons || []).indexOf(b) >= 0; };
      var b = [];
      b.push('<button class="lbtn' + (l.power === true ? " on" : "") + '" data-id="' + esc(l.id) + '" data-btn="on">点灯</button>');
      b.push('<button class="lbtn' + (l.power === false ? " on" : "") + '" data-id="' + esc(l.id) + '" data-btn="off">消灯</button>');
      if (has("bright-up")) b.push('<button class="lbtn" data-id="' + esc(l.id) + '" data-btn="bright-up">明るく</button>');
      if (has("bright-down")) b.push('<button class="lbtn" data-id="' + esc(l.id) + '" data-btn="bright-down">暗く</button>');
      if (has("night")) b.push('<button class="lbtn" data-id="' + esc(l.id) + '" data-btn="night">常夜灯</button>');
      return '<div class="light-row"><span class="light-name">💡 ' + esc(l.name) + "</span><div class=\"light-btns\">" + b.join("") + "</div></div>";
    }).join("");
  }
  function sendLight(id, button) {
    if (button === "on" || button === "off") {
      var l = (state.lights || []).filter(function (x) { return x.id === id; })[0];
      if (l) { l.power = button === "on"; renderLights(); }
    }
    fetch("/api/light", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id, button: button }) }).catch(function () {});
  }
  if ($("lightList")) $("lightList").addEventListener("click", function (e) {
    var btn = e.target.closest("button.lbtn"); if (!btn) return;
    sendLight(btn.getAttribute("data-id"), btn.getAttribute("data-btn"));
  });

  // ---------- プロジェクター連動（起動検知→照明オフ確認） ----------
  var projPrevUp = null;    // 直近のプロジェクター疎通状態
  var projTimer = null, projLeft = 0, projCfg = null, projOpen = false;
  function checkProjector() {
    var cfg = settings.projector;
    if (!cfg || !cfg.enabled || !cfg.lightId) return;
    var up = state.projectorUp;                 // サーバーの裏チェック結果（true/false/null）
    if (up !== true && up !== false) return;
    var prev = projPrevUp;
    projPrevUp = up;
    if (prev === false && up === true) {         // 疎通 OFF→ON（＝起動）
      var light = (state.lights || []).filter(function (l) { return l.id === cfg.lightId; })[0];
      if (light && light.power === true) openProjPopup(cfg, light);  // 照明ONの時だけ
    }
  }
  function updateProjCount() {
    if ($("projCount")) $("projCount").textContent = "あと " + projLeft + " 秒で消灯します";
    if ($("projOk")) $("projOk").textContent = "消す (" + projLeft + ")";
  }
  function openProjPopup(cfg, light) {
    if (projOpen) return;
    var pop = $("projPopup"); if (!pop) return;
    projOpen = true; projCfg = cfg; projLeft = cfg.seconds || 10;
    if ($("projMsg")) $("projMsg").textContent = "プロジェクターが起動しました。照明「" + (light.name || "") + "」を消しますか？";
    updateProjCount();
    pop.classList.add("show");
    projTimer = setInterval(function () { projLeft--; if (projLeft <= 0) confirmProj(); else updateProjCount(); }, 1000);
  }
  function closeProjPopup() {
    if (projTimer) { clearInterval(projTimer); projTimer = null; }
    var pop = $("projPopup"); if (pop) pop.classList.remove("show");
    projOpen = false;
  }
  function confirmProj() {
    var cfg = projCfg; closeProjPopup();
    if (cfg) sendLight(cfg.lightId, "off");
  }
  if ($("projOk")) $("projOk").addEventListener("click", confirmProj);
  if ($("projCancel")) $("projCancel").addEventListener("click", closeProjPopup);

  // ---------- servers (nodes[zabbix] + services[self]) ----------
  function mergeServers() {
    var nodes = state.nodes || [];
    var svcServers = (state.services && state.services.servers) || [];
    var byKey = {};
    nodes.forEach(function (n) {
      byKey[n.ip || n.name] = { name: n.name, host: n.ip || "", up: n.up, cpu: n.cpu, mem: n.mem, disk: n.disk, swap: n.swap, load: n.load, uptime: n.uptime, os: n.os, services: [] };
    });
    svcServers.forEach(function (s) {
      var key = s.host || s.name;
      var card = byKey[key] || (byKey[key] = { name: s.name, host: s.host, up: true, cpu: null, mem: null, disk: null, swap: null, load: null, uptime: null, os: null, services: [] });
      card.services = s.services || [];
      if (s.name && !card.name) card.name = s.name;
    });
    return Object.keys(byKey).map(function (k) { return byKey[k]; });
  }
  function isNode(s) { return s.cpu != null || s.mem != null || s.disk != null || s.swap != null || s.load != null || s.uptime != null || s.os != null; }
  function bcolor(v) { return v == null ? "var(--line)" : v >= 85 ? "var(--crit)" : v >= 70 ? "var(--warn)" : "var(--good)"; }
  function fmtUptime(sec) { sec = Number(sec) || 0; var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60); if (d > 0) return d + "日" + (h ? " " + h + "h" : ""); if (h > 0) return h + "h" + (m ? " " + m + "m" : ""); return m + "m"; }
  function fmtClock(ts) { if (!ts) return ""; var d = new Date(ts); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function shortOs(v) { v = String(v).replace(/\s+/g, " ").trim(); return v.length > 30 ? v.slice(0, 30) + "…" : v; }
  function srvSummary(list) {
    var ns = list.filter(isNode);
    var svc = list.reduce(function (a, s) { return a.concat((s.services || []).filter(function (p) { return p.up != null; })); }, []);
    var upN = ns.filter(function (s) { return s.up !== false; }).length;
    var upS = svc.filter(function (p) { return p.up !== false; }).length;
    var u = state.updatedAt || {};
    var upd = Math.max(u.nodes || 0, u.services || 0);
    var bits = [];
    if (ns.length) bits.push("ノード <b>" + upN + "/" + ns.length + "</b> 稼働");
    if (svc.length) bits.push("サービス <b>" + upS + "/" + svc.length + "</b> 稼働");
    if (upd) bits.push("最終更新 " + fmtClock(upd));
    return bits.length ? '<div class="srv-summary">' + bits.join(' <span class="sep">・</span> ') + "</div>" : "";
  }
  function serverCardsHTML() {
    var list = mergeServers();
    if (!list.length) return '<div style="color:var(--faint);font-size:13px;padding:8px">サーバー未設定（設定画面から追加、または Zabbix を接続）</div>';
    return srvSummary(list) + list.map(function (s) {
      var node = isNode(s);
      var bars = [["CPU", s.cpu], ["MEM", s.mem], ["DISK", s.disk]];
      if (s.swap != null) bars.push(["SWAP", s.swap]);
      var res = !node ? "" : bars.map(function (r) {
        return '<div class="resbar"><span>' + r[0] + '</span><span class="bar"><i style="width:' + (r[1] || 0) + "%;background:" + bcolor(r[1]) + '"></i></span><span class="pc">' + (r[1] != null ? r[1] + "%" : "—") + "</span></div>";
      }).join("");
      var meta = "";
      if (node) {
        var mp = [];
        if (s.os) mp.push('<span class="mi">' + esc(shortOs(s.os)) + "</span>");
        if (s.uptime != null) mp.push('<span class="mi">稼働 ' + fmtUptime(s.uptime) + "</span>");
        if (s.load != null) mp.push('<span class="mi">負荷 ' + (s.load < 10 ? s.load.toFixed(2) : s.load.toFixed(1)) + "</span>");
        if (mp.length) meta = '<div class="srv-meta">' + mp.join("") + "</div>";
      }
      var svc = (s.services || []).map(function (p) {
        var metric = p.up === false ? '<span class="m-down">● 応答なし</span>'
          : '<span class="m-ok">稼働中</span><span class="m-ping">' + (p.ping != null ? p.ping : "–") + '<small>ms</small></span>' + (p.uptime != null ? '<span class="m-up">30日 ' + p.uptime + '%</span>' : '');
        return '<div class="svc-item' + (p.up === false ? " down" : "") + '"><span class="pd"></span><div class="svc-main"><span class="svc-name">' + esc(p.name) + '</span>' + (p.port ? '<span class="svc-port">:' + p.port + "</span>" : "") + '</div><div class="svc-metrics">' + metric + "</div></div>";
      }).join("");
      return '<div class="srv-card' + (s.up === false ? " down" : "") + '"><div class="srv-h"><span class="s"></span><span class="nm">🖥 ' + esc(s.name) + '</span><span class="ip">' + esc(s.host) + '</span></div>' + (node ? '<div class="srv-res">' + res + "</div>" + meta : "") + (svc ? '<div class="srv-svc"><div class="srv-svc-lab">公開サービス</div><div class="svc-list">' + svc + "</div></div>" : "") + "</div>";
    }).join("");
  }
  function renderServers() {
    var html = serverCardsHTML();
    ["srvCards", "srvCardsDash"].forEach(function (id) { if ($(id)) $(id).innerHTML = html; });
  }

  // ---------- sparkline (client-side room temp history) ----------
  var HIST_KEY = "mrv-temphist";
  function pushTempHist(t) {
    if (t == null) return;
    var arr = [];
    try { arr = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch (_) {}
    var now = Date.now(); var last = arr[arr.length - 1];
    if (!last || now - last.t > 9 * 60 * 1000) { arr.push({ t: now, v: t }); }
    arr = arr.filter(function (p) { return now - p.t <= 24 * 60 * 60 * 1000; });
    try { localStorage.setItem(HIST_KEY, JSON.stringify(arr)); } catch (_) {}
  }
  function drawSpark() {
    var el = $("spark"); if (!el) return;
    var arr = [];
    try { arr = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch (_) {}
    var data = arr.map(function (p) { return p.v; });
    if (data.length < 2) { el.innerHTML = '<div style="color:var(--faint);font-size:12px;padding:10px 0">推移を記録中…</div>'; return; }
    var w = 320, h = 90, pad = 6, min = Math.min.apply(null, data) - 0.6, max = Math.max.apply(null, data) + 0.6;
    var pts = data.map(function (v, i) { return [pad + (w - 2 * pad) * i / (data.length - 1), pad + (h - 2 * pad) * (1 - (v - min) / (max - min || 1))]; });
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var area = line + " L" + pts[pts.length - 1][0].toFixed(1) + " " + h + " L" + pts[0][0].toFixed(1) + " " + h + " Z";
    el.innerHTML = '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--mode);stop-opacity:.3"/><stop offset="1" style="stop-color:var(--mode);stop-opacity:0"/></linearGradient></defs><path d="' + area + '" fill="url(#sg)"/><path d="' + line + '" fill="none" style="stroke:var(--mode)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
  }

  // ---------- clock ----------
  var DOW = ["日", "月", "火", "水", "木", "金", "土"];
  function tick() {
    var d = new Date(), hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0"), ss = String(d.getSeconds()).padStart(2, "0");
    var dateStr = (d.getMonth() + 1) + "月" + d.getDate() + "日 (" + DOW[d.getDay()] + ")";
    if ($("bigTime")) $("bigTime").textContent = hh + ":" + mm;
    if ($("bigSec")) $("bigSec").textContent = ss;
    if ($("bigDate")) $("bigDate").textContent = dateStr;
    if ($("ambDate2")) $("ambDate2").textContent = dateStr;
    Array.prototype.forEach.call(document.querySelectorAll(".amb-clock"), function (el) { el.textContent = hh + ":" + mm; });
    if ($("miniClock")) $("miniClock").textContent = hh + ":" + mm;
    if ($("nTime")) $("nTime").textContent = hh + ":" + mm;
    if ($("nDate")) $("nDate").textContent = dateStr;
    $("ambientMusicTime").textContent = hh + ":" + mm;
    $("ambientMusicDate").textContent = dateStr;
    var h = d.getHours();
    if ($("greet")) $("greet").textContent = h < 5 ? "おやすみなさい" : h < 11 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";
    checkNight();
  }

  // ---------- slideshow ----------
  var allSlides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var dotsBox = $("dots"), order = [], cur = 0, slideTimer = null;
  function buildOrder() {
    var vis = allSlides.filter(function (s) {
      var k = s.getAttribute("data-key");
      if (k === "clock") return true;
      if (k === "weather") return settings.weather !== false;
      if (k === "room") return settings.room !== false;
      if (k === "server") return settings.server !== false;
      return true;
    });
    var ord = settings.slideOrder || [];
    vis.sort(function (a, b) {
      var ia = ord.indexOf(a.getAttribute("data-key")); if (ia < 0) ia = 999;
      var ib = ord.indexOf(b.getAttribute("data-key")); if (ib < 0) ib = 999;
      return ia - ib;
    });
    order = vis;
    dotsBox.innerHTML = ""; order.forEach(function () { dotsBox.appendChild(document.createElement("span")); });
    if (cur >= order.length) cur = 0; showCur();
  }
  function showCur() {
    allSlides.forEach(function (s) { s.classList.remove("active"); });
    if (order[cur]) order[cur].classList.add("active");
    Array.prototype.forEach.call(dotsBox.children, function (d, i) { d.classList.toggle("on", i === cur); });
  }
  function go(n) { if (!order.length) return; cur = (n + order.length) % order.length; showCur(); }
  function startSlides() {
    stopSlides();
    if (ambientMusicActive || $("dash").classList.contains("show") || $("night").classList.contains("show") || $("disaster").classList.contains("show")) return;
    if (order.length > 1) slideTimer = setInterval(function () { go(cur + 1); }, (settings.interval || 7) * 1000);
  }
  function stopSlides() { if (slideTimer) { clearInterval(slideTimer); slideTimer = null; } }

  // ---------- dashboard open/close ----------
  var dash = $("dash"), ambient = $("ambient"), idleTimer = null;
  function syncMusicAmbient() { document.body.classList.toggle("music-saver", ambientMusicActive && !dash.classList.contains("show")); }
  function openDash() { if ($("disaster").classList.contains("show")) return; dash.classList.add("show"); ambient.classList.add("amb-hide"); $("night").classList.remove("show"); syncMusicAmbient(); stopSlides(); resetIdle(); }
  function closeDash() { dash.classList.remove("show"); ambient.classList.remove("amb-hide"); clearTimeout(idleTimer); setPage("home"); syncMusicAmbient(); go(0); startSlides(); }
  function resetIdle() { clearTimeout(idleTimer); if (!$("pageDesktop").hidden) return; idleTimer = setTimeout(function () { if (!$("urlsheet").classList.contains("show")) closeDash(); }, (settings.idle || 20) * 1000); }
  function openFromAmbient() { openDash(); if (ambientMusicActive) setPage("music"); }
  ambient.addEventListener("click", openFromAmbient);
  ambient.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFromAmbient(); } });
  document.addEventListener("music-ambient", function (e) {
    ambientMusicActive = e.detail.active;
    ambient.classList.toggle("is-music", ambientMusicActive);
    ambient.setAttribute("aria-label", ambientMusicActive ? "音楽の操作画面を開く" : "操作画面を開く");
    syncMusicAmbient(); checkNight();
    if (ambientMusicActive) stopSlides(); else startSlides();
  });
  document.addEventListener("room-settings-request", function () { document.dispatchEvent(new CustomEvent("room-settings", { detail: settings })); });
  $("closeBtn").addEventListener("click", function (e) { e.stopPropagation(); closeDash(); });
  dash.addEventListener("pointerdown", resetIdle); dash.addEventListener("click", resetIdle);
  dash.addEventListener("input", resetIdle); dash.addEventListener("keydown", resetIdle);

  var navBtns = document.querySelectorAll("#dashNav button");
  function setPage(p) {
    Array.prototype.forEach.call(navBtns, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-page") === p ? "true" : "false"); });
    $("pageHome").hidden = p !== "home"; $("pageServer").hidden = p !== "server";
    $("pageMusic").hidden = p !== "music";
    $("pageDesktop").hidden = p !== "desktop";
    document.dispatchEvent(new CustomEvent("music-page", { detail: p === "music" }));
    document.dispatchEvent(new CustomEvent("desktop-page", { detail: p === "desktop" }));
    if (dash.classList.contains("show")) resetIdle();
  }
  Array.prototype.forEach.call(navBtns, function (b) { b.addEventListener("click", function (e) { e.stopPropagation(); setPage(this.getAttribute("data-page")); resetIdle(); }); });

  // settings URL overlay
  function renderSettingsUrl() { if ($("settingsUrl")) $("settingsUrl").textContent = location.origin + "/settings"; }
  $("settingsBtn").addEventListener("click", function (e) { e.stopPropagation(); $("urlsheet").classList.add("show"); clearTimeout(idleTimer); });
  $("urlClose").addEventListener("click", function () { $("urlsheet").classList.remove("show"); resetIdle(); });

  // ---------- night ----------
  var night = $("night"), snoozeUntil = 0;
  function isNightHour() { var h = new Date().getHours(), a = settings.nightStart || 0, b = settings.nightEnd == null ? 6 : settings.nightEnd; return a < b ? (h >= a && h < b) : a > b ? (h >= a || h < b) : false; }
  function checkNight() {
    ambient.classList.toggle("music-night", ambientMusicActive && isNightHour());
    var want = !ambientMusicActive && isNightHour() && Date.now() > snoozeUntil && !dash.classList.contains("show") && !$("disaster").classList.contains("show");
    if (want === night.classList.contains("show")) return;
    if (want) { stopSlides(); dash.classList.remove("show"); ambient.classList.remove("amb-hide"); night.classList.add("show"); }
    else { night.classList.remove("show"); if (!dash.classList.contains("show")) startSlides(); }
  }
  night.addEventListener("click", function () { snoozeUntil = Date.now() + 30000; night.classList.remove("show"); startSlides(); });

  // ---------- disaster ----------
  var dzMap = null, dzLayer = null;
  function ensureMap() {
    if (dzMap) return dzMap;
    dzMap = L.map("dzmap", { zoomControl: true, attributionControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(dzMap);
    dzLayer = L.layerGroup().addTo(dzMap);
    return dzMap;
  }
  var INTCOL = { "1": "#9fb0c0", "2": "#4e8fd6", "3": "#37a34a", "4": "#f0c419", "5-": "#ff9029", "5+": "#ff6a00", "6-": "#e5362a", "6+": "#b11117", "7": "#7d0b6b" };
  function shLabel(k) { return { "5-": "5弱", "5+": "5強", "6-": "6弱", "6+": "6強" }[k] || k; }

  var disasterVisible = false;
  function checkDisaster() {
    var q = state.quake, ty = state.typhoon, wn = state.warnings;
    var warnActive = wn && (wn.maxLevel === "warning" || wn.maxLevel === "emergency");
    var show = (q && q.active) || (ty && ty.active && warnActive) || warnActive;
    if (!show) { if (disasterVisible) hideDisaster(); return; }
    if (q && q.active) showQuake(q);
    else if (ty && ty.active) showTyphoon(ty, wn);
    else showWarnings(wn);
  }
  function openDz() {
    if (disasterVisible) return;
    disasterVisible = true; $("disaster").classList.add("show"); night.classList.remove("show");
    dash.classList.remove("show"); ambient.classList.remove("amb-hide");
    setPage("home"); syncMusicAmbient(); stopSlides();
    setTimeout(function () { if (dzMap) dzMap.invalidateSize(); }, 200);
  }
  function hideDisaster() { disasterVisible = false; $("disaster").classList.remove("show"); startSlides(); }
  $("dzClose").addEventListener("click", hideDisaster);

  function showQuake(q) {
    openDz();
    $("dzBar").className = "dz-bar"; $("dzIcon").textContent = "⚠️";
    $("dzTitle").textContent = "地震情報 ・ 最大震度 " + (q.maxInt ? shLabel(q.maxInt) : "—");
    $("dzSub").textContent = (q.watchHit ? q.watchHit + "で揺れを観測" : (q.hypocenter || "")) ;
    ensureMap(); dzMap.setView([35.498, 140.115], 9); // 市原市
    dzLayer.clearLayers();
    addQuakeMarkers(q);
    loadChibaGeo(q);
    var info = [["震源地", q.hypocenter], ["マグニチュード", q.magnitude ? "M" + q.magnitude : "—"], ["発生時刻", q.time ? new Date(q.time).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"], ["津波", q.tsunami || "—"]];
    var byInt = {};
    (q.cities || []).forEach(function (c) { (byInt[c.int] = byInt[c.int] || []).push(c.name); });
    var listHtml = Object.keys(byInt).sort(function (a, b) { return Object.keys(INTCOL).indexOf(b) - Object.keys(INTCOL).indexOf(a); })
      .map(function (k) { return '<div style="margin-bottom:6px"><span style="display:inline-block;min-width:44px;text-align:center;font-weight:700;color:#fff;background:' + INTCOL[k] + ';border-radius:7px;padding:3px 6px;margin-right:8px">' + shLabel(k) + '</span>' + esc(byInt[k].slice(0, 8).join("、")) + "</div>"; }).join("");
    $("dzSide").innerHTML =
      '<div class="dz-card"><h3>震源</h3><div class="dz-info">' + info.map(function (i) { return '<div class="i"><div class="k">' + i[0] + '</div><div class="v">' + esc(i[1] || "—") + "</div></div>"; }).join("") + "</div></div>" +
      '<div class="dz-card"><h3>各地の震度</h3>' + (listHtml || '<div style="color:var(--faint)">市区町村データなし</div>') + "</div>" +
      '<div class="dz-card"><h3>凡例</h3><div class="legend">' + Object.keys(INTCOL).map(function (k) { return '<span class="l"><span class="sw" style="background:' + INTCOL[k] + '"></span>' + shLabel(k) + "</span>"; }).join("") + "</div></div>";
  }
  function addQuakeMarkers(q) {
    // 代表地点（座標既知）。市区町村データから震度を引く。
    var pts = { "市原市": [35.498, 140.115], "千葉市": [35.607, 140.106] };
    Object.keys(pts).forEach(function (name) {
      var c = (q.cities || []).find(function (x) { return x.name && x.name.indexOf(name.replace(/市$/, "")) >= 0; });
      var intk = c ? c.int : q.maxInt;
      L.circleMarker(pts[name], { radius: 12, color: "#fff", weight: 2, fillColor: INTCOL[intk] || "#888", fillOpacity: .9 })
        .addTo(dzLayer).bindTooltip(name + " 震度" + shLabel(intk || "—"), { permanent: true, direction: "top" });
    });
  }
  var chibaGeo = null, chibaTried = false;
  function loadChibaGeo(q) {
    if (chibaTried) return applyGeo(q);
    chibaTried = true;
    fetch("/geo/chiba.geojson").then(function (r) { return r.ok ? r.json() : null; }).then(function (g) { chibaGeo = g; applyGeo(q); }).catch(function () {});
  }
  function applyGeo(q) {
    if (!chibaGeo || !dzLayer) return;
    var intByCity = {}; (q.cities || []).forEach(function (c) { if (c.name) intByCity[c.name] = c.int; });
    L.geoJSON(chibaGeo, {
      style: function (f) {
        var nm = f.properties && (f.properties.N03_004 || f.properties.name || f.properties.CITY_NAME);
        var intk = nm ? (intByCity[nm] || intByCity[nm + "市"]) : null;
        return { color: "#ffffff", weight: .6, fillColor: intk ? INTCOL[intk] : "#2a3340", fillOpacity: intk ? .75 : .25 };
      },
    }).addTo(dzLayer);
  }

  function showTyphoon(ty, wn) {
    openDz();
    $("dzBar").className = "dz-bar warn"; $("dzIcon").textContent = "🌀";
    $("dzTitle").textContent = "台風情報 ・ 接近中";
    $("dzSub").textContent = "気象庁の台風情報（" + (ty.count || 1) + "個 活動中）";
    ensureMap(); dzMap.setView([34.8, 140.2], 7); dzLayer.clearLayers();
    L.circleMarker([35.607, 140.106], { radius: 8, color: "#fff", weight: 2, fillColor: "#e2231a", fillOpacity: .9 }).addTo(dzLayer).bindTooltip("千葉", { permanent: true, direction: "top" });
    // 実データの進路（forecast）があれば描画。構造は今後拡張。
    var items = (wn && wn.items) || [];
    $("dzSide").innerHTML =
      '<div class="dz-card"><h3>台風</h3><div style="font-size:14px;color:var(--muted)">気象庁の進路予報に基づき、現在地・予報円・暴風域を地図に表示します（実データ取得時）。</div></div>' +
      '<div class="dz-card"><h3>' + (settings.region || "") + 'の警報・注意報</h3>' + (items.length ? items.map(function (w) { var col = w.level === "emergency" ? "#b2001a" : w.level === "warning" ? "var(--alert)" : "#f0c419"; var tc = w.level === "advisory" ? "#3a2e00" : "#fff"; return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="background:' + col + ';color:' + tc + ';border-radius:6px;padding:3px 8px;font-size:12px;font-weight:700">' + (w.level === "advisory" ? "注意報" : "警報") + '</span>' + esc(w.name) + "</div>"; }).join("") : '<div style="color:var(--faint)">なし</div>') + "</div>";
  }

  function showWarnings(wn) {
    openDz();
    var emg = wn.maxLevel === "emergency";
    $("dzBar").className = "dz-bar" + (emg ? "" : " warn"); $("dzIcon").textContent = "⚠️";
    $("dzTitle").textContent = (emg ? "特別警報" : "気象警報") + " 発表中";
    $("dzSub").textContent = (settings.region || "") + " に警報が出ています";
    ensureMap(); dzMap.setView([35.5, 140.1], 9); dzLayer.clearLayers();
    $("dzSide").innerHTML = '<div class="dz-card"><h3>' + (settings.region || "") + 'の警報・注意報</h3>' +
      wn.items.map(function (w) { var col = w.level === "emergency" ? "#b2001a" : w.level === "warning" ? "var(--alert)" : "#f0c419"; var tc = w.level === "advisory" ? "#3a2e00" : "#fff"; return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="background:' + col + ';color:' + tc + ';border-radius:6px;padding:3px 8px;font-size:12px;font-weight:700">' + (w.level === "advisory" ? "注意報" : "警報") + '</span>' + esc(w.name) + "</div>"; }).join("") + "</div>";
  }

  // ---------- boot ----------
  tick(); setInterval(tick, 1000);
  buildOrder(); startSlides();
  connect();
  // Run after music.js has installed its page listener.
  document.addEventListener("DOMContentLoaded", function () {
    if (location.pathname === "/music") { openDash(); setPage("music"); }
    if (location.pathname === "/desktop") { openDash(); setPage("desktop"); }
  });
})();
