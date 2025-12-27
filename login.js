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
// ACCOUNT REQUEST BUTTON (floating, rechtsonder)
// ======================================================================
function ensureAccountRequestButton() {
  let btn = document.getElementById("accountRequestButton");

  if (!btn) {
    btn = document.createElement("button");
    btn.id = "accountRequestButton";
    btn.type = "button";
    btn.className = "pill-btn outline floating-account hidden";
    btn.textContent = "Account aanvragen";

    btn.addEventListener("click", () => {
      if (isLoggedIn()) return;
      openAccountRequestModal();
    });

    document.body.appendChild(btn);
  }

  return btn;
}

function updateAccountRequestButton() {
  const btn = ensureAccountRequestButton();
  btn.classList.toggle("hidden", isLoggedIn());
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

// Expose voor andere pagina-scripts
window.applyAuthVisibility = applyAuthVisibility;

// ======================================================================
// HEADER UI
// ======================================================================
function updateHeader() {
  const badge = document.getElementById("loginStatus");
  const loginBtn = document.getElementById("loginButton");
  const logoutBtn = document.getElementById("logoutButton");

  if (!loginBtn || !logoutBtn) return;

  if (isLoggedIn()) {
    if (badge) {
      badge.textContent = "Ingelogd";
      badge.classList.remove("hidden");
    }

    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
  } else {
    if (badge) badge.classList.add("hidden");

    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
  }
}

// Expose voor andere pagina’s indien nodig
window.updateHeader = updateHeader;

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
      updateAccountRequestButton();

      document.dispatchEvent(new Event("auth-changed"));
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
    document.dispatchEvent(new Event("auth-changed"));
  
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

  // Init UI direct (voor refresh / bestaande sessie)
  updateHeader();
  applyAuthVisibility();
  updateAccountRequestButton();

  initFirebaseAuth();

  document.getElementById("loginButton")
    ?.addEventListener("click", openLoginModal);
    });
});

function updateAccountRequestButton() {
  const btn = document.getElementById("accountRequestButton");
  if (!btn) return;

  // Alleen tonen als je NIET ingelogd bent
  btn.classList.toggle("hidden", isLoggedIn());
}

function openAccountRequestModal() {
  if (document.getElementById("accountRequestModal")) return;

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "accountRequestModal";

  modal.innerHTML = `
    <div class="modal-content">
      <h3>Account aanvragen</h3>

      <label>Naam</label>
      <input id="reqName" type="text" />

      <label>Email</label>
      <input id="reqEmail" type="email" />

      <label>Ik wil toegang tot:</label>
      <div class="checklist">
        <label><input type="checkbox" id="reqBestuur"> Bestuur</label>
        <label><input type="checkbox" id="reqAdmin"> Admin</label>
      </div>


      <label>Speltakken</label>
      <div id="reqSpeltakken" class="checklist">
        ${["bevers","welpen","scouts","explorers","rovers","stam"]
          .map(s => `<label><input type="checkbox" value="${s}"> ${s}</label>`)
          .join("")}
      </div>

      <label>Toelichting (optioneel)</label>
      <textarea id="reqMessage" rows="3"></textarea>

      <div id="reqError" class="hidden" style="color:red;margin-top:0.5rem">
        Versturen mislukt
      </div>

      <div class="modal-actions">
        <button id="reqCancel">Annuleren</button>
        <button id="reqSubmit">Aanvraag versturen</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#reqCancel").onclick = () => modal.remove();

  modal.querySelector("#reqSubmit").onclick = submitAccountRequest;

  modal.onclick = e => {
    if (e.target === modal) modal.remove();
  };
}

async function submitAccountRequest() {
  const errEl = document.getElementById("reqError");
  const btn = document.getElementById("reqSubmit");

  const name = document.getElementById("reqName")?.value?.trim() || "";
  const email = document.getElementById("reqEmail")?.value?.trim() || "";

  errEl.classList.add("hidden");
  errEl.textContent = "Versturen mislukt";

  if (!name || !email) {
    errEl.textContent = "Naam en email zijn verplicht.";
    errEl.classList.remove("hidden");
    return;
  }

  const roles = {
    bestuur: document.getElementById("reqBestuur").checked,
    admin: document.getElementById("reqAdmin").checked
  };

  const speltakken = Array.from(
    document.querySelectorAll("#reqSpeltakken input:checked")
  ).map(i => i.value);

  const message = document.getElementById("reqMessage").value || "";

  try {
    btn.disabled = true;
    btn.textContent = "Bezig…";

    const res = await fetch(
      "https://us-central1-ovn-jaarplanning.cloudfunctions.net/sendAccountRequest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          naam: name,
          email,
          requestedRoles: roles,
          speltakken,
          message
        })
      }
    );

    const text = await res.text();

    if (!res.ok) {
      errEl.textContent = `Versturen mislukt (${res.status}): ${text}`;
      errEl.classList.remove("hidden");
      return;
    }

    document.getElementById("accountRequestModal").innerHTML = `
      <div class="modal-content">
        <h3>Aanvraag ontvangen</h3>
        <p>
          We hebben je aanvraag ontvangen.<br>
          Je hoort binnen enkele dagen van ons.
        </p>
        <div class="modal-actions">
          <button onclick="this.closest('.modal').remove()">Sluiten</button>
        </div>
      </div>
    `;
  } catch (e) {
    errEl.textContent = `Versturen mislukt: ${e.message || e}`;
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Aanvraag versturen";
  }
}

