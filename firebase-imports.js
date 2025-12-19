import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  push,
  remove
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

export {
  initializeApp,
  getApp,
  getApps,
  getDatabase,
  ref,
  get,
  set,
  update,
  push,
  remove,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
};

// ============================================================
// Expose Firebase helpers for non-module scripts (login.js)
// ============================================================
window._firebase = {
  // app / auth
  initializeApp,
  getApp,
  getApps,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,

  // database (voor login.js)
  getDatabase,
  ref,
  get
};

