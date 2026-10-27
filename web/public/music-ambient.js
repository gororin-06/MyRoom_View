"use strict";
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var snapshot = { player: null, connected: false, receivedAt: 0 };
  var enabled = true, active = false, currentImage = "";
  function formatTime(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "--:--";
    return Math.floor(value / 60) + ":" + String(Math.floor(value % 60)).padStart(2, "0");
  }
  function artwork(value) {
    var url = "";
    try {
      var parsed = new URL(value);
      if (["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password) url = parsed.href;
    } catch (_) {}
    if (url === currentImage) return;
    currentImage = url;
    var image = $("ambientMusicImage"), backdrop = $("ambientMusicBackdrop");
    image.hidden = backdrop.hidden = true;
    $("ambientMusicCover").classList.remove("has-image");
    if (!url) { image.removeAttribute("src"); backdrop.removeAttribute("src"); return; }
    image.onload = function () {
      if (currentImage !== url) return;
      image.hidden = backdrop.hidden = false;
      $("ambientMusicCover").classList.add("has-image");
    };
    image.onerror = function () {
      if (currentImage !== url) return;
      image.hidden = backdrop.hidden = true;
      $("ambientMusicCover").classList.remove("has-image");
    };
    image.src = backdrop.src = url;
  }
  function progress() {
    var p = snapshot.player;
    if (!active || !p) return;
    var elapsed = typeof p.elapsed === "number" && Number.isFinite(p.elapsed) && p.elapsed >= 0 ? p.elapsed : null;
    var duration = typeof p.duration === "number" && Number.isFinite(p.duration) && p.duration > 0 ? p.duration : null;
    if (elapsed !== null && snapshot.receivedAt) elapsed += Math.max(0, Date.now() - snapshot.receivedAt) / 1000;
    if (elapsed !== null && duration !== null) elapsed = Math.min(elapsed, duration);
    $("ambientMusicElapsed").textContent = formatTime(elapsed);
    $("ambientMusicDuration").textContent = formatTime(duration);
    $("ambientMusicProgress").value = duration !== null && elapsed !== null ? elapsed / duration * 100 : 0;
    $("ambientMusicProgress").hidden = duration === null || elapsed === null;
  }
  function render() {
    var p = snapshot.player;
    var want = !!(enabled && snapshot.connected && p && p.available && p.state === "playing");
    $("musicAmbient").hidden = !want;
    if (want) {
      $("ambientMusicTitle").textContent = p.title || "再生中の音楽";
      $("ambientMusicArtist").textContent = p.artist || "";
      $("ambientMusicDevice").textContent = p.name || "再生デバイス";
      artwork(p.image);
    }
    if (active !== want) {
      active = want;
      document.dispatchEvent(new CustomEvent("music-ambient", { detail: { active: active } }));
    }
    progress();
  }
  document.addEventListener("music-state", function (e) { snapshot = e.detail; render(); });
  document.addEventListener("room-settings", function (e) { enabled = e.detail.musicScreensaver !== false; render(); });
  document.dispatchEvent(new Event("room-settings-request"));
  setInterval(function () {
    if (!document.hidden && !$("ambient").classList.contains("amb-hide")) progress();
  }, 1000);
})();
