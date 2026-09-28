// ==UserScript==
// @name         KZRadio Picker
// @namespace    https://sdafni.github.io/kzradio/
// @version      1.0.0
// @description  Show and episode picker on top of kzradio.net
// @match        https://www.kzradio.net/*
// @grant        none
// @noframes
// @run-at       document-idle
// @updateURL    https://sdafni.github.io/kzradio/kzradio.user.js
// @downloadURL  https://sdafni.github.io/kzradio/kzradio.user.js
// ==/UserScript==

// Only a loader: the app itself is app.js, so app updates need no reinstall.
(() => {
  if (window.kzw || document.getElementById("kzw-host")) return;
  const s = document.createElement("script");
  s.src = "https://sdafni.github.io/kzradio/app.js";
  document.body.appendChild(s);
})();
