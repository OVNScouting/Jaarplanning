// ======================================================================
// login.js — Auth systeem (fase 1)
// - Popup login (gebruikersnaam + wachtwoord)
// - Sessies via localStorage
// - Badge: altijd "Ingelogd"
// - Logout overal beschikbaar
// - Voorbereid op rollen (nog niet afdwingen)
// ======================================================================

/* ======================================================================
   CONFIG
   ====================================================================== */

const AUTH_STORAGE_KEY = "ovn_auth_session";

/*
Gebruiker-structuur (voor nu lokaal, later Firebase):
{
  id: "uuid",
  username: "voornaam achternaam",
  password: "hash-of-plain (fase 1)",
  roles: {
    admin: false,
    bestuur: false,
    speltakken: ["bevers", "scouts"]
  }
}
*/

// ⚠️ FASE 1: tijdelijke lokale gebruikers (admin kan dit later beheren)
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
   HELPERS
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

function findUser(username, password) {
  return USERS.find(
    u =>
      u.username.toLowerCase() === username.toLowerCase() &&
      u.password === password
  );
}
export function isLoggedIn() {
  return !!getCurrentUser();
}

export function getCurrentUser() {
  return JSON.parse(localStorage.getItem("currentUser"));
}

export function hasRole(role) {
  const user = getCurrentUser();
  return user?.roles?.[role] === true;
}

export function hasSpeltak(speltak) {
  const user = getCurrentUser();
  return user?.roles?.speltakken?.includes(speltak);
}


/* ======================================================================
   UI UPDATE
   ====================================================================== */

function updateLoginUI() {
  const badge = document.getElementById("loginStatus");
  const loginBtn = document.getElementById("loginButton");
  const logoutBtn = document.getElementById("logoutButton");

  const session = getAuthSession();

  if (!badge || !loginBtn || !logoutBtn) return;

  if (session) {
    badge.textContent = "Ingelogd";
    badge.classList.remove("hidden");

    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");

    document.body.classList.add("is-logged-in");
  } else {
    badge.classList.add("hidden");

    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");

    document.body.classList.remove("is-logged-in");
  }
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

      <label for="loginUsername">Gebruikersnaam</label>
      <input id="loginUsername" type="text" placeholder="Voornaam Achternaam" />

      <label for="loginPassword">Wachtwoord</label>
      <input id="loginPassword" type="password" placeholder="••••••••" />

      <div id="loginError" style="color:#b91c1c;font-size:0.85rem;display:none;">
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
   EVENTS
   ====================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  updateLoginUI();

  const loginBtn = document.getElementById("loginButton");
  const logoutBtn = document.getElementById("logoutButton");

  if (loginBtn) {
    loginBtn.addEventListener("click", openLoginModal);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearAuthSession();
      updateLoginUI();
      window.location.reload(); // veilige reset
    });
  }
});
