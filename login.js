// ======================================================================
// login.js — Auth systeem (FASE 2)
// ======================================================================

const AUTH_KEY = "ovn_auth_session";
const USERS_STORAGE_KEY = "ovn_users";

let auth = null;

// ======================================================================
// LEGACY USERS (nodig voor admin.js – wordt later uitgefaseerd)
// ======================================================================
let USERS = window.USERS = loadUsers();

function loadUsers() {
  const raw = localStorage.getItem(USERS_STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      console.warn("USERS corrupt, reset");
    }
  }

  const initial = [
    {
      id: "admin-1",
      username: "admin",
      password: "admin",
      roles: {
        admin: true,
        bestuur: true,
        speltakken: ["bevers", "welpen", "scouts", "explorers", "rovers", "stam"]
      }
    }
  ];

  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

window.saveUsers = function (users) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
};

// ======================================================================
// SESSION HELPERS
// ======================================================================
function getSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
}

function setSession(session) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(AUTH_KEY);
}

function isLoggedIn() {
  return !!getSession();
}

function hasRole(role) {
  const s = getSession();
  return !!s?.roles?.[role];
}

// ======================================================================
// UI
// ======================================================================
function applyAuthVisibility() {
  const loggedIn = isLoggedIn();
  const session = getSession();

  document.body.classList.toggle("is-logged-in", loggedIn);
  document.body.classList.toggle("only-admin", !!session?.roles?.admin);

  document.querySelectorAll(".only-auth").forEach(el =>
    el.classList.toggle("hidden", !loggedIn)
  );

  document.querySelectorAll(".only-bestuur").forEach(el =>
    el.classList.toggle("hidden", !loggedIn || !hasRole("bestuur"))
  );

  document.querySelectorAll(".only-admin").forEach(el =>
    el.classList.toggle("hidden", !loggedIn || !hasRole("admin"))
  );
}

function updateHeader() {
  const badge = document.getElementById("loginStatus");
  const loginBtn = document.getElementById("loginButton");
  const logoutBtn = document.getElementById("logoutButton");

  if (!badge || !loginBtn || !logoutBtn) return;

  if (isLoggedIn()) {
    badge.textContent = "Ingelogd";
    badge.classList.remove("hidden");
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
  }
}

// ======================================================================
// FIREBASE INIT + AUTH LISTENER
// ======================================================================
function initFirebaseAuth(retries = 10) {
  if (!window._firebase || !window.firebaseConfig) {
    if (retries > 0) {
      setTimeout(() => initFirebaseAuth(retries - 1), 50);
    }
    return;
  }

  const app = window._firebase.getApps().length
    ? window._firebase.getApp()
    : window._firebase.initializeApp(window.firebaseConfig);

  auth = window._firebase.getAuth(app);

  window._firebase.onAuthStateChanged(auth, async (user) => {
    if (!user) {
      clearSession();
      updateHeader();
      applyAuthVisibility();
      return;
    }

    let roles = {};

    try {
      const db = window._firebase.getDatabase();
      const rolesRef = window._firebase.ref(db, `users/${user.uid}/roles`);
      const snapshot = await window._firebase.get(rolesRef);

      if (snapshot.exists()) {
        roles = snapshot.val();
      }
    } catch (err) {
      console.warn("Kon rollen niet laden:", err);
    }

    setSession({
      id: user.uid,
      email: user.email,
      roles,
      loginAt: Date.now()
    });

    updateHeader();
    applyAuthVisibility();
  });
}

// ======================================================================
// LOGIN MODAL
// ======================================================================
function openLoginModal() {
  if (document.getElementById("loginModal")) return;

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "loginModal";

  modal.innerHTML = `
    <div class="modal-content">
      <h3>Inloggen</h3>
      <label>Email</label>
      <input id="loginUser" type="email">
      <label>Wachtwoord</label>
      <input id="loginPass" type="password">
      <div id="loginError" class="hidden">Onjuiste gegevens</div>
      <div class="modal-actions">
        <button id="loginCancel">Annuleren</button>
        <button id="loginSubmit">Inloggen</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#loginCancel").onclick = closeLoginModal;

  modal.querySelector("#loginSubmit").onclick = async () => {
    const email = modal.querySelector("#loginUser").value.trim();
    const password = modal.querySelector("#loginPass").value;

    try {
      await window._firebase.signInWithEmailAndPassword(auth, email, password);
      closeLoginModal();
    } catch {
      modal.querySelector("#loginError").classList.remove("hidden");
    }
  };

  modal.onclick = e => {
    if (e.target === modal) closeLoginModal();
  };
}

function closeLoginModal() {
  document.getElementById("loginModal")?.remove();
}

// ======================================================================
// EVENTS
// ======================================================================
document.addEventListener("DOMContentLoaded", () => {
  updateHeader();
  applyAuthVisibility();
  initFirebaseAuth();

  document.getElementById("loginButton")
    ?.addEventListener("click", openLoginModal);

  document.getElementById("logoutButton")
    ?.addEventListener("click", () => {
      if (auth) window._firebase.signOut(auth);
    });
});
