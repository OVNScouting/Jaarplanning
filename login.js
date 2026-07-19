// ======================================================================
// login.js — Auth systeem (FASE 2)
// ======================================================================

const AUTH_KEY = "ovn_auth_session";
// const USERS_STORAGE_KEY = "ovn_users"; // LEGACY — niet meer gebruiken


let auth = null;
let AUTH_RESOLVED = false; // voorkomt UI "flash" op basis van oude localStorage session

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
  // Gebruik Firebase Auth als waarheid.
  // Voor Firebase "resolved" is: toon geen auth-only UI (voorkomt flash).
  if (!AUTH_RESOLVED) return false;
  return !!auth?.currentUser;
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
  if (!AUTH_RESOLVED) return;

  const loggedIn = isLoggedIn();
  const session = getSession();


  // NB: body-classes zijn UI-only.
  // Nooit gebruiken als autorisatiebron.

  document.body.classList.toggle("is-logged-in", loggedIn);
  document.body.classList.toggle("only-admin", !!session?.roles?.admin);

  document.querySelectorAll(".only-auth").forEach((el) =>
    el.classList.toggle("hidden", !loggedIn)
  );
  // Leiding = admin/bestuur OF iemand met minimaal één speltak-rol
  const sp = session?.roles?.speltakken;
  const isLeiding =
    !!session?.roles?.admin ||
    !!session?.roles?.bestuur ||
    (Array.isArray(sp)
      ? sp.length > 0
      : sp && typeof sp === "object"
        ? Object.values(sp).some(Boolean)
        : false);

  document.querySelectorAll(".only-leiding").forEach((el) =>
    el.classList.toggle("hidden", !loggedIn || !isLeiding)
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

// Expose auth helpers voor module-scripts (zoals script.js)
window.getAuthSession = getSession;
window.isLoggedIn = isLoggedIn;
window.hasRole = hasRole;


// ======================================================================
// HEADER UI
// ======================================================================
function updateHeader() {
  if (!AUTH_RESOLVED) return;

  const badge = document.getElementById("loginStatus");
  const loginBtn = document.getElementById("loginButton");
  const logoutBtn = document.getElementById("logoutButton");

  if (!loginBtn || !logoutBtn) return;

  if (isLoggedIn()) {
    if (badge) {
      badge.textContent = "Mijn Profiel";
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
function initFirebaseAuth(retries = 200) {
  if (!window._firebase || !window.firebaseConfig) {
    if (retries > 0) {
      setTimeout(() => initFirebaseAuth(retries - 1), 100);
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
    AUTH_RESOLVED = true;

    if (!user) {

      clearSession();
      updateHeader();
      applyAuthVisibility();
      document.dispatchEvent(
        new CustomEvent("auth-changed", { detail: { loggedIn: false } })
      );
      return;
    }

    let roles = {};
    let status = "active";

    try {
      const db = window._firebase.getDatabase(app);
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
      document.dispatchEvent(
        new CustomEvent("auth-changed", { detail: { loggedIn: false } })
      );
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
    document.dispatchEvent(
      new CustomEvent("auth-changed", { detail: { loggedIn: true } })
    );
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
      
      <!-- Wachtwoord vergeten link -->
      <div style="text-align: right; margin-top: -0.5rem; margin-bottom: 1rem;">
        <a href="#" id="forgotPasswordLink" style="font-size: 0.85rem; color: #777; text-decoration: none;">Wachtwoord vergeten?</a>
      </div>

      <div id="loginError" class="hidden">Onjuiste gegevens</div>
      <div class="modal-actions">
        <button id="loginCancel">Annuleren</button>
        <button id="loginSubmit">Inloggen</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#loginCancel").onclick = closeLoginModal;

  // Wachtwoord vergeten logica
  modal.querySelector("#forgotPasswordLink").onclick = async (e) => {
    e.preventDefault();
    const email = modal.querySelector("#loginUser").value.trim();

    if (!email) {
      alert("Vul eerst je e-mailadres in bij het inlogveld, en klik daarna op 'Wachtwoord vergeten?'.");
      return;
    }

    if (confirm(`We sturen een e-mail naar ${email} om je wachtwoord te resetten. Weet je dit zeker?`)) {
      try {
        await window._firebase.sendPasswordResetEmail(auth, email);
        alert("De herstelmail is verzonden! Check ook je spam-map.");
      } catch (err) {
        console.error("Fout bij wachtwoord reset:", err);
        alert("Fout bij versturen: " + err.message);
      }
    }
  };

  modal.querySelector("#loginSubmit").onclick = async () => {
    const email = modal.querySelector("#loginUser").value.trim();
    const password = modal.querySelector("#loginPass").value;

    try {
      await window._firebase.signInWithEmailAndPassword(auth, email, password);
      closeLoginModal();

      // Check of de gebruiker heeft ingelogd met het tijdelijke wachtwoord
      if (password === "Welkom48!") {
        const tempModal = document.getElementById("tempPasswordModal");
        if (tempModal) {
          // Toon de mooie pop-up
          tempModal.classList.remove("hidden");

          // Pas doorsturen als de gebruiker op OK klikt
          document.getElementById("tempPasswordOkBtn").onclick = () => {
            tempModal.classList.add("hidden");
            window.location.href = "profile.html?force_pw_change=true";
          };
        } else {
          // Terugvaloptie als de modal niet in de HTML staat
          alert("Je logt in met het standaardwachtwoord. Je wordt nu direct doorgestuurd om een eigen wachtwoord in te stellen.");
          window.location.href = "profile.html?force_pw_change=true";
        }
      } else {
        window.location.reload();
      }
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
 <label>Voornaam</label>
<input id="reqFirstName" type="text" />

<label>Achternaam</label>
<input id="reqLastName" type="text" />

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
    ${["bevers", "welpen", "scouts", "explorers", "rovers", "stam"]
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

  const firstName = document.getElementById("reqFirstName")?.value?.trim() || "";
  const lastName = document.getElementById("reqLastName")?.value?.trim() || "";
  const email = document.getElementById("reqEmail")?.value?.trim() || "";

  errEl.classList.add("hidden");
  errEl.textContent = "Versturen mislukt";

  // Uitgebreide validatie
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!firstName || !lastName || !email) {
    errEl.textContent = "Naam en e-mailadres zijn verplicht.";
    errEl.classList.remove("hidden");
    return;
  }

  if (!emailRegex.test(email)) {
    errEl.textContent = "Voer a.u.b. een geldig e-mailadres in.";
    errEl.classList.remove("hidden");
    return;
  }
  
  const speltakken = {};
  document.querySelectorAll("#reqSpeltakken input").forEach((input) => {
    speltakken[input.value] = input.checked;
  });

  if (speltakken.length === 0) {
    errEl.textContent = "Selecteer a.u.b. ten minste één speltak.";
    errEl.classList.remove("hidden");
    return;
  }
  const fullName = `${firstName} ${lastName}`.trim();

  const roles = {
    bestuur: document.getElementById("reqBestuur").checked,
    admin: document.getElementById("reqAdmin").checked,
  };


  const message = document.getElementById("reqMessage").value || "";

  try {
    btn.disabled = true;
    btn.textContent = "Bezig…";

    const app = window._firebase.getApps().length
      ? window._firebase.getApp()
      : window._firebase.initializeApp(window.firebaseConfig);

    const db = window._firebase.getDatabase(app);

    // 1. Maak een unieke sleutel aan onder 'accountRequests'
    const requestsRef = window._firebase.ref(db, "accountRequests");
    const newRequestRef = window._firebase.push(requestsRef);

    // 2. Schrijf de data rechtstreeks naar de database
    await window._firebase.set(newRequestRef, {
      firstName,
      lastName,
      fullName,
      email,
      requestedRoles: roles,
      speltakken,
      message,
      status: "pending",
      createdAt: Date.now()
    });

    // Toon succes-scherm in de modal
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
    return;

  } catch (e) {
    console.error("Direct wegschrijven mislukt:", e);
    errEl.textContent = "Er ging iets mis bij het opslaan van je aanvraag. Probeer het later opnieuw.";
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
  initFirebaseAuth();

  document
    .getElementById("loginButton")
    ?.addEventListener("click", openLoginModal);

  document.getElementById("logoutButton")?.addEventListener("click", () => {
    if (auth) window._firebase.signOut(auth);
  });

  ensureAccountRequestButton();
});