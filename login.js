// ======================================================================
// login.js — Auth systeem (stabiele basis)
// - Popup login (gebruikersnaam + wachtwoord)
// - Eén sessie in localStorage
// - Badge: "Ingelogd"
// - Zichtbaarheid via CSS classes
// - Voorbereid op rollen & rechten
// ======================================================================

const AUTH_KEY = "ovn_auth_session";

/* ======================================================================
   TIJDELIJKE USERS (FASE 1)
   ====================================================================== */
const USERS = JSON.parse(localStorage.getItem("ovn_users")) || [
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
   SESSION HELPERS
   ====================================================================== */
function getSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
}

function setSession(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({
    id: user.id,
    username: user.username,
    roles: user.roles,
    loginAt: Date.now()
  }));
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

/* ======================================================================
   UI VISIBILITY
   ====================================================================== */
function applyAuthVisibility() {
  const loggedIn = isLoggedIn();

  document.body.classList.toggle("is-logged-in", loggedIn);

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

/* ======================================================================
   HEADER (badge + knoppen)
   ====================================================================== */
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
      <input id="loginUser" type="text" placeholder="Voornaam Achternaam">

      <label>Wachtwoord</label>
      <input id="loginPass" type="password">

      <div id="loginError" style="display:none;color:#b91c1c;font-size:.85rem;">
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

  modal.querySelector("#loginSubmit").onclick = () => {
    const u = userInput.value.trim().toLowerCase();
    const p = passInput.value;

    const user = USERS.find(x =>
      x.username.toLowerCase() === u && x.password === p
    );

    if (!user) {
      errorBox.style.display = "block";
      return;
    }

    setSession(user);
    closeLoginModal();
    updateHeader();
    applyAuthVisibility();
  };

  modal.onclick = e => {
    if (e.target === modal) closeLoginModal();
  };
}

function closeLoginModal() {
  document.getElementById("loginModal")?.remove();
}

/* ======================================================================
   EVENTS
   ====================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  updateHeader();
  applyAuthVisibility();

  document.getElementById("loginButton")
    ?.addEventListener("click", openLoginModal);

  document.getElementById("logoutButton")
    ?.addEventListener("click", () => {
      clearSession();
      updateHeader();
      applyAuthVisibility();
      location.reload();
    });
});
