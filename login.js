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
    let mustChangePassword = false;

    try {
      const db = window._firebase.getDatabase(app);
      const userRef = window._firebase.ref(db, `users/${user.uid}`);
      const snapshot = await window._firebase.get(userRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        roles = data.roles || {};
        status = data.status || "active";
        mustChangePassword = data.mustChangePassword === true;
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
      mustChangePassword,
      loginAt: Date.now(),
    });

    updateHeader();
    applyAuthVisibility();
    document.dispatchEvent(
      new CustomEvent("auth-changed", { detail: { loggedIn: true } })
    );

    // Tijdelijk wachtwoord? Dan eerst een eigen wachtwoord kiezen.
    if (mustChangePassword || hasPendingForcedPasswordChange()) {
      redirectToForcedPasswordChange();
    }
  });
}

// ======================================================================
// VERPLICHT WACHTWOORD WIJZIGEN
// ======================================================================

const FORCE_PW_KEY = "ovn_force_pw_change";

// SHA-256 van het oude gedeelde standaardwachtwoord (alleen voor de
// overgangsperiode; mag weg zodra niemand het meer gebruikt).
const OLD_DEFAULT_PASSWORD_SHA256 =
  "7cb94054014d7d02fe30c91ccd2a07338d82db2c5f36d5e81cf6db480f223958";

async function isOldDefaultPassword(password) {
  try {
    const bytes = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = [...new Uint8Array(digest)]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    return hex === OLD_DEFAULT_PASSWORD_SHA256;
  } catch {
    return false;
  }
}

function hasPendingForcedPasswordChange() {
  try {
    return sessionStorage.getItem(FORCE_PW_KEY) === "1";
  } catch {
    return false;
  }
}

function clearForcedPasswordChange() {
  try {
    sessionStorage.removeItem(FORCE_PW_KEY);
  } catch {}
}
window.clearForcedPasswordChange = clearForcedPasswordChange;
window.hasPendingForcedPasswordChange = hasPendingForcedPasswordChange;

function redirectToForcedPasswordChange() {
  if (/\/profile\.html$/.test(window.location.pathname)) return;

  const target = "profile.html?force_pw_change=true";
  const tempModal = document.getElementById("tempPasswordModal");
  const okBtn = document.getElementById("tempPasswordOkBtn");

  if (tempModal && okBtn) {
    tempModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    okBtn.onclick = () => {
      window.location.href = target;
    };
    return;
  }

  window.location.href = target;
}

// ======================================================================
// LOGIN + WACHTWOORD HERSTELLEN
// ======================================================================

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


function setInlineMessage(
  element,
  message = "",
  type = "error"
) {
  if (!element) return;

  element.textContent = message;
  element.classList.toggle("hidden", !message);

  element.classList.toggle(
    "auth-inline-message-error",
    type === "error"
  );

  element.classList.toggle(
    "auth-inline-message-success",
    type === "success"
  );
}


function closeLoginModal() {
  document.getElementById("loginModal")?.remove();

  if (!document.querySelector(".modal:not(.hidden)")) {
    document.body.classList.remove("modal-open");
  }
}


