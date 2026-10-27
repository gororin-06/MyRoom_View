"use strict";
(function () {
  var descriptions = {
    music: ["音楽と再生先", "お気に入りの音楽を、お部屋のスピーカーへ。"],
    display: ["画面と表示", "時計、スライドショー、夜の明るさを、暮らしに合わせて。"],
    desktop: ["デスクトップ拡張", "Windows PCの作業領域を、お部屋のディスプレイへ。"],
    room: ["部屋と地域", "いつもの部屋と、知りたい街の情報を設定します。"],
    servers: ["サーバー監視", "自宅のサーバーとサービスの状態を、ひと目で。"],
    devices: ["デバイス連携", "お部屋のデバイスを、いつもの使い方に合わせます。"],
    updates: ["アップデート", "バージョンの確認と、自動アップデートの設定。"],
  };
  function show() {
    var key = location.hash.slice(1);
    if (!descriptions[key]) key = "music";
    document.querySelectorAll("[data-settings-group]").forEach(function (el) { el.hidden = el.dataset.settingsGroup !== key; });
    document.querySelectorAll("[data-settings-tab]").forEach(function (el) {
      if (el.dataset.settingsTab === key) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
    document.getElementById("settingsTitle").textContent = descriptions[key][0];
    document.getElementById("settingsBreadcrumb").textContent = descriptions[key][0];
    document.getElementById("settingsDescription").textContent = descriptions[key][1];
  }
  window.addEventListener("hashchange", function () { show(); window.scrollTo(0, 0); });
  show();
  fetch("/api/update").then(function (r) { return r.json(); }).then(function (data) {
    document.getElementById("sidebarVersion").textContent = data.current || "";
  }).catch(function () {});
})();
