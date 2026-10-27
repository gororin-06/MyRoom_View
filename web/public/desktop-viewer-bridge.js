"use strict";
// Observe connection lifecycle only. Never read, copy or forward screen packets.
(function () {
  if (window.parent === window) return;
  var NativeSocket = window.WebSocket, closes = [], reported = false;
  window.WebSocket = class extends NativeSocket {
    constructor(...args) {
      super(...args);
      this.addEventListener("close", function (event) {
        if (event.code === 1000 || reported) return;
        var now = Date.now();
        closes = closes.filter(function (time) { return now - time < 5000; });
        closes.push(now);
        if (closes.length < 4) return;
        reported = true;
        window.parent.postMessage({ type: "myroom-desktop-viewer", event: "unstable" }, location.origin);
      });
    }
  };
})();
