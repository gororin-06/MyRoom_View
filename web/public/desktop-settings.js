"use strict";
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var loaded = false, busy = false, targets = [], defaultTargetId = "";
  function newTarget() { return { id: "pc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8), name: "", host: "" }; }
  function status(text, error) { $("desktopSettingsStatus").textContent = text; $("desktopSettingsStatus").classList.toggle("desktop-error", !!error); }
  async function api(url, method, body) {
    var response = await fetch(url, { method: method || "GET", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    var data = await response.json(); if (!response.ok) throw new Error(data.error || "処理に失敗しました"); return data;
  }
  function fill(value) {
    $("desktopEnabled").checked = value.enabled;
    targets = value.targets.map(function (target) { return Object.assign({}, target); });
    if (!targets.length) targets.push(newTarget());
    defaultTargetId = value.defaultTargetId || targets[0].id; renderTargets();
    $("desktopViewerInstalled").textContent = value.viewerInstalled ? "MyRoom側のHTML5ビューアー: 導入済み" : "MyRoom側のHTML5ビューアー: 未導入。サーバーで npm run setup:desktop-viewer を実行してください。";
  }
  function renderTargets() {
    $("desktopTargets").replaceChildren();
    targets.forEach(function (target, index) {
      var card = document.createElement("section"); card.className = "desktop-pc-card";
      var heading = document.createElement("div"); heading.className = "desktop-pc-heading";
      var label = document.createElement("label"), radio = document.createElement("input");
      radio.type = "radio"; radio.name = "desktopDefaultTarget"; radio.value = target.id; radio.checked = target.id === defaultTargetId;
      radio.addEventListener("change", function () { defaultTargetId = target.id; });
      label.append(radio, document.createTextNode("標準の接続先"));
      var remove = document.createElement("button"); remove.type = "button"; remove.textContent = "削除";
      remove.setAttribute("aria-label", (target.name || "PC " + (index + 1)) + "を削除");
      remove.addEventListener("click", function () {
        targets = targets.filter(function (item) { return item.id !== target.id; });
        if (defaultTargetId === target.id) defaultTargetId = targets[0]?.id || "";
        renderTargets(); status("未保存の変更があります");
      });
      heading.append(label, remove); card.appendChild(heading);
      var fields = document.createElement("div"); fields.className = "desktop-pc-fields";
      [["name", "PCの名前", "デスクトップPC", 80], ["host", "Windows PCのIPv4アドレス", "192.168.1.50", 64]].forEach(function (field) {
        var wrap = document.createElement("div"); wrap.className = "desktop-field";
        var input = document.createElement("input"), fieldLabel = document.createElement("label");
        input.type = "text"; input.maxLength = field[3]; input.placeholder = field[2]; input.value = target[field[0]];
        input.id = (index === 0 ? field[0] === "name" ? "desktopLabel" : "desktopHost" : "desktop-" + target.id + "-" + field[0]);
        fieldLabel.htmlFor = input.id; fieldLabel.textContent = field[1];
        if (field[0] === "host") { input.inputMode = "decimal"; input.spellcheck = false; }
        input.addEventListener("input", function () { target[field[0]] = input.value; status("未保存の変更があります"); });
        wrap.append(fieldLabel, input); fields.appendChild(wrap);
      });
      card.appendChild(fields); $("desktopTargets").appendChild(card);
    });
    $("desktopAdd").disabled = targets.length >= 20;
  }
  async function save(check) {
    if (!loaded || busy || !$("desktopConfigForm").reportValidity()) return;
    busy = true; $("desktopSave").disabled = $("desktopCheck").disabled = true;
    status("保存中…");
    try {
      var savedTargets = targets.filter(function (target) { return target.host.trim() || target.name.trim(); });
      var savedDefault = savedTargets.some(function (target) { return target.id === defaultTargetId; }) ? defaultTargetId : savedTargets[0]?.id || "";
      var value = await api("/api/desktop/config", "PUT", { enabled: $("desktopEnabled").checked, targets: savedTargets, defaultTargetId: savedDefault });
      fill(value); status("保存しました");
      if (check) {
        status("保存しました。接続を確認中…");
        try {
          var result = await api("/api/desktop/check", "POST");
          status(result.reachable ? "spacedeskの接続口に到達できました。実際の画面は「拡張画面を開く」で確認してください。" : "接続できません。PCのIP、spacedesk DRIVERの起動、ファイアウォールを確認してください。", !result.reachable);
        } catch (e) { status("保存しました。接続確認: " + e.message, true); }
      }
    } catch (e) { status(e.message, true); }
    finally { busy = false; $("desktopSave").disabled = $("desktopCheck").disabled = false; }
  }
  $("desktopConfigForm").addEventListener("submit", function (e) { e.preventDefault(); save(false); });
  $("desktopCheck").addEventListener("click", function () { save(true); });
  $("desktopAdd").addEventListener("click", function () {
    if (busy || targets.length >= 20) return;
    targets.push(newTarget()); if (!defaultTargetId) defaultTargetId = targets[0].id;
    renderTargets(); $("desktopTargets").lastElementChild.querySelector('input[type="text"]').focus(); status("未保存の変更があります");
  });
  api("/api/desktop/config").then(function (value) {
    fill(value); loaded = true; $("desktopSave").disabled = $("desktopCheck").disabled = false;
    status(value.enabled ? "接続設定を読み込みました" : "Windows PCの接続先を設定してください。この欄は保存ボタンで保存します。");
  }).catch(function (e) { status(e.message, true); });
})();
