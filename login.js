// ======================================================================
// login.js — Auth systeem (FASE 1: Firebase Auth)
// - Centrale auth-controller
// - UI gestuurd via CSS classes
// - ovn_auth_session blijft leidend voor de rest van de app
// - Geen modules, geen imports (past bij bestaande HTML)
// ======================================================================

const AUTH_KEY = "ovn_auth_session";
const USERS_STORAGE_KEY = "ovn_users";

// ======================================================================
// FIREBASE INIT (FASE 1)
// ======================================================================
// firebase-config.js moet eerder geladen zijn
// firebase-imports.js initialiseert Firebase globals
const app = firebase.initializeApp
  ? firebase.initializeApp(window.firebaseConfig)
  : initializeApp(window.firebaseConfig);

const auth = firebase.auth ? firebase.auth() : getAuth(app);

// ======================================================================
// LEGACY USERS (nog nodig voor admin.js – FASE 2)
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
// UI VISIBILITY
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

// ======================================================================
// HEADER (badge + knoppen)
// ======================================================================
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

      <div id="loginError" class="hidden" style="color:#b91c1c;font-size:.85rem;">
        Onjuiste gegevens
      </div>

      <div class="modal-actions">
        <button id="loginCancel" class="pill-btn outline">Annuleren</button>
        <button id="loginSubmit" class="pill-btn primary">Inloggen</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const userInput = modal.querySelector("#loginUser");
  const passInput = modal.querySelector("#loginPass");
  const errorBox = modal.querySelector("#loginError");

  userInput.focus();

  modal.querySelector("#loginCancel").onclick = closeLoginModal;

  modal.querySelector("#loginSubmit").onclick = async () => {
    try {
      await auth.signInWithEmailAndPassword(
        userInput.value.trim(),
        passInput.value
      );
      closeLoginModal();
    } catch {
      errorBox.classList.remove("hidden");
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
// FIREBASE AUTH STATE LISTENER (ENIGE BRON VAN WAARHEID)
// ======================================================================
auth.onAuthStateChanged(user => {
  if (!user) {
    clearSession();
    updateHeader();
    applyAuthVisibility();
    return;
  }

  setSession({
    id: user.uid,
    email: user.email,
    roles: {}, // FASE 2
    loginAt: Date.now()
  });

  updateHeader();
  applyAuthVisibility();
});

// ======================================================================
// EVENTS
// ======================================================================
document.addEventListener("DOMContentLoaded", () => {
  updateHeader();
  applyAuthVisibility();

  document.getElementById("loginButton")
    ?.addEventListener("click", openLoginModal);

  document.getElementById("logoutButton")
    ?.addEventListener("click", () => auth.signOut());
});
