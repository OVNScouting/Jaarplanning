// firebase-imports.js
// ES module wrapper voor Firebase (modular SDK) + backward compat via window._firebase

const VERSION = "10.12.5";

import * as appMod from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import * as authMod from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import * as dbMod from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import * as fnMod from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

// Backward compat: bestaande code die window._firebase verwacht blijft werken
try {
  window._firebase = {
    ...appMod,
    ...authMod,
    ...dbMod,
    ...fnMod,
  };

  window._firebaseReady = true;
  document.dispatchEvent(new Event("firebase-ready"));
  console.log("[firebase-imports] Firebase geladen:", VERSION);
} catch (err) {
  console.error("[firebase-imports] Firebase init failed:", err);
  window._firebaseReady = false;
}

// Named exports voor je ES-module imports (zoals: import { get } from "./firebase-imports.js")
export * from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
export * from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
export * from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
export * from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
