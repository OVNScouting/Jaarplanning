// ======================================================================
// login.js — Auth systeem (FASE 2)
// ======================================================================

const AUTH_KEY = "ovn_auth_session";
// const USERS_STORAGE_KEY = "ovn_users"; // LEGACY — niet meer gebruiken

const ACCOUNT_REQUEST_ENDPOINT =
  "https://us-central1-ovn-jaarplanning.cloudfunctions.net/sendAccountRequest";


let auth = null;

// ======================================================================
// LEGACY USERS — UITGESCHAKELD
// Bestaat alleen nog om oude referenties niet te laten crashen.
// Firebase Auth + RTDB (/users) is de enige waarheid.
// ======================================================================
window.USERS = {};
window.saveUsers = function () {
  console.warn("saveUsers is legacy en wordt genegeerd");
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
      // Knop is alleen zichtbaar als je ingelogd bent
      openAccountRequestModal();
    });

    document.body.appendChild(btn);
  }

  return btn;
}


function updateAccountRequestButton() {
  const btn = ensureAccountRequestButton();
  // Alleen tonen als je WEL ingelogd bent
  btn.classList.toggle("hidden", !isLoggedIn());
}


// ======================================================================
// UI
// ======================================================================
function applyAuthVisibility() {
  const loggedIn = isLoggedIn();
  const session = getSession();

  // NB: body-classes zijn UI-only.
 // Nooit gebruiken als autorisatiebron.

  document.body.classList.toggle("is-logged-in", loggedIn);
  document.body.classList.toggle("only-admin", !!session?.roles?.admin);

  document.querySelectorAll(".only-auth").forEach((el) =>
    el.classList.toggle("hidden", !loggedIn)
  );

  document.querySelectorAll(".only-bestuur").forEach((el) =>
    el.classList.toggle("hidden", !loggedIn || !hasRole("bestuur"))
  );

  document.querySelectorAll(".only-admin").forEach((el) =>
    el.classList.toggle("hidden", !loggedIn || !hasRole("admin"))
  );

  updateAccountRequestButton();
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

  updateAccountRequestButton();
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
  } else {
    console.error("Firebase niet beschikbaar voor auth init");
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
document.dispatchEvent(new CustomEvent("auth-changed", {
  detail: {
    loggedIn: false
  }
}));
      return;
    }

let roles = {};
let status = "active";

try {
  const db = window._firebase.getDatabase();

  const userRef = window._firebase.ref(db, `users/${user.uid}`);
  const snapshot = await window._firebase.get(userRef);

  if (snapshot.exists()) {
    const data = snapshot.val();
    roles = data.roles || {};
    status = data.status || "active";
  }
} catch (err) {
  console.warn("Kon gebruikersgegevens niet laden:", err);
}

if (status === "inactive") {
  alert(
    "Je account is gedeactiveerd.\n\n" +
    "Neem contact op met het bestuur als dit niet klopt."
  );

  clearSession();
  await window._firebase.signOut(auth);

  updateHeader();
  applyAuthVisibility();
document.dispatchEvent(new CustomEvent("auth-changed", {
  detail: {
    loggedIn: false
  }
}));
  return;
}

setSession({
  id: user.uid,
  email: user.email,
  roles,
  status,
  loginAt: Date.now(),
});

    updateHeader();
    applyAuthVisibility();
document.dispatchEvent(new CustomEvent("auth-changed", {
  detail: {
    loggedIn: true
  }
}));
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

  modal.onclick = (e) => {
    if (e.target === modal) closeLoginModal();
  };
}

function closeLoginModal() {
  document.getElementById("loginModal")?.remove();
}

// ======================================================================
// ACCOUNT REQUEST MODAL
// ======================================================================
function openAccountRequestModal() {
  if (document.getElementById("accountRequestModal")) return;

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "accountRequestModal";

  modal.innerHTML = `
    <div class="modal-content">
     <h3>Account aanvragen</h3>

<div class="account-section">
  <label>Naam</label>
  <input id="reqName" type="text" />

  <label>Email</label>
  <input id="reqEmail" type="email" />
</div>

<div class="account-section">
  <div class="account-section-title">Toegang</div>
  <div class="account-checkbox-grid">
    <label><input type="checkbox" id="reqBestuur"> Bestuur</label>
    <label><input type="checkbox" id="reqAdmin"> Admin</label>
  </div>
</div>

<div class="account-section">
  <div class="account-section-title">Speltakken</div>
  <div id="reqSpeltakken" class="account-checkbox-grid">
    ${["bevers","welpen","scouts","explorers","rovers","stam"]
      .map(s => `<label><input type="checkbox" value="${s}"> ${s}</label>`)
      .join("")}
  </div>
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

  modal.onclick = (e) => {
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
    admin: document.getElementById("reqAdmin").checked,
  };

  const speltakken = Array.from(
    document.querySelectorAll("#reqSpeltakken input:checked")
  ).map((i) => i.value);

  const message = document.getElementById("reqMessage").value || "";

  try {
    btn.disabled = true;
    btn.textContent = "Bezig…";

   const res = await fetch(
  ACCOUNT_REQUEST_ENDPOINT,

      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          naam: name,
          email,
          requestedRoles: roles,
          speltakken,
          message,
        }),
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
    errEl.textContent = `Versturen mislukt: ${e?.message || e}`;
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Aanvraag versturen";
  }
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

  document
    .getElementById("loginButton")
    ?.addEventListener("click", openLoginModal);

  document.getElementById("logoutButton")?.addEventListener("click", () => {
    if (auth) window._firebase.signOut(auth);
  });

  // Knop wordt door ensureAccountRequestButton() aangemaakt; this ensures it exists now
  ensureAccountRequestButton();
});
