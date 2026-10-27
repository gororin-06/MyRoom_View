"use strict";
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var cfg = null, running = false, selectedId = "";
  try { selectedId = localStorage.getItem("myroom-desktop-target") || ""; } catch (_) {}
  function current() { return cfg?.targets.find(function (target) { return target.id === selectedId; }); }
  function update() {
    var target = current(), secure = location.protocol === "https:";
    $("desktopName").textContent = target?.name || "デスクトップPC";
    $("desktopStart").disabled = !cfg?.enabled || !cfg.viewerInstalled || !target || secure;
    if (secure) status("このHTML5ビューアーはHTTPで開いた家庭内LANのMyRoom Viewから利用してください。", true);
    else if (!cfg.viewerInstalled) status("サーバーで npm run setup:desktop-viewer を実行してビューアーを導入してください。", true);
    else if (!cfg.enabled || !target) status("接続設定で拡張元のWindows PCを登録してください。");
    else if (!running) status(target.host + " のspacedeskビューアーを開けます。Windows側は「表示画面を拡張する」を選択してください。");
  }
  function status(text, error) { $("desktopStatus").textContent = text; $("desktopStatus").classList.toggle("desktop-error", !!error); }
  function stop() {
    running = false; $("desktopViewer").src = "about:blank"; $("desktopViewer").hidden = true;
    $("desktopWelcome").hidden = false; $("desktopStop").disabled = true;
    if (cfg) status("ビューアーを閉じました。再接続するときは「拡張画面を開く」を押してください。");
  }
  async function load() {
    try {
      var r = await fetch("/api/desktop/config", { cache: "no-store" });
      if (!r.ok) throw new Error("接続設定を取得できませんでした");
      cfg = await r.json();
      if (!cfg.targets.some(function (target) { return target.id === selectedId; })) selectedId = cfg.defaultTargetId;
      $("desktopTarget").replaceChildren();
      (cfg.targets.length ? cfg.targets : [{ id: "", name: "PCを登録してください", host: "" }]).forEach(function (target) {
        var option = document.createElement("option"); option.value = target.id; option.textContent = target.name + (target.host ? "（" + target.host + "）" : ""); $("desktopTarget").appendChild(option);
      });
      $("desktopTarget").value = selectedId; $("desktopTarget").disabled = !cfg.enabled || !cfg.targets.length; update();
    } catch (e) { cfg = null; $("desktopStart").disabled = true; status(e.message, true); }
  }
  $("desktopStart").addEventListener("click", function () {
    var target = current();
    if (!cfg?.enabled || !cfg.viewerInstalled || !target || location.protocol === "https:") return;
    running = true; $("desktopWelcome").hidden = true; $("desktopViewer").hidden = false;
    $("desktopViewer").src = "/viewer/spacedesk/?connectTo=" + encodeURIComponent(target.host) + "&fullscreen=false";
    $("desktopStop").disabled = false;
    status("ビューアーを表示しています。接続・拡張状態はビューアー内とWindowsのディスプレイ設定で確認してください。");
  });
  $("desktopTarget").addEventListener("change", function () {
    if (running) stop(); selectedId = this.value;
    try { localStorage.setItem("myroom-desktop-target", selectedId); } catch (_) {}
    update();
  });
  $("desktopStop").addEventListener("click", stop);
  window.addEventListener("message", function (event) {
    if (event.origin !== location.origin || event.source !== $("desktopViewer").contentWindow || !running) return;
    if (event.data?.type !== "myroom-desktop-viewer" || event.data?.event !== "unstable") return;
    stop();
    status("接続が繰り返し切断されたためビューアーを閉じました。他のHTML5ビューアーを閉じ、Windows側の接続状態を確認してから再度開いてください。", true);
  });
  $("desktopReturn").addEventListener("click", function () { document.querySelector('#dashNav [data-page="home"]').click(); });
  $("desktopFullscreen").addEventListener("click", async function () {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch (_) { status("全画面にできませんでした。キオスク設定またはブラウザーの全画面操作を利用してください。", true); }
  });
  document.addEventListener("desktop-page", function (e) { if (e.detail) load(); else if (running) stop(); });
})();
