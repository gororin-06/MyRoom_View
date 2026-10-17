"use strict";
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); };
  var escAttr = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  var s = {};         // settings
  var nodes = [];     // zabbix nodes
  var toastT = null;

  function toast() { var t = $("toast"); t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 1200); }

  function save(patch) {
    Object.assign(s, patch);
    fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
      .then(function (r) { return r.json(); }).then(function () { toast(); }).catch(function () {});
    // 注意: ここで s を応答で丸ごと差し替えない。差し替えると各カードのハンドラが握る
    // オブジェクト参照が切れ、「＋サービスを追加」等が効かなくなる。s は上の
    // Object.assign(s, patch) で既に最新。
  }

  // ---- load ----
  Promise.all([
    fetch("/api/settings").then(function (r) { return r.json(); }),
    fetch("/api/state").then(function (r) { return r.json(); }).catch(function () { return {}; }),
    fetch("/api/update").then(function (r) { return r.json(); }).catch(function () { return null; }),
  ]).then(function (res) {
    s = res[0] || {}; nodes = (res[1] && res[1].nodes) || []; var upd = res[2];
    fill(); renderServers(); renderNodes(); renderUpdate(upd); renderSlideOrder();
  });

  // ---- スライド表示順 ----
  var SLIDES = [{ k: "clock", label: "時計" }, { k: "weather", label: "天気" }, { k: "room", label: "室内環境" }, { k: "server", label: "自宅サーバー" }];
  function normOrder(ord) {
    var keys = SLIDES.map(function (x) { return x.k; });
    var o = (ord || []).filter(function (k) { return keys.indexOf(k) >= 0; });
    keys.forEach(function (k) { if (o.indexOf(k) < 0) o.push(k); });
    return o;
  }
  function labelOf(k) { for (var i = 0; i < SLIDES.length; i++) if (SLIDES[i].k === k) return SLIDES[i].label; return k; }
  function renderSlideOrder() {
    var box = $("slideOrder"); if (!box) return;
    var o = normOrder(s.slideOrder);
    box.innerHTML = o.map(function (k, i) {
      return '<div class="ord-row"><span class="ord-n">' + (i + 1) + '</span><span class="ord-name">' + esc(labelOf(k)) + '</span><span class="ord-btns"><button data-k="' + k + '" data-dir="up"' + (i === 0 ? " disabled" : "") + '>↑</button><button data-k="' + k + '" data-dir="down"' + (i === o.length - 1 ? " disabled" : "") + '>↓</button></span></div>';
    }).join("");
  }
  if ($("slideOrder")) $("slideOrder").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-k]"); if (!b) return;
    var o = normOrder(s.slideOrder); var i = o.indexOf(b.getAttribute("data-k"));
    var j = b.getAttribute("data-dir") === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= o.length) return;
    var t = o[i]; o[i] = o[j]; o[j] = t;
    save({ slideOrder: o }); renderSlideOrder();
  });

  function fill() {
    $("roomName").value = s.roomName || "";
    $("region").value = s.region || "千葉県";
    $("interval").value = s.interval || 7; $("intervalV").textContent = (s.interval || 7) + "秒";
    $("idle").value = s.idle || 20; $("idleV").textContent = (s.idle || 20) + "秒";
    $("weather").checked = s.weather !== false; $("room").checked = s.room !== false; $("server").checked = s.server !== false;
    $("nStart").value = s.nightStart || 0; $("nEnd").value = s.nightEnd == null ? 6 : s.nightEnd;
    $("autoUpdate").checked = s.autoUpdate !== false;
    $("sub").textContent = location.host + " ・ 設定";
  }

  // ---- simple bindings ----
  $("roomName").addEventListener("change", function () { save({ roomName: this.value }); });
  $("region").addEventListener("change", function () { save({ region: this.value }); });
  $("interval").addEventListener("input", function () { $("intervalV").textContent = this.value + "秒"; }); $("interval").addEventListener("change", function () { save({ interval: +this.value }); });
  $("idle").addEventListener("input", function () { $("idleV").textContent = this.value + "秒"; }); $("idle").addEventListener("change", function () { save({ idle: +this.value }); });
  $("weather").addEventListener("change", function () { save({ weather: this.checked }); });
  $("room").addEventListener("change", function () { save({ room: this.checked }); });
  $("server").addEventListener("change", function () { save({ server: this.checked }); });
  $("nStart").addEventListener("change", function () { save({ nightStart: +this.value }); });
  $("nEnd").addEventListener("change", function () { save({ nightEnd: +this.value }); });
  $("autoUpdate").addEventListener("change", function () { save({ autoUpdate: this.checked }); });

  // ---- self-monitored servers ----
  function renderServers() {
    var box = $("srvList"); box.innerHTML = "";
    (s.servers || []).forEach(function (sv, idx) {
      var el = document.createElement("div"); el.className = "srv";
      var rows = (sv.services || []).map(function (x, si) {
        var addr = x.host ? x.host + ":" + (x.port == null ? "" : x.port) : (x.port == null ? "" : String(x.port));
        return '<div class="svc-row" data-si="' + si + '"><span class="d"></span><input type="text" data-sf="n" value="' + escAttr(x.name) + '" placeholder="Minecraft"><span class="colon">@</span><input type="text" inputmode="text" data-sf="p" value="' + escAttr(addr) + '" placeholder="192.168.1.30:25565 または 25565"><button class="svc-del">🗑</button></div>';
      }).join("");
      el.innerHTML =
        '<div class="sh"><span class="dot"></span><span class="nm">' + esc(sv.name || "サーバー") + '</span><button class="del">🗑</button></div>' +
        '<div class="field"><label>名前</label><input type="text" data-f="name" value="' + escAttr(sv.name) + '"></div>' +
        '<div class="field"><label>接続先 IP / ホスト名</label><input type="text" data-f="host" value="' + escAttr(sv.host) + '" placeholder="192.168.1.30"></div>' +
        '<div class="svc-wrap"><label class="svc-lab">監視サービス（サービス名 と ポート）</label><div class="svc-list">' + rows + '</div><button class="add svc-add" style="margin-top:8px;padding:10px">＋ サービスを追加</button></div>';
      el.querySelectorAll("input[data-f]").forEach(function (inp) { inp.addEventListener("change", function () { sv[this.getAttribute("data-f")] = this.value; if (this.getAttribute("data-f") === "name") el.querySelector(".sh .nm").textContent = this.value; commitServers(); }); });
      el.querySelectorAll(".svc-row").forEach(function (rowEl) {
        var si = +rowEl.getAttribute("data-si");
        rowEl.querySelectorAll("input[data-sf]").forEach(function (inp) { inp.addEventListener("change", function () { var f = this.getAttribute("data-sf"); if (f === "p") { var raw = (this.value || "").trim(); var h = null, p = null; if (raw.indexOf(":") >= 0) { var parts = raw.split(":"); p = parseInt(parts.pop(), 10); h = parts.join(":").trim() || null; } else { p = parseInt(raw, 10); } sv.services[si].host = h || undefined; sv.services[si].port = isNaN(p) ? null : p; } else sv.services[si].name = this.value; commitServers(); }); });
        rowEl.querySelector(".svc-del").addEventListener("click", function () { sv.services.splice(si, 1); commitServers(); renderServers(); });
      });
      el.querySelector(".svc-add").addEventListener("click", function () { (sv.services = sv.services || []).push({ name: "", port: null }); commitServers(); renderServers(); });
      el.querySelector(".del").addEventListener("click", function () { s.servers.splice(idx, 1); commitServers(); renderServers(); });
      box.appendChild(el);
    });
  }
  function commitServers() { save({ servers: s.servers }); }
  $("srvAdd").addEventListener("click", function () { (s.servers = s.servers || []).push({ name: "新しいサーバー", host: "", services: [] }); commitServers(); renderServers(); });

  // ---- zabbix nodes show/hide ----
  function renderNodes() {
    var box = $("nodeList");
    if (!nodes.length) { box.innerHTML = '<div class="desc">Zabbix 未接続、またはホストなし（.env の ZABBIX_URL / ZABBIX_TOKEN を設定）</div>'; return; }
    var hidden = new Set(s.hiddenHosts || []);
    box.innerHTML = "";
    nodes.forEach(function (n) {
      var el = document.createElement("div"); el.className = "srv";
      el.innerHTML = '<div class="sh"><span class="dot' + (n.up ? "" : " off") + '"></span><div class="hinfo"><span class="nm">' + esc(n.name) + '</span><span class="hhost">' + esc(n.ip || "") + '</span></div><label class="sw small"><input type="checkbox" ' + (hidden.has(n.hostid) ? "" : "checked") + '><span class="tr"></span></label></div>';
      el.querySelector("input").addEventListener("change", function () {
        var set = new Set(s.hiddenHosts || []);
        if (this.checked) set.delete(n.hostid); else set.add(n.hostid);
        save({ hiddenHosts: Array.from(set) });
      });
      box.appendChild(el);
    });
  }

  // ---- update ----
  function renderUpdate(upd) {
    if (!upd) { $("curVer").textContent = "—"; $("updHint").textContent = "取得できませんでした"; return; }
    $("curVer").textContent = upd.current || "—";
    if (upd.latest && !upd.upToDate) $("updHint").textContent = "新しい " + upd.latest.tag + " が利用可能";
    else $("updHint").textContent = upd.at ? "最終確認: " + new Date(upd.at).toLocaleString("ja-JP", { hour: "2-digit", minute: "2-digit" }) + " ・ 最新です" : "GitHub の最新を自動取得";
  }
  $("updCheck").addEventListener("click", function () { this.textContent = "確認中…"; var self = this; fetch("/api/update/check", { method: "POST" }).then(function (r) { return r.json(); }).then(function (u) { renderUpdate(u); self.textContent = "確認する"; toast(); }).catch(function () { self.textContent = "確認する"; }); });
})();