function openLoginModal() {
  if (document.getElementById("loginModal")) return;

  const modal = document.createElement("div");

  modal.className = "modal auth-modal";
  modal.id = "loginModal";

  modal.innerHTML = `
    <div
      class="modal-content auth-modal-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loginModalTitle"
    >
      <button
        class="modal-close-btn"
        id="loginClose"
        type="button"
        aria-label="Inlogvenster sluiten"
      >
        &times;
      </button>

      <div class="auth-modal-icon" aria-hidden="true">
        🔐
      </div>

      <h3 id="loginModalTitle">
        Inloggen
      </h3>

      <p class="auth-modal-description">
        Log in om de jaarplanning te beheren.
      </p>

      <form id="loginForm" novalidate>
        <div class="auth-form-group">
          <label for="loginUser">
            E-mailadres
          </label>

          <input
            id="loginUser"
            type="email"
            autocomplete="username"
            inputmode="email"
            placeholder="naam@voorbeeld.nl"
          >
        </div>

        <div class="auth-form-group">
          <label for="loginPass">
            Wachtwoord
          </label>

          <div class="password-field">
            <input
              id="loginPass"
              type="password"
              autocomplete="current-password"
              placeholder="Vul je wachtwoord in"
            >

            <button
              type="button"
              class="password-toggle"
              data-password-toggle="loginPass"
            >
              Tonen
            </button>
          </div>
        </div>

        <div class="forgot-password-row">
          <button
            id="forgotPasswordLink"
            type="button"
            class="forgot-password-link"
          >
            Wachtwoord vergeten?
          </button>
        </div>

        <div
          id="loginError"
          class="auth-inline-message auth-inline-message-error hidden"
          role="alert"
          aria-live="assertive"
        ></div>

        <div class="modal-actions auth-modal-actions">
          <button
            id="loginCancel"
            type="button"
            class="pill-btn outline"
          >
            Annuleren
          </button>

          <button
            id="loginSubmit"
            type="submit"
            class="pill-btn primary"
          >
            Inloggen
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  window.OVNPasswordUI?.initialise(modal);

  const form =
    modal.querySelector("#loginForm");

  const emailInput =
    modal.querySelector("#loginUser");

  const passwordInput =
    modal.querySelector("#loginPass");

  const submitButton =
    modal.querySelector("#loginSubmit");

  const errorElement =
    modal.querySelector("#loginError");

  modal
    .querySelector("#loginCancel")
    .addEventListener(
      "click",
      closeLoginModal
    );

  modal
    .querySelector("#loginClose")
    .addEventListener(
      "click",
      closeLoginModal
    );

  modal
    .querySelector("#forgotPasswordLink")
    .addEventListener("click", () => {
      const email = emailInput.value.trim();

      setInlineMessage(errorElement);

      if (!isValidEmail(email)) {
        setInlineMessage(
          errorElement,
          "Vul eerst een geldig e-mailadres in."
        );

        emailInput.focus();
        return;
      }

      openPasswordResetRequestModal(email);
    });

  form.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      setInlineMessage(errorElement);

      const email =
        emailInput.value.trim();

      const password =
        passwordInput.value;

      if (!isValidEmail(email) || !password) {
        setInlineMessage(
          errorElement,
          "Vul je e-mailadres en wachtwoord in."
        );

        if (!isValidEmail(email)) {
          emailInput.focus();
        } else {
          passwordInput.focus();
        }

        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Inloggen…";

      try {
        await window._firebase
          .signInWithEmailAndPassword(
            auth,
            email,
            password
          );

        /*
         * Overgangsregeling voor accounts die nog het oude,
         * gedeelde standaardwachtwoord gebruiken. We vergelijken
         * alleen een hash; het wachtwoord zelf staat niet meer in
         * de code. Nieuwe accounts krijgen een uniek tijdelijk
         * wachtwoord + het databaseveld mustChangePassword.
         */
        if (await isOldDefaultPassword(password)) {
          try {
            sessionStorage.setItem(FORCE_PW_KEY, "1");
          } catch {}
        }

        closeLoginModal();

        // De auth-listener stuurt door naar het profiel als
        // er eerst een nieuw wachtwoord gekozen moet worden.
        window.location.reload();

      } catch (error) {
        console.error(
          "Inloggen mislukt:",
          error
        );

        setInlineMessage(
          errorElement,
          "De combinatie van e-mailadres en wachtwoord klopt niet."
        );

        submitButton.disabled = false;
        submitButton.textContent = "Inloggen";

        passwordInput.select();
      }
    }
  );

  modal.addEventListener("click", event => {
    if (event.target === modal) {
      closeLoginModal();
    }
  });

  window.setTimeout(
    () => emailInput.focus(),
    50
  );
}


function openPasswordResetRequestModal(email) {
  document
    .getElementById("passwordResetRequestModal")
    ?.remove();

  const modal = document.createElement("div");

  modal.id = "passwordResetRequestModal";
  modal.className = "modal auth-modal";

  modal.innerHTML = `
    <div
      class="modal-content auth-modal-content auth-confirm-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="passwordResetRequestTitle"
    >
      <button
        id="passwordResetRequestClose"
        class="modal-close-btn"
        type="button"
        aria-label="Sluiten"
      >
        &times;
      </button>

      <div class="auth-modal-icon" aria-hidden="true">
        ✉️
      </div>

      <h3 id="passwordResetRequestTitle">
        Herstelmail versturen?
      </h3>

      <p class="auth-modal-description">
        We sturen een beveiligde link naar:
      </p>

      <strong class="auth-email-preview"></strong>

      <p class="auth-modal-note">
        Via die link kun je op de OVN Jaarplanning
        een nieuw wachtwoord instellen.
        Controleer ook je spammap.
      </p>

      <div
        id="passwordResetRequestMessage"
        class="auth-inline-message hidden"
        role="status"
        aria-live="polite"
      ></div>

      <div class="modal-actions auth-modal-actions">
        <button
          id="passwordResetRequestCancel"
          type="button"
          class="pill-btn outline"
        >
          Annuleren
        </button>

        <button
          id="passwordResetRequestSubmit"
          type="button"
          class="pill-btn primary"
        >
          Herstelmail versturen
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector(
    ".auth-email-preview"
  ).textContent = email;

  document.body.classList.add("modal-open");

  const message =
    modal.querySelector(
      "#passwordResetRequestMessage"
    );

  const submit =
    modal.querySelector(
      "#passwordResetRequestSubmit"
    );

  function closeResetRequestModal() {
    modal.remove();

    if (!document.querySelector(
      ".modal:not(.hidden)"
    )) {
      document.body.classList.remove(
        "modal-open"
      );
    }
  }

  modal
    .querySelector("#passwordResetRequestClose")
    .addEventListener(
      "click",
      closeResetRequestModal
    );

  modal
    .querySelector("#passwordResetRequestCancel")
    .addEventListener(
      "click",
      closeResetRequestModal
    );

  modal.addEventListener("click", event => {
    if (event.target === modal) {
      closeResetRequestModal();
    }
  });

  submit.addEventListener(
    "click",
    async () => {
      submit.disabled = true;
      submit.textContent = "Versturen…";

      setInlineMessage(message);

      try {
        auth.languageCode = "nl";

        await window._firebase
          .sendPasswordResetEmail(
            auth,
            email
          );

        setInlineMessage(
          message,
          "De herstelmail is verstuurd. Open de link in de e-mail om een nieuw wachtwoord te kiezen.",
          "success"
        );

        submit.textContent = "Verstuurd";

        window.setTimeout(() => {
          closeResetRequestModal();
          closeLoginModal();
        }, 2600);

      } catch (error) {
        console.error(
          "Wachtwoordherstel mislukt:",
          error
        );

        const resetErrorMessages = {
          "auth/invalid-email":
            "Dit e-mailadres is niet geldig.",

          "auth/too-many-requests":
            "Er zijn te veel herstelverzoeken gedaan. Probeer het later opnieuw.",

          "auth/network-request-failed":
            "De verbinding is mislukt. Controleer je internetverbinding."
        };

        setInlineMessage(
          message,
          resetErrorMessages[error.code] ||
            "De herstelmail kon niet worden verstuurd. Probeer het later opnieuw."
        );

        submit.disabled = false;
        submit.textContent =
          "Opnieuw proberen";
      }
    }
  );
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

  // Check of er ten minste één speltak is aangevinkt
  const heeftSpeltakGeselecteerd = Object.values(speltakken).some(Boolean);
  if (!heeftSpeltakGeselecteerd) {
    errEl.textContent = "Selecteer a.u.b. ten minste één speltak.";
    errEl.classList.remove("hidden");
    return;
  }

  const fullName = `${firstName} ${lastName}`.trim();

  const roles = {
    bestuur: document.getElementById("reqBestuur")?.checked || false,
    admin: document.getElementById("reqAdmin")?.checked || false,
  };

  // ✅ Met ?.value crasht de code niet meer als het veld ontbreekt in de modal
  const message = document.getElementById("reqMessage")?.value || "";

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