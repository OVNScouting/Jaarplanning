
// ======================================================================
// login.js — Auth systeem (FASE 1: Firebase Auth)
// - Centrale auth-controller (non-module)
// - UI gestuurd via CSS classes
// - ovn_auth_session blijft leidend voor de rest van de app
// - Legacy USERS blijft bestaan voor admin.js (FASE 2), maar login gaat via Firebase
// ======================================================================

const AUTH_KEY = "ovn_auth_session";
const USERS_STORAGE_KEY = "ovn_users";

let auth = null;

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

  // Eerste keer: default admin (legacy)
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
// FIREBASE INIT + LISTENER (FASE 1)
// ======================================================================
function initFirebaseAuth() {
  if (!window._firebase) {
    console.error("Firebase imports not ready: window._firebase missing");
    return false;
  }
  if (!window.firebaseConfig) {
    console.error("Firebase config not ready: window.firebaseConfig missing");
    return false;
  }

  // Voorkom dubbele initializeApp tussen login.js en module scripts
  const app = (window._firebase.getApps && window._firebase.getApps().length)
    ? window._firebase.getApp()
    : window._firebase.initializeApp(window.firebaseConfig);

  auth = window._firebase.getAuth(app);

  // Auth state listener (ENIGE bron van waarheid voor in/uitloggen)
  window._firebase.onAuthStateChanged(auth, (user) => {
    if (!user) {
      clearSession();
      updateHeader();
      applyAuthVisibility();
      return;
    }

    // Rollen komen in FASE 2; voorlopig leeg object zodat checks veilig zijn
    setSession({
      id: user.uid,
      email: user.email,
      roles: {},
      loginAt: Date.now()
    });

    updateHeader();
    applyAuthVisibility();
  });

  return true;
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
      <input id="loginUser" type="email" autocomplete="username">

      <label>Wachtwoord</label>
      <input id="loginPass" type="password" autocomplete="current-password">

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
    errorBox.classList.add("hidden");

    const email = userInput.value.trim();
    const password = passInput.value;

    if (!auth) {
      errorBox.classList.remove("hidden");
      return;
    }

    try {
      await window._firebase.signInWithEmailAndPassword(auth, email, password);
      closeLoginModal(); // verdere UI update komt via onAuthStateChanged
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
// EVENTS (één keer, strak)
// ======================================================================
document.addEventListener("DOMContentLoaded", () => {
  // UI alvast in “huidige sessie” toestand zetten
  updateHeader();
  applyAuthVisibility();

  // Firebase Auth init + listener
  initFirebaseAuth();

  document.getElementById("loginButton")
    ?.addEventListener("click", openLoginModal);

  document.getElementById("logoutButton")
    ?.addEventListener("click", () => {
      if (!auth) return;
      window._firebase.signOut(auth);
    });
});
