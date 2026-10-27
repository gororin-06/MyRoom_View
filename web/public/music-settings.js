"use strict";
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var saved = {}, busy = false, loaded = false;
  $("maSave").disabled = $("maTest").disabled = true;
  function status(text, error) { $("maStatus").textContent = text; $("maStatus").classList.toggle("music-error", !!error); }
  function connection(state, text) {
    $("maConnectionBadge").dataset.state = state;
    $("maConnectionBadge").querySelector("span").textContent = text;
    $("maGuideServer").textContent = state === "connected" ? "接続済み" : state === "error" ? "接続を確認してください" : "接続待ち";
    $("maGuideServer").dataset.ready = String(state === "connected");
  }
  async function request(url, body) {
    var r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    var data = await r.json();
    if (!r.ok) throw new Error(data.error || "操作に失敗しました");
    return data;
  }
  function fill(c) {
    saved = c;
    $("maEnabled").checked = c.enabled; $("maUrl").value = c.url;
    $("maToken").value = ""; $("maClearToken").checked = false;
    $("maToken").placeholder = c.tokenConfigured ? "登録済み（空欄で保持）" : "未登録";
    $("maToken").type = "password";
    $("maRevealToken").textContent = "表示";
    $("maRevealToken").setAttribute("aria-pressed", "false");
    $("maRevealToken").setAttribute("aria-label", "トークンを表示");
    $("maDirty").dataset.dirty = "false";
    $("maDirty").textContent = c.tokenConfigured ? "保存済み" : "接続情報を入力してください";
    connection("idle", c.enabled ? "設定済み" : "未接続");
  }
  function playerOptions(players) {
    var select = $("maDefaultPlayer"); select.replaceChildren();
    var list = [{ id: "", name: "利用可能な再生先を自動選択" }].concat(players);
    if (saved.defaultPlayer && !players.some(function (p) { return p.id === saved.defaultPlayer; })) list.push({ id: saved.defaultPlayer, name: "以前の再生先（未接続）" });
    list.forEach(function (p) { var o = document.createElement("option"); o.value = p.id; o.textContent = p.name + (p.available === false ? "（オフライン）" : ""); select.appendChild(o); });
    select.value = saved.defaultPlayer;
  }
  async function loadPlayers() {
    var result = await request("/api/music/players"); playerOptions(result.players);
    connection("connected", "接続済み");
    var count = result.players.filter(function (p) { return p.available; }).length;
    $("maPlayerCount").textContent = count ? count + "台の再生先が利用可能" : "Windowsのアプリを起動してください";
    $("maPlayerCount").dataset.ready = String(count > 0);
    return result.players;
  }
  async function save(test) {
    if (!loaded || busy || !$("musicConfigForm").reportValidity()) return;
    busy = true; $("maSave").disabled = $("maTest").disabled = true;
    status("保存中…");
    try {
      var c = await request("/api/music/config", {
        enabled: $("maEnabled").checked, url: $("maUrl").value.trim(), token: $("maToken").value,
        clearToken: $("maClearToken").checked, defaultPlayer: $("maDefaultPlayer").value,
      });
      fill(c);
      if (test && c.enabled) {
        status("保存しました。接続を確認中…");
        try {
          var players = await loadPlayers();
          status("接続できました。利用可能な再生先: " + players.filter(function (p) { return p.available; }).length + "台。初期の再生先を選んだ後は保存してください。");
        } catch (e) { connection("error", "接続エラー"); status("保存しました。接続確認: " + e.message, true); }
      } else {
        status(c.enabled ? "保存しました" : "保存しました。音楽の接続は無効です。");
        if (c.enabled) {
          try { await loadPlayers(); }
          catch (e) { connection("error", "接続エラー"); status("保存しました。接続確認: " + e.message, true); }
        } else {
          $("maPlayerCount").textContent = "再生先は未確認"; $("maPlayerCount").dataset.ready = "false";
        }
      }
    } catch (e) { status(e.message, true); }
    finally { busy = false; $("maSave").disabled = $("maTest").disabled = false; }
  }
  $("musicConfigForm").addEventListener("submit", function (e) { e.preventDefault(); save(false); });
  $("maTest").addEventListener("click", function () { save(true); });
  $("musicConfigForm").addEventListener("input", function () {
    $("maDirty").dataset.dirty = "true"; $("maDirty").textContent = "未保存の変更があります";
  });
  $("maRevealToken").addEventListener("click", function () {
    var reveal = $("maToken").type === "password";
    $("maToken").type = reveal ? "text" : "password";
    this.textContent = reveal ? "隠す" : "表示";
    this.setAttribute("aria-pressed", String(reveal));
    this.setAttribute("aria-label", reveal ? "トークンを隠す" : "トークンを表示");
  });
  request("/api/music/config").then(async function (c) {
    fill(c); playerOptions([]);
    loaded = true; $("maSave").disabled = $("maTest").disabled = false;
    if (c.enabled) {
      try { await loadPlayers(); status("接続設定を読み込みました"); }
      catch (e) { connection("error", "接続エラー"); status(e.message, true); }
    } else { status("未接続。URLとトークンを入力して保存してください。"); }
  }).catch(function (e) { status(e.message, true); });
})();
