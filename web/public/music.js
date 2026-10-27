"use strict";
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var players = [], selected = "", connected = false, busy = false, searching = false;
  var refreshing = false, searchVersion = 0, resultButtons = [], receivedAt = 0;
  var recent = [];
  try { recent = JSON.parse(localStorage.getItem("myroom-music-searches") || "[]").filter(function (s) { return typeof s === "string" && s.length <= 200; }).slice(0, 6); } catch (_) {}
  function message(id, text, error) { $(id).textContent = text; $(id).classList.toggle("music-error", !!error); }
  async function api(url, body) {
    var r = await fetch(url, body === undefined ? { cache: "no-store" } : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    var data = await r.json();
    if (!r.ok) throw new Error(data.error || "操作に失敗しました");
    return data;
  }
  function current() { return players.find(function (p) { return p.id === selected; }); }
  function formatTime(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "--:--";
    return Math.floor(value / 60) + ":" + String(Math.floor(value % 60)).padStart(2, "0");
  }
  function imageFor(container, url) {
    if (container.dataset.image === (url || "")) return;
    container.querySelector("img")?.remove();
    container.dataset.image = url || "";
    if (!url) return;
    try { if (!["http:", "https:"].includes(new URL(url).protocol)) return; } catch (_) { return; }
    var img = document.createElement("img"); img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
    img.addEventListener("error", function () { img.remove(); });
    img.src = url; container.appendChild(img);
  }
  function updateControls() {
    var p = current(), ready = connected && p && p.available && !busy;
    document.querySelectorAll("[data-music-action]").forEach(function (b) { b.disabled = !ready; });
    resultButtons.forEach(function (entry) { entry.button.disabled = !ready || !entry.available; });
    $("musicVolume").disabled = !ready || p.volume == null;
    if (p && p.volume != null && document.activeElement !== $("musicVolume")) $("musicVolume").value = p.volume;
    $("musicVolumeValue").textContent = p && p.volume != null ? p.volume + "%" : "—";
    $("musicTitle").textContent = p && p.title || "曲を選んで再生";
    $("musicArtist").textContent = p && p.artist || (p && p.title ? "" : "音楽と再生先を選択してください");
    $("musicPlayback").textContent = !p ? "再生先を選択してください" : !p.available ? "オフライン" : ({ playing: "再生中", paused: "一時停止中", idle: "停止中" }[p.state] || p.state);
    var playing = !!(p && p.state === "playing");
    $("musicPauseLabel").textContent = playing ? "一時停止" : "再生";
    $("musicPause").setAttribute("aria-label", playing ? "一時停止" : "再生");
    $("musicPause").dataset.playing = String(playing);
    $("musicTime").textContent = formatTime(p?.elapsed) + " / " + formatTime(p?.duration);
    $("musicProgress").value = p?.duration > 0 && p.elapsed != null ? Math.min(100, p.elapsed / p.duration * 100) : 0;
    imageFor($("musicNowArt"), p?.image);
    var badge = $("musicDeviceStatus");
    badge.dataset.state = connected && p && p.available ? "connected" : "idle";
    badge.querySelector("span").textContent = !connected ? "未接続" : !p ? "再生先なし" : !p.available ? "オフライン" : playing ? "再生中" : "接続済み";
    $("musicSetupLink").hidden = connected;
    $("musicSearchButton").disabled = !connected || searching;
    document.querySelectorAll("[data-music-query]").forEach(function (b) { b.disabled = !connected; });
    var deviceLabel = p ? p.name + "で再生" : "再生先を選択";
    $("musicDeviceToggleBottom").title = deviceLabel;
    $("musicDeviceToggleBottom").setAttribute("aria-label", deviceLabel);
    document.dispatchEvent(new CustomEvent("music-state", { detail: { player: p || null, connected: connected, receivedAt: receivedAt } }));
  }
  function renderPlayers() {
    var selector = $("musicPlayer");
    var options = players.map(function (p) { return { value: p.id, text: p.name + (p.available ? "" : "（オフライン）") }; });
    if (selected && !players.some(function (p) { return p.id === selected; })) options.unshift({ value: selected, text: "以前の再生先（未接続）" });
    options.unshift({ value: "", text: "再生先を選択" });
    var signature = JSON.stringify(options);
    if (selector.dataset.options !== signature) {
      selector.replaceChildren();
      options.forEach(function (o) { var el = document.createElement("option"); el.value = o.value; el.textContent = o.text; selector.appendChild(el); });
      selector.dataset.options = signature;
    }
    selector.value = selected; updateControls();
  }
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      var cfg = await api("/api/music/config");
      if (!cfg.enabled) throw new Error("設定画面でMusic Assistantの接続を有効にしてください。");
      var data = await api("/api/music/players");
      players = data.players; connected = true;
      receivedAt = Date.now();
      if (!selected) selected = cfg.defaultPlayer || (players.find(function (p) { return p.available; }) || {}).id || "";
      renderPlayers();
      message("musicConnection", players.some(function (p) { return p.available; }) ? "Music Assistantに接続済み · 再生先は右上のデバイスボタンで選択できます" : "再生先がありません。Windows PCで再生アプリを起動してください。");
    } catch (e) { connected = false; message("musicConnection", e.message, true); }
    finally { refreshing = false; updateControls(); }
  }
  async function control(action, extra) {
    var p = current();
    if (!connected || busy || !p || !p.available) return;
    busy = true; updateControls(); message("musicActionStatus", "操作中…");
    try {
      await api("/api/music/control", Object.assign({ playerId: selected, action: action }, extra));
      message("musicActionStatus", "操作しました");
    } catch (e) { message("musicActionStatus", e.message, true); }
    finally { busy = false; updateControls(); await refresh(); }
  }
  function setNav(view) {
    document.querySelectorAll("[data-music-view]").forEach(function (b) {
      if (b.dataset.musicView === view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
  }
  function setType(type) {
    $("musicType").value = type;
    document.querySelectorAll("[data-music-type]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.musicType === type)); });
  }
  function closeMenu() {
    $("pageMusic").classList.remove("is-menu-open"); $("musicSidebarBackdrop").hidden = true;
    $("musicMenuToggle").setAttribute("aria-expanded", "false");
  }
  var deviceTrigger = null;
  function devices(show, trigger) {
    $("musicDevicePanel").hidden = !show;
    ["musicDeviceToggle", "musicDeviceToggleBottom"].forEach(function (id) { $(id).setAttribute("aria-expanded", String(show)); });
    if (show) { deviceTrigger = trigger; closeMenu(); $("musicPlayer").focus(); }
    else if (deviceTrigger && !$("pageMusic").hidden) { deviceTrigger.focus(); deviceTrigger = null; }
  }
  function home() {
    ++searchVersion; searching = false; resultButtons = [];
    $("musicResults").replaceChildren(); $("musicHome").hidden = false; $("musicEmpty").hidden = true;
    $("musicSectionTitle").textContent = "聴きたい音楽を、いつでも。"; $("musicSectionEyebrow").textContent = "MYROOM MUSIC";
    message("musicSearchStatus", "登録した音楽サービスとライブラリーから探せます。");
    setNav("home"); closeMenu(); updateControls(); $("musicContent").scrollTop = 0;
  }
  function renderRecent() {
    if (!recent.length) return;
    $("musicRecentSearches").replaceChildren();
    recent.forEach(function (q) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = q;
      b.addEventListener("click", function () { $("musicQuery").value = q; closeMenu(); search(); });
      $("musicRecentSearches").appendChild(b);
    });
  }
  function renderResults(items) {
    $("musicResults").replaceChildren(); resultButtons = [];
    $("musicResults").dataset.type = $("musicType").value;
    items.forEach(function (item, index) {
      var row = document.createElement("div"); row.className = "music-result";
      var number = document.createElement("span"); number.className = "music-track-number"; number.textContent = String(index + 1);
      var art = document.createElement("span"); art.className = "music-track-art"; art.textContent = item.type === "playlist" ? "≡" : item.type === "album" ? "◎" : "♫"; art.setAttribute("aria-hidden", "true");
      imageFor(art, item.image);
      var info = document.createElement("div"); info.className = "music-result-info";
      var name = document.createElement("strong"); name.textContent = item.name;
      var provider = item.provider || "";
      if (/^(ytmusic|youtube_music)/.test(provider)) provider = "YouTube Music";
      else if (provider === "library") provider = "ライブラリー";
      var sub = document.createElement("small"); sub.textContent = [item.artist, item.album, provider].filter(Boolean).join(" · ");
      info.append(name, sub);
      var duration = document.createElement("span"); duration.className = "music-track-duration"; duration.textContent = item.duration ? formatTime(item.duration) : "";
      var button = document.createElement("button"); button.type = "button";
      button.appendChild($("musicPause").querySelector(".icon-play").cloneNode(true));
      button.setAttribute("aria-label", item.name + (item.available ? "を再生" : "は再生不可"));
      button.title = item.available ? "再生（現在のキューを置き換え）" : "再生不可";
      button.addEventListener("click", function () { control("play_media", { uri: item.uri }); });
      resultButtons.push({ button: button, available: item.available }); row.append(number, art, info, duration, button);
      $("musicResults").appendChild(row);
    });
    updateControls();
  }
  async function search() {
    var query = $("musicQuery").value.trim();
    if (!query || !connected) return;
    var version = ++searchVersion, type = $("musicType").value;
    searching = true; updateControls(); closeMenu();
    $("musicHome").hidden = true; $("musicEmpty").hidden = true; $("musicResults").replaceChildren(); resultButtons = [];
    $("musicSectionTitle").textContent = query; $("musicSectionEyebrow").textContent = "検索結果";
    setNav(type === "playlist" ? "playlist" : "search");
    message("musicSearchStatus", "検索中…");
    try {
      var data = await api("/api/music/search?q=" + encodeURIComponent(query) + "&type=" + type);
      if (version !== searchVersion) return;
      message("musicSearchStatus", data.items.length ? data.items.length + "件の検索結果 · 再生すると選んだデバイスのキューを置き換えます" : "見つかりませんでした。");
      if (!data.items.length) {
        $("musicEmpty").hidden = false; $("musicEmpty").querySelector("h3").textContent = "音楽が見つかりませんでした";
        $("musicEmpty").querySelector("p").textContent = "検索する言葉や、曲・アルバムなどの種類を変えてみてください。";
      }
      renderResults(data.items);
      recent = [query].concat(recent.filter(function (s) { return s !== query; })).slice(0, 6);
      try { localStorage.setItem("myroom-music-searches", JSON.stringify(recent)); } catch (_) {}
      renderRecent();
    } catch (e) {
      if (version !== searchVersion) return;
      message("musicSearchStatus", e.message, true); $("musicEmpty").hidden = false;
      $("musicEmpty").querySelector("h3").textContent = "検索できませんでした";
      $("musicEmpty").querySelector("p").textContent = "接続を確認して、もう一度検索してください。";
    } finally { if (version === searchVersion) { searching = false; updateControls(); } }
  }
  $("musicPlayer").addEventListener("change", function () { selected = this.value; message("musicActionStatus", ""); updateControls(); });
  $("musicRefresh").addEventListener("click", refresh);
  document.querySelectorAll("[data-music-action]").forEach(function (b) { b.addEventListener("click", function () { control(b.dataset.musicAction); }); });
  $("musicVolume").addEventListener("input", function () { $("musicVolumeValue").textContent = this.value + "%"; });
  $("musicVolume").addEventListener("change", function () { control("volume", { volume: +this.value }); });
  $("musicSearch").addEventListener("submit", function (e) { e.preventDefault(); search(); });
  $("musicType").addEventListener("change", function () { setType(this.value); if ($("musicQuery").value.trim()) search(); });
  document.querySelectorAll("[data-music-type]").forEach(function (b) { b.addEventListener("click", function () { setType(b.dataset.musicType); if ($("musicQuery").value.trim()) search(); }); });
  document.querySelectorAll("[data-music-query]").forEach(function (b) { b.addEventListener("click", function () { setType("playlist"); $("musicQuery").value = b.dataset.musicQuery; search(); }); });
  document.querySelectorAll("[data-music-view]").forEach(function (b) { b.addEventListener("click", function () {
    if (b.dataset.musicView === "home") { home(); return; }
    setNav(b.dataset.musicView); closeMenu();
    if (b.dataset.musicView === "playlist") { setType("playlist"); if ($("musicQuery").value.trim()) search(); }
    $("musicQuery").focus();
  }); });
  $("musicBrandHome").addEventListener("click", home);
  $("musicReturnHome").addEventListener("click", function () { document.querySelector('#dashNav [data-page="home"]').click(); });
  $("musicMenuToggle").addEventListener("click", function () {
    if (window.innerWidth <= 650) {
      var open = $("pageMusic").classList.toggle("is-menu-open"); $("musicSidebarBackdrop").hidden = !open; this.setAttribute("aria-expanded", String(open));
    } else { $("pageMusic").classList.toggle("is-collapsed"); this.setAttribute("aria-expanded", String(!$("pageMusic").classList.contains("is-collapsed"))); }
  });
  $("musicSidebarBackdrop").addEventListener("click", closeMenu);
  ["musicDeviceToggle", "musicDeviceToggleBottom", "musicSidebarDevices"].forEach(function (id) {
    $(id).addEventListener("click", function () { devices($("musicDevicePanel").hidden, this); });
  });
  $("musicDeviceClose").addEventListener("click", function () { devices(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("pageMusic").hidden) { devices(false); closeMenu(); } });
  document.addEventListener("pointerdown", function (e) {
    if (!$("musicDevicePanel").hidden && !$("musicDevicePanel").contains(e.target) && !e.target.closest("#musicDeviceToggle, #musicDeviceToggleBottom, #musicSidebarDevices")) devices(false);
  });
  document.addEventListener("music-page", function (e) {
    document.body.classList.toggle("music-view", e.detail);
    if (e.detail) {
      refresh();
    } else { devices(false); closeMenu(); }
  });
  $("musicMenuToggle").setAttribute("aria-expanded", String(window.innerWidth > 650));
  renderRecent(); updateControls();
  // Playback can start on another device while this display is idle.
  refresh();
  setInterval(function () { if (!document.hidden) refresh(); }, 5000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
})();
