// ======================================================================
// login.js — Auth systeem (stabiele basis)
// - Popup login (gebruikersnaam + wachtwoord)
// - Sessies via localStorage
// - Badge: altijd "Ingelogd"
// - Logout overal beschikbaar
// - Rollen voorbereid (admin / bestuur / speltakken)
// ======================================================================

/* ======================================================================
   CONFIG
   ====================================================================== */

const AUTH_STORAGE_KEY = "ovn_auth_session";

/*
Gebruiker-structuur (fase 1: lokaal, later Firebase):

{
  id: "uuid",
  username: "voornaam achternaam",
  password: "plain (fase 1)",
  roles: {
    admin: false,
    bestuur: false,
    speltakken: ["bevers", "scouts"]
  }
}
*/

// ⚠️ FASE 1 — tijdelijke lokale users (bootstrap)
const USERS = [
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

/* ======================================================================
   SESSION HELPERS (ENIGE BRON VAN WAARHEID)
   ====================================================================== */

function getAuthSession() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setAuthSession(session) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

/* ======================================================================
   PUBLIC API — gebruikt door andere scripts
   ====================================================================== */

export function getCurrentUser() {
  return getAuthSession();
}

export function isLoggedIn() {
  return !!getAuthSession();
}

export function hasRole(role) {
  const session = getAuthSession();
  return session?.roles?.[role] === true;
}

export function hasSpeltak(speltak) {
  const session = getAuthSession();
  return session?.roles?.speltakken?.includes(speltak);
}

/* ======================================================================
   USER LOOKUP (fase 1)
   ====================================================================== */

function findUser(username, password) {
  return USERS.find(
    u =>
      u.username.toLowerCase() === username.toLowerCase() &&
      u.password === password
  );
}

/* ======================================================================
   UI STATE
   ====================================================================== */

function updateLoginUI() {
  const badge = document.getElementById("loginStatus");
  const loginBtn = document.getElementById("loginButton");
  const logoutBtn = document.getElementById("logoutButton");

  const loggedIn = isLoggedIn();

  if (badge) {
    badge.textContent = "Ingelogd";
    badge.classList.toggle("hidden", !loggedIn);
  }

  if (loginBtn) {
    loginBtn.classList.toggle("hidden", loggedIn);
  }

  if (logoutBtn) {
    logoutBtn.classList.toggle("hidden", !loggedIn);
  }

  document.body.classList.toggle("is-logged-in", loggedIn);
}

/* ======================================================================
   VISIBILITY RULES
   ====================================================================== */

function applyAuthVisibility() {
  const loggedIn = isLoggedIn();

  // Alleen zichtbaar als ingelogd
  document.querySelectorAll(".only-auth").forEach(el => {
    el.classList.toggle("hidden", !loggedIn);
  });

  // Alleen admin
  document.querySelectorAll(".only-admin").forEach(el => {
    el.classList.toggle("hidden", !hasRole("admin"));
  });
}

/* ======================================================================
   LOGIN MODAL
   ====================================================================== */

function openLoginModal() {
  if (document.getElementById("loginModal")) return;

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "loginModal";

  modal.innerHTML = `
    <div class="modal-content">
      <h3>Inloggen</h3>

      <label>Gebruikersnaam</label>
      <input id="loginUsername" type="text" />

      <label>Wachtwoord</label>
      <input id="loginPassword" type="password" />

      <div id="loginError"
           style="color:#b91c1c;font-size:0.85rem;display:none;">
        Onjuiste gebruikersnaam of wachtwoord
      </div>

      <div class="modal-actions">
        <button id="loginCancel" class="pill-btn outline" type="button">
          Annuleren
        </button>
        <button id="loginSubmit" class="pill-btn primary" type="button">
          Inloggen
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const usernameInput = modal.querySelector("#loginUsername");
  const passwordInput = modal.querySelector("#loginPassword");
  const errorBox = modal.querySelector("#loginError");

  usernameInput.focus();

  modal.querySelector("#loginCancel").onclick = closeLoginModal;

  modal.querySelector("#loginSubmit").onclick = () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    const user = findUser(username, password);

    if (!user) {
      errorBox.style.display = "block";
      return;
    }

    setAuthSession({
      userId: user.id,
      username: user.username,
      roles: user.roles,
      loginAt: Date.now()
    });

    closeLoginModal();
    updateLoginUI();
    applyAuthVisibility();
  };

  modal.addEventListener("click", e => {
    if (e.target === modal) closeLoginModal();
  });

  modal.addEventListener("keydown", e => {
    if (e.key === "Escape") closeLoginModal();
    if (e.key === "Enter") {
      modal.querySelector("#loginSubmit").click();
    }
  });
}

function closeLoginModal() {
  const modal = document.getElementById("loginModal");
  if (modal) modal.remove();
}

/* ======================================================================
   INIT
   ====================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  updateLoginUI();
  applyAuthVisibility();

  const loginBtn = document.getElementById("loginButton");
  const logoutBtn = document.getElementById("logoutButton");

  if (loginBtn) {
    loginBtn.addEventListener("click", openLoginModal);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearAuthSession();
      updateLoginUI();
      applyAuthVisibility();
      window.location.reload();
    });
  }
});
