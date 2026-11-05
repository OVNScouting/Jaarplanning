
// Tekst veilig in HTML zetten (namen, e-mailadressen uit aanvragen e.d.).
// Accountaanvragen kunnen door iedereen worden ingediend, dus die
// gegevens nooit ongefilterd via innerHTML tonen.
function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getFirebaseApp() {
  return window._firebase.getApps().length
    ? window._firebase.getApp()
    : window._firebase.initializeApp(window.firebaseConfig);
}

function speltakkenToArray(speltakken) {
  if (!speltakken) return [];
  if (Array.isArray(speltakken)) return speltakken;
  if (typeof speltakken === "object") {
    const values = Object.values(speltakken);
    // Als Firebase het opslaat als {0: "bevers", 1: "scouts"}
    if (values.every(v => typeof v === "string")) {
      return values;
    }
    // Als Firebase het opslaat als {bevers: true, scouts: true}
    return Object.keys(speltakken).filter(k => speltakken[k] === true);
  }
  return [];
}


async function approveRequestViaFunction(
  requestId,
  rowEl = null,
  triggerButton = null
) {
  rowEl?.classList.add("loading");

  setButtonLoading(
    triggerButton,
    true,
    "Goedkeuren…"
  );

  try {
    const app = getFirebaseApp();
    const db = window._firebase.getDatabase(app);

    // Lees de aanvraag opnieuw in.
    // Hierdoor worden de zojuist opgeslagen correcties gebruikt.
    const requestRef =
      window._firebase.ref(
        db,
        `accountRequests/${requestId}`
      );

    const requestSnap =
      await window._firebase.get(
        requestRef
      );

    if (!requestSnap.exists()) {
      throw new Error(
        "Aanvraag niet gevonden"
      );
    }

    const requestData =
      requestSnap.val();

    const email =
      String(
        requestData.email || ""
      ).trim();

    if (!email) {
      throw new Error(
        "De aanvraag bevat geen geldig e-mailadres."
      );
    }


    /*
     * Het account wordt op de server aangemaakt (Cloud Function
     * approveAccountRequest). Daardoor kan zelf-registratie in
     * Firebase uit, krijgt elk account een uniek tijdelijk
     * wachtwoord, en wordt de aanvraag in dezelfde stap verwerkt.
     */
    const result =
      await callFunction(
        "approveAccountRequest",
        { requestId }
      );

    const tempPassword =
      result?.tempPassword || null;

    rowEl?.remove();

    closeAccountRequestModal();
    await renderAccountRequests();
    await loadUsers();
    loadAuditLog();


    const firstName =
      requestData.fullName
        ? requestData.fullName
            .trim()
            .split(/\s+/)[0]
        : "Scout";


    const mailSubject =
      "Je account voor de OVN Jaarplanning is actief!";

    // Bestond het account al? Dan blijft het eigen wachtwoord
    // gewoon geldig en sturen we geen tijdelijk wachtwoord mee.
    const mailBody = tempPassword
      ? `Heyhoi ${firstName},\n\n` +
        `Je account voor de Jaarplanning van OVN is zojuist goedgekeurd!\n\n` +
        `Je kunt nu inloggen met de volgende gegevens:\n` +
        `- Website: https://ovnjaarplanning.nl\n` +
        `- Gebruikersnaam: ${email}\n` +
        `- Tijdelijk wachtwoord: ${tempPassword}\n\n` +
        `Na je eerste keer inloggen kies je direct een eigen wachtwoord.\n\n` +
        `Met vriendelijke groet,\n` +
        `De Admin`
      : `Heyhoi ${firstName},\n\n` +
        `Je aanvraag voor de Jaarplanning van OVN is goedgekeurd!\n\n` +
        `Je had al een account, dus je kunt inloggen op https://ovnjaarplanning.nl ` +
        `met je bestaande e-mailadres (${email}) en wachtwoord.\n` +
        `Wachtwoord vergeten? Gebruik dan "Wachtwoord vergeten?" in het inlogscherm.\n\n` +
        `Met vriendelijke groet,\n` +
        `De Admin`;


    showCopyModal(
      email,
      mailSubject,
      mailBody
    );

    return true;

  } catch (error) {
    console.error(
      "Goedkeuren mislukt:",
      error
    );

    showAccountRequestModalError(
      "Goedkeuren mislukt: " +
      (
        error?.message ||
        "Onbekende fout"
      )
    );

    showToast(
      "Fout bij goedkeuren: " +
      (
        error?.message ||
        "Onbekende fout"
      ),
      "error",
      4200
    );

    return false;

  } finally {
    rowEl?.classList.remove("loading");

    setButtonLoading(
      triggerButton,
      false
    );
  }
}

// Hulpelement om de kopieer-modal te tonen
function showCopyModal(toEmail, subject, body) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.style.zIndex = "9999";
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px; text-align: left;">
      <h3>Account goedgekeurd! 🎉</h3>
      <p>Het account is nu actief in de database. Stuur handmatig een mailtje naar <strong>${escapeHtml(toEmail)}</strong> met de onderstaande gegevens:</p>
      
      <label><strong>Onderwerp:</strong></label>
      <input type="text" value="${escapeHtml(subject)}" readonly style="width:100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px;">
      
      <label><strong>Inhoud:</strong></label>
      <textarea readonly rows="10" style="width:100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: sans-serif;">${escapeHtml(body)}</textarea>
      
      <div class="modal-actions" style="margin-top: 15px;">
        <button id="btnOpenMail" class="pill-btn outline">Open Mail Programma</button>
        <button id="btnCloseCopyModal" class="pill-btn">Sluiten</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Knop om direct een mail te openen met de velden al ingevuld in een nieuw tabblad
  modal.querySelector("#btnOpenMail").onclick = () => {
    const mailtoUrl = `mailto:${toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, "_blank");
  };

  modal.querySelector("#btnCloseCopyModal").onclick = () => {
    modal.remove();
  };
}


let USERS_CACHE = {};
let selectedUserId = null;

function getFunctions() {
  const app = getFirebaseApp();
  return window._firebase.getFunctions(app);
}

function callFunction(name, data) {
  const fn = window._firebase.httpsCallable(getFunctions(), name);
  return fn(data)
    .then(r => r.data)
    .catch(err => {
      const details =
        typeof err?.details === "string"
          ? err.details
          : err?.details
            ? JSON.stringify(err.details)
            : "";

      throw new Error(
        err?.message ||
        details ||
        err?.code ||
        "Onbekende fout"
      );
    });

}
window.callFunction = callFunction;

function showToast(message, type = "info", ms = 2600) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast hidden";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }

  el.textContent = String(message || "");
  el.dataset.type = type;
  el.classList.remove("hidden");

  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), ms);
}

function setButtonLoading(btn, loading, label) {
  if (!btn) return;

  if (loading) {
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `
      <span class="btn-spinner" aria-hidden="true"></span>
      ${label || "Bezig…"}
    `;
  } else {
    if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
    }
    btn.disabled = false;
  }
}



async function updateAccountRequestStatus(
  requestId,
  newStatus,
  rowEl = null,
  reason = "",
  triggerButton = null
) {
  if (newStatus !== "rejected") return false;

  rowEl?.classList.add("loading");

  setButtonLoading(
    triggerButton,
    true,
    "Afwijzen…"
  );

  try {
    await callFunction(
      "rejectAccountRequest",
      {
        requestId,
        reason
      }
    );

    rowEl?.remove();

    closeAccountRequestModal();
    await renderAccountRequests();
    loadAuditLog();

    showToast(
      "Aanvraag afgewezen",
      "success"
    );

    return true;

  } catch (error) {
    console.error(
      "Afwijzen mislukt:",
      error
    );

    showAccountRequestModalError(
      error?.message ||
      "De aanvraag kon niet worden afgewezen."
    );

    showToast(
      error?.message ||
      "Afwijzen mislukt",
      "error",
      4200
    );

    return false;

  } finally {
    rowEl?.classList.remove("loading");

    setButtonLoading(
      triggerButton,
      false
    );
  }
}




// ============================================================
// WACHT TOT FIREBASE BESCHIKBAAR IS
// ============================================================
function waitForFirebase(callback, retries = 100) {
  if (window._firebase && window.firebaseConfig) {
    callback();
    return;
  }

  if (retries <= 0) {
    console.error("Firebase niet beschikbaar na wachten");
    return;
  }

  setTimeout(() => waitForFirebase(callback, retries - 1), 100);
}
waitForFirebase(() => {

  (async function guardAdmin() {
    const app = getFirebaseApp();
    const auth = window._firebase.getAuth(app);

    const unsubscribe = window._firebase.onAuthStateChanged(auth, async (user) => {
      unsubscribe();

      if (!user) {
        deny();
        return;
      }

      try {
        const token = await user.getIdTokenResult(true);
        const claimAdmin = !!token.claims?.admin;

        let dbAdmin = false;
        try {
          const db = window._firebase.getDatabase(app);
          const snap = await window._firebase.get(
            window._firebase.ref(db, `users/${user.uid}/roles/admin`)
          );
          dbAdmin = snap.exists() && snap.val() === true;
        } catch (e) {
          console.warn("Kon admin-rol niet lezen uit RTDB:", e);
        }

        if (!claimAdmin && !dbAdmin) {
          deny();
          return;
        }

        document.body.classList.remove("hidden");


      } catch (e) {
        console.error("Kon admin-claim niet lezen:", e);
        deny();
      }
    });

    function deny() {
      document.body.innerHTML = `
        <div style="padding:2rem;text-align:center">
          <h2>Oeps, je bent verdwaald</h2>
          <p>
            Deze pagina is alleen voor admins.<br>
            Log in als admin om deze pagina te bekijken.
          </p>
          <p>Je wordt binnen 10 seconden teruggestuurd naar de homepagina.</p>
        </div>
      `;

      setTimeout(() => {
        window.location.href = "index.html";
      }, 10000);
    }
  })();
});


const SPELTAK_KEYS = ["bevers", "welpen", "scouts", "explorers", "rovers", "stam"];
const SPELTAK_LABELS = {
  bevers: "Bevers",
  welpen: "Welpen",
  scouts: "Scouts",
  explorers: "Explorers",
  rovers: "Rovers",
  stam: "Stam"
};

// Laatst ingelogd per uid (uit getAdminOverview). null = nooit.
let LAST_SIGNIN = null;

function formatLastLogin(uid) {
  if (!LAST_SIGNIN) return "—";
  if (!(uid in LAST_SIGNIN)) return "Geen login";
  const ts = LAST_SIGNIN[uid];
  if (!ts) return "Nog nooit";
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return "Vandaag";
  if (days === 1) return "Gisteren";
  if (days < 30) return `${days} dagen geleden`;
  return new Date(ts).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

// Heeft dit account aandacht nodig? (nooit ingelogd, tijdelijk
// wachtwoord, of al meer dan 120 dagen niet ingelogd)
function needsAttention(uid, user) {
  if (user.status === "inactive") return false;
  if (user.mustChangePassword === true) return true;
  if (!LAST_SIGNIN) return false;
  const ts = LAST_SIGNIN[uid];
  if (ts === null || !(uid in LAST_SIGNIN)) return true;
  return Date.now() - ts > 120 * 86400000;
}

function roleChipsHtml(user) {
  const chips = [];
  if (user.roles?.admin) chips.push(`<li class="role-chip role-admin">Admin</li>`);
  if (user.roles?.bestuur) chips.push(`<li class="role-chip role-bestuur">Bestuur</li>`);
  speltakkenToArray(user.roles?.speltakken)
    .filter(sp => SPELTAK_KEYS.includes(sp))
    .forEach(sp => chips.push(`<li class="role-chip role-${sp}">${SPELTAK_LABELS[sp]}</li>`));
  return chips.length ? chips.join("") : `<li class="role-chip role-none">Geen rol</li>`;
}

function renderUsers(users) {
  USERS_CACHE = users || {};
  const tbody = document.getElementById("userTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  const filters = Array.from(
    document.querySelectorAll("#userFilters input:checked")
  ).map(cb => cb.dataset.filter);

  const search = (document.getElementById("userSearch")?.value || "")
    .trim()
    .toLowerCase();

  const speltakFilters = filters.filter(f => SPELTAK_KEYS.includes(f));

  const rows = Object.entries(USERS_CACHE)
    .filter(([uid, u]) => {
      if (!u || typeof u !== "object") return false;

      if (search) {
        const haystack = `${u.fullName || ""} ${u.firstName || ""} ${u.lastName || ""} ${u.email || ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      // Gedeactiveerde accounts alleen tonen als daarop gefilterd wordt.
      if (filters.includes("inactive")) {
        if (u.status !== "inactive") return false;
      }

      if (filters.includes("admin") && !u.roles?.admin) return false;
      if (filters.includes("bestuur") && !u.roles?.bestuur) return false;
      if (filters.includes("attention") && !needsAttention(uid, u)) return false;

      if (speltakFilters.length > 0) {
        const userSpeltakken = speltakkenToArray(u.roles?.speltakken);
        if (!speltakFilters.some(sp => userSpeltakken.includes(sp))) return false;
      }

      return true;
    })
    .sort((a, b) =>
      (a[1].fullName || a[1].email || "").localeCompare(
        b[1].fullName || b[1].email || "",
        "nl",
        { sensitivity: "base" }
      )
    );

  const total = Object.keys(USERS_CACHE).length;
  const countEl = document.getElementById("userCount");
  if (countEl) {
    countEl.textContent = rows.length === total
      ? `${total} accounts`
      : `${rows.length} van ${total} accounts`;
  }

  const noUsersMsg = document.getElementById("noUsersMessage");
  if (noUsersMsg) {
    noUsersMsg.classList.toggle("hidden", rows.length > 0);
  }

  rows.forEach(([uid, user]) => {
    const tr = document.createElement("tr");
    tr.dataset.uid = uid;

    const isInactive = user.status === "inactive";
    const attention = needsAttention(uid, user);
    tr.classList.add("user-row");
    if (isInactive) tr.classList.add("is-inactive");
    if (uid === selectedUserId) tr.classList.add("is-selected");

    const name =
      user.fullName ||
      `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.email;

    tr.innerHTML = `
      <td class="user-name-cell">
        <span class="user-name">${escapeHtml(name)}</span>
        <span class="user-email">${escapeHtml(user.email || "")}</span>
      </td>
      <td><ul class="role-chips">${roleChipsHtml(user)}</ul></td>
      <td class="user-login-cell">
        ${isInactive
          ? `<span class="status-badge status-inactive">Gedeactiveerd</span>`
          : `${escapeHtml(formatLastLogin(uid))}${attention ? ` <span class="attention-dot" title="Aandacht nodig" aria-label="Aandacht nodig">●</span>` : ""}`}
      </td>
    `;

    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-label", `${name} openen`);

    tr.addEventListener("click", () => openUserPanel(uid));
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openUserPanel(uid);
      }
    });

    tbody.appendChild(tr);
  });

  updateAccountsStat();
}

// ============================================================
// OVERZICHT (tegels bovenaan)
// ============================================================
function setOverviewStat(key, value, sub = "", highlight = false) {
  const valueEl = document.getElementById(`stat${key}Value`);
  const subEl = document.getElementById(`stat${key}Sub`);
  const card = document.getElementById(`stat${key}`);
  if (valueEl) valueEl.textContent = String(value);
  if (subEl) subEl.textContent = sub || "\u00a0";
  card?.classList.toggle("needs-attention", !!highlight);
}

function updateAccountsStat() {
  const entries = Object.entries(USERS_CACHE).filter(([, u]) => u && typeof u === "object");
  const active = entries.filter(([, u]) => u.status !== "inactive");
  const attention = active.filter(([uid, u]) => needsAttention(uid, u)).length;
  setOverviewStat(
    "Accounts",
    active.length,
    attention
      ? `${attention} met aandacht nodig`
      : LAST_SIGNIN ? "iedereen is actief" : "actieve accounts",
    attention > 0
  );
}

async function loadOverview() {
  const app = getFirebaseApp();
  const db = window._firebase.getDatabase(app);

  // Open meldingen
  try {
    const snap = await window._firebase.get(window._firebase.ref(db, "bugs"));
    const bugs = Object.values(snap.val() || {});
    const nieuw = bugs.filter(b => !b.status || b.status === "Nieuw").length;
    const bezig = bugs.filter(b => b.status === "In behandeling").length;
    setOverviewStat(
      "Bugs",
      nieuw + bezig,
      nieuw ? `${nieuw} nieuw, ${bezig} mee bezig` : bezig ? `${bezig} mee bezig` : "alles afgehandeld",
      nieuw > 0
    );
  } catch (e) {
    console.warn("Meldingen tellen mislukt:", e);
    setOverviewStat("Bugs", "?", "kon niet laden");
  }

  // Jeugdleden per speltak (openbare lijst, verborgen leden niet meegeteld)
  const listEl = document.getElementById("statLedenList");
  if (listEl) {
    try {
      const counts = await Promise.all(
        SPELTAK_KEYS.map(async sp => {
          const snap = await window._firebase.get(
            window._firebase.ref(db, `${sp}/public/jeugdleden`)
          );
          const leden = Object.values(snap.val() || {}).filter(l => l && !l.hidden);
          return [sp, leden.length];
        })
      );
      const total = counts.reduce((sum, [, n]) => sum + n, 0);
      listEl.innerHTML =
        counts.map(([sp, n]) => `
          <a class="speltak-count speltak-${sp}" href="${sp}.html">
            <span>${SPELTAK_LABELS[sp]}</span><strong>${n}</strong>
          </a>`).join("") +
        `<span class="speltak-count speltak-total"><span>Totaal</span><strong>${total}</strong></span>`;
    } catch (e) {
      console.warn("Leden tellen mislukt:", e);
      listEl.innerHTML = `<span class="text-muted">Kon leden niet tellen.</span>`;
    }
  }

  // Laatst ingelogd (Cloud Function; werkt pas na deploy)
  try {
    const result = await callFunction("getAdminOverview", {});
    LAST_SIGNIN = result?.lastSignIn || {};
    renderUsers(USERS_CACHE);
    if (selectedUserId) fillLastLogin(selectedUserId);
  } catch (e) {
    console.warn("Inloggegevens niet beschikbaar:", e);
  }
}

// ============================================================
// LOGBOEK
// ============================================================
let auditLimit = 30;

async function loadAuditLog() {
  const list = document.getElementById("auditLogList");
  const moreBtn = document.getElementById("auditLogMore");
  if (!list) return;

  try {
    const app = getFirebaseApp();
    const db = window._firebase.getDatabase(app);
    const q = window._firebase.query(
      window._firebase.ref(db, "auditLog"),
      window._firebase.limitToLast(auditLimit + 1)
    );
    const snap = await window._firebase.get(q);
    const entries = Object.values(snap.val() || {})
      .sort((a, b) => (b.at || 0) - (a.at || 0));

    const hasMore = entries.length > auditLimit;
    const shown = entries.slice(0, auditLimit);

    if (!shown.length) {
      list.innerHTML = `<li class="text-muted">Nog geen wijzigingen vastgelegd. Nieuwe account- en rolwijzigingen verschijnen hier automatisch.</li>`;
    } else {
      list.innerHTML = shown.map(entry => {
        const when = entry.at
          ? new Date(entry.at).toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
          : "";
        const details = Array.isArray(entry.details) && entry.details.length
          ? `<ul class="audit-details">${entry.details.map(d => `<li>${escapeHtml(d)}</li>`).join("")}</ul>`
          : "";
        return `
          <li class="audit-entry">
            <div class="audit-head">
              <strong>${escapeHtml(entry.action || "Wijziging")}</strong>
              <span class="text-muted">${escapeHtml(entry.targetName || "")}</span>
            </div>
            ${details}
            <div class="audit-meta text-muted">door ${escapeHtml(entry.actorName || "onbekend")} · ${escapeHtml(when)}</div>
          </li>`;
      }).join("");
    }

    moreBtn?.classList.toggle("hidden", !hasMore);
  } catch (e) {
    console.warn("Logboek laden mislukt:", e);
    list.innerHTML = `<li class="text-muted">Het logboek kon niet worden geladen. (Zijn de nieuwe database rules al gepubliceerd?)</li>`;
  }
}

document.getElementById("auditLogMore")?.addEventListener("click", () => {
  auditLimit += 50;
  loadAuditLog();
});

// ============================================================
// ACCOUNTAANVRAGEN — MODALSTATUS
// ============================================================

let selectedAccountRequestId = null;
let selectedAccountRequestData = null;
let selectedAccountRequestRow = null;
async function renderAccountRequests() {
  const list =
    document.getElementById(
      "accountRequestList"
    );

  const count =
    document.getElementById(
      "accountRequestCount"
    );

  if (!list) return;


  list.innerHTML = `
    <p class="account-request-empty">
      Aanvragen laden…
    </p>
  `;


  try {
    const app =
      getFirebaseApp();

    const db =
      window._firebase.getDatabase(
        app
      );

    const requestsRef =
      window._firebase.ref(
        db,
        "accountRequests"
      );

    const snapshot =
      await window._firebase.get(
        requestsRef
      );


    const requests =
      snapshot.exists()
        ? snapshot.val()
        : {};


    const pendingRequests =
      Object.entries(requests)
        .filter(
          ([, request]) =>
            !request.status ||
            request.status === "pending"
        )
        .sort(
          (a, b) =>
            (b[1].createdAt || 0) -
            (a[1].createdAt || 0)
        );


    list.innerHTML = "";


    setOverviewStat(
      "Requests",
      pendingRequests.length,
      pendingRequests.length === 1
        ? "wacht op beoordeling"
        : "wachten op beoordeling",
      pendingRequests.length > 0
    );

    if (count) {
      count.textContent =
        String(
          pendingRequests.length
        );

      count.classList.toggle(
        "hidden",
        pendingRequests.length === 0
      );
    }


    if (!pendingRequests.length) {
      const emptyState =
        document.createElement(
          "div"
        );

      emptyState.className =
        "account-request-empty-state";

      emptyState.innerHTML = `
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Geen openstaande aanvragen</strong>
          <p>Nieuwe accountaanvragen verschijnen hier automatisch.</p>
        </div>
      `;

      list.appendChild(
        emptyState
      );

      return;
    }


    pendingRequests.forEach(
      ([id, request]) => {
        const item =
          document.createElement(
            "button"
          );

        item.type =
          "button";

        item.className =
          "account-request-list-item";

        item.dataset.requestId =
          id;


        const name =
          document.createElement(
            "span"
          );

        name.className =
          "account-request-list-name";

        name.textContent =
          request.fullName ||
          [
            request.firstName,
            request.lastName
          ]
            .filter(Boolean)
            .join(" ") ||
          "Naam onbekend";


        const arrow =
          document.createElement(
            "span"
          );

        arrow.className =
          "account-request-list-arrow";

        arrow.setAttribute(
          "aria-hidden",
          "true"
        );

        arrow.textContent =
          "›";


        item.append(
          name,
          arrow
        );


        item.addEventListener(
          "click",
          () => {
            openAccountRequestModal(
              id,
              request,
              item
            );
          }
        );


        list.appendChild(
          item
        );
      }
    );

  } catch (error) {
    console.error(
      "Accountaanvragen laden mislukt:",
      error
    );

    list.innerHTML = `
      <div class="account-request-load-error">
        Accountaanvragen konden niet worden geladen.
      </div>
    `;

    if (count) {
      count.classList.add(
        "hidden"
      );
    }
  }
}


waitForFirebase(
  renderAccountRequests
);

// ============================================================
// ACCOUNTAANVRAAG — DETAILMODAL
// ============================================================

function getAccountRequestModal() {
  return document.getElementById(
    "accountRequestAdminModal"
  );
}


function showAccountRequestModalError(
  message = ""
) {
  const errorElement =
    document.getElementById(
      "accountRequestModalError"
    );

  if (!errorElement) return;

  errorElement.textContent =
    message;

  errorElement.classList.toggle(
    "hidden",
    !message
  );
}


function setAccountRequestRejectMode(
  enabled
) {
  document
    .getElementById(
      "accountRequestRejectConfirm"
    )
    ?.classList
    .toggle(
      "hidden",
      !enabled
    );

  document
    .getElementById(
      "accountRequestModalActions"
    )
    ?.classList
    .toggle(
      "hidden",
      enabled
    );
}


function openAccountRequestModal(
  requestId,
  requestData,
  rowElement
) {
  const modal =
    getAccountRequestModal();

  if (!modal) return;


  selectedAccountRequestId =
    requestId;

  selectedAccountRequestData = {
    ...requestData
  };

  selectedAccountRequestRow =
    rowElement;


  showAccountRequestModalError(
    ""
  );

  setAccountRequestRejectMode(
    false
  );


  const fullName =
    requestData.fullName ||
    [
      requestData.firstName,
      requestData.lastName
    ]
      .filter(Boolean)
      .join(" ");


  document.getElementById(
    "accountRequestName"
  ).value = fullName || "";


  document.getElementById(
    "accountRequestEmail"
  ).value = requestData.email || "";


  document.getElementById(
    "accountRequestRoleBestuur"
  ).checked =
    !!requestData
      .requestedRoles
      ?.bestuur;


  document.getElementById(
    "accountRequestRoleAdmin"
  ).checked =
    !!requestData
      .requestedRoles
      ?.admin;


  const selectedSpeltakken =
    new Set(
      speltakkenToArray(
        requestData.speltakken
      )
    );


  document
    .querySelectorAll(
      'input[name="accountRequestSpeltak"]'
    )
    .forEach(
      checkbox => {
        checkbox.checked =
          selectedSpeltakken.has(
            checkbox.value
          );
      }
    );


  document.getElementById(
    "accountRequestCreated"
  ).textContent =
    requestData.createdAt
      ? new Date(
          requestData.createdAt
        ).toLocaleString(
          "nl-NL",
          {
            dateStyle: "long",
            timeStyle: "short"
          }
        )
      : "Onbekend";


  const message =
    String(
      requestData.message || ""
    ).trim();


  document.getElementById(
    "accountRequestMessage"
  ).textContent =
    message ||
    "Geen bericht toegevoegd.";


  modal.classList.remove(
    "hidden"
  );

  document.body.classList.add(
    "account-request-modal-open"
  );


  requestAnimationFrame(
    () => {
      document
        .getElementById(
          "accountRequestName"
        )
        ?.focus();
    }
  );
}


function closeAccountRequestModal() {
  const modal =
    getAccountRequestModal();

  modal?.classList.add(
    "hidden"
  );

  document.body.classList.remove(
    "account-request-modal-open"
  );


  setAccountRequestRejectMode(
    false
  );

  showAccountRequestModalError(
    ""
  );


  selectedAccountRequestId =
    null;

  selectedAccountRequestData =
    null;

  selectedAccountRequestRow =
    null;
}


function getEditedAccountRequestData() {
  const fullName =
    document
      .getElementById(
        "accountRequestName"
      )
      ?.value
      .trim() || "";


  if (!fullName) {
    throw new Error(
      "Vul een volledige naam in."
    );
  }


  const requestedRoles = {
    bestuur:
      !!document
        .getElementById(
          "accountRequestRoleBestuur"
        )
        ?.checked,

    admin:
      !!document
        .getElementById(
          "accountRequestRoleAdmin"
        )
        ?.checked
  };


  const speltakken = {};

  document
    .querySelectorAll(
      'input[name="accountRequestSpeltak"]'
    )
    .forEach(
      checkbox => {
        speltakken[
          checkbox.value
        ] = checkbox.checked;
      }
    );


  const selectedSpeltakCount =
    Object.values(
      speltakken
    ).filter(Boolean).length;


  if (
    !requestedRoles.bestuur &&
    !requestedRoles.admin &&
    selectedSpeltakCount === 0
  ) {
    throw new Error(
      "Selecteer minimaal één rol of speltak."
    );
  }


  const nameParts =
    fullName
      .split(/\s+/)
      .filter(Boolean);


  return {
    fullName,

    firstName:
      nameParts[0] || "",

    lastName:
      nameParts
        .slice(1)
        .join(" "),

    requestedRoles,

    speltakken
  };
}


async function saveAccountRequestEdits(
  requestId
) {
  const editedData =
    getEditedAccountRequestData();


  const app =
    getFirebaseApp();

  const db =
    window._firebase.getDatabase(
      app
    );


  await window._firebase.update(
    window._firebase.ref(
      db,
      `accountRequests/${requestId}`
    ),
    editedData
  );


  return editedData;
}


// ============================================================
// ACCOUNTAANVRAAG — KNOPPEN EN EVENTS
// ============================================================

function initAccountRequestModalEvents() {
  const modal =
    getAccountRequestModal();

  if (!modal) {
    console.warn(
      "Accountaanvraagmodal niet gevonden."
    );

    return;
  }


  const closeButton =
    document.getElementById(
      "closeAccountRequestModal"
    );

  const cancelButton =
    document.getElementById(
      "cancelAccountRequestModal"
    );

  const rejectButton =
    document.getElementById(
      "rejectAccountRequest"
    );

  const cancelRejectButton =
    document.getElementById(
      "cancelRejectAccountRequest"
    );

  const confirmRejectButton =
    document.getElementById(
      "confirmRejectAccountRequest"
    );

  const approveButton =
    document.getElementById(
      "approveAccountRequest"
    );


  /*
   * Voorkom dubbele listeners wanneer de
   * initialisatie onverhoopt opnieuw wordt uitgevoerd.
   */

  if (
    modal.dataset.eventsInitialized ===
    "true"
  ) {
    return;
  }

  modal.dataset.eventsInitialized =
    "true";


  /*
   * Modal sluiten via kruisje.
   */

  closeButton?.addEventListener(
    "click",
    closeAccountRequestModal
  );


  /*
   * Modal sluiten via knop Sluiten.
   */

  cancelButton?.addEventListener(
    "click",
    closeAccountRequestModal
  );


  /*
   * Eerste klik op Afwijzen opent de
   * nette bevestiging binnen de modal.
   */

  rejectButton?.addEventListener(
    "click",
    () => {
      showAccountRequestModalError(
        ""
      );

      setAccountRequestRejectMode(
        true
      );
    }
  );


  /*
   * Afwijzen annuleren.
   */

  cancelRejectButton?.addEventListener(
    "click",
    () => {
      setAccountRequestRejectMode(
        false
      );
    }
  );


  /*
   * Aanvraag definitief afwijzen.
   */

  confirmRejectButton?.addEventListener(
    "click",
    async () => {
      if (
        !selectedAccountRequestId
      ) {
        showAccountRequestModalError(
          "Er is geen aanvraag geselecteerd."
        );

        return;
      }


      await updateAccountRequestStatus(
        selectedAccountRequestId,
        "rejected",
        selectedAccountRequestRow,
        "",
        confirmRejectButton
      );
    }
  );


  /*
   * Gewijzigde gegevens opslaan en daarna
   * de aanvraag goedkeuren.
   */

  approveButton?.addEventListener(
    "click",
    async () => {
      if (
        !selectedAccountRequestId
      ) {
        showAccountRequestModalError(
          "Er is geen aanvraag geselecteerd."
        );

        return;
      }


      showAccountRequestModalError(
        ""
      );


      /*
       * Beide knoppen tijdelijk blokkeren,
       * zodat de aanvraag niet dubbel kan
       * worden verwerkt.
       */

      if (rejectButton) {
        rejectButton.disabled = true;
      }

      if (cancelButton) {
        cancelButton.disabled = true;
      }


      try {
        /*
         * Eerst de gecorrigeerde naam, rollen
         * en speltakken opslaan.
         */

        await saveAccountRequestEdits(
          selectedAccountRequestId
        );


        /*
         * Daarna keurt de bestaande functie
         * de bijgewerkte aanvraag goed.
         */

        await approveRequestViaFunction(
          selectedAccountRequestId,
          selectedAccountRequestRow,
          approveButton
        );

      } catch (error) {
        console.error(
          "Accountaanvraag verwerken mislukt:",
          error
        );


        showAccountRequestModalError(
          error?.message ||
          "De aanvraag kon niet worden verwerkt."
        );

      } finally {
        if (rejectButton) {
          rejectButton.disabled = false;
        }

        if (cancelButton) {
          cancelButton.disabled = false;
        }
      }
    }
  );


  /*
   * Klikken op de donkere achtergrond
   * sluit de modal.
   */

  modal.addEventListener(
    "click",
    event => {
      if (
        event.target === modal
      ) {
        closeAccountRequestModal();
      }
    }
  );


  /*
   * Escape sluit de modal.
   */

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key !== "Escape" ||
        modal.classList.contains(
          "hidden"
        )
      ) {
        return;
      }


      const rejectConfirm =
        document.getElementById(
          "accountRequestRejectConfirm"
        );


      /*
       * Wanneer de afwijsbevestiging open is,
       * sluit Escape eerst alleen die bevestiging.
       */

      if (
        rejectConfirm &&
        !rejectConfirm.classList.contains(
          "hidden"
        )
      ) {
        setAccountRequestRejectMode(
          false
        );

        return;
      }


      closeAccountRequestModal();
    }
  );
}

waitForFirebase(
  initAccountRequestModalEvents
);

function loadUsers() {
  const app = getFirebaseApp();
  const db = window._firebase.getDatabase(app);
  const ref = window._firebase.ref(db, "users");

  return window._firebase.get(ref).then(snap => {
    if (snap.exists()) renderUsers(snap.val());
  });
}

// ===============================
// DOM references voor zijpaneel
// ===============================
let editAdmin, editBestuur, editInactive;
let panelView, panelEdit;

waitForFirebase(() => {
  // DOM refs ophalen (DOM is nu zeker klaar)
  editAdmin = document.getElementById("editAdmin");
  editBestuur = document.getElementById("editBestuur");
  editInactive = document.getElementById("editInactive");

  panelView = document.getElementById("panelView");
  panelEdit = document.getElementById("panelEdit");

  // Users laden, daarna overzicht + logboek
  loadUsers().finally(() => {
    loadOverview();
    loadAuditLog();
  });

  // Filters en zoeken binden
  document
    .querySelectorAll("#userFilters input")
    .forEach(cb =>
      cb.addEventListener("change", () => {
        cb.closest(".filter-chip")?.classList.toggle("is-active", cb.checked);
        renderUsers(USERS_CACHE);
      })
    );

  document
    .getElementById("userSearch")
    ?.addEventListener("input", () => renderUsers(USERS_CACHE));
});

function fillLastLogin(uid) {
  const el = document.getElementById("panelLastLogin");
  if (el) el.textContent = formatLastLogin(uid);
}


function openUserPanel(uid) {
  selectedUserId = uid;
  const u = USERS_CACHE[uid];
  if (!u) return;

  openSidePanel();

  document.querySelectorAll("#userTable tr").forEach(tr =>
    tr.classList.toggle("is-selected", tr.dataset.uid === uid)
  );

  document.getElementById("panelView").classList.remove("hidden");
  document.getElementById("panelEdit").classList.add("hidden");

  document.getElementById("panelName").textContent =
    u.fullName || u.email || "—";
  document.getElementById("panelEmail").textContent = u.email || "—";
  document.getElementById("panelStatus").textContent =
    u.status === "inactive" ? "Gedeactiveerd" : "Actief";
  document.getElementById("panelCreated").textContent =
    u.createdAt ? new Date(u.createdAt).toLocaleDateString("nl-NL") : "—";
  fillLastLogin(uid);

  document.getElementById("panelRoles").innerHTML = roleChipsHtml(u);
  document.getElementById("panelTempPw")?.classList.toggle(
    "hidden",
    u.mustChangePassword !== true
  );

  // Jezelf verwijderen kan niet; knop dan uitschakelen.
  const me = window._firebase.getAuth(getFirebaseApp()).currentUser?.uid;
  const delBtn = document.getElementById("deleteUserBtn");
  if (delBtn) {
    delBtn.disabled = uid === me;
    delBtn.title = uid === me ? "Je kunt je eigen account niet verwijderen" : "";
  }
}

function openSidePanel() {
  const panel = document.getElementById("userSidePanel");
  const backdrop = document.getElementById("sidepanelBackdrop");

  panel.classList.remove("hidden");
  panel.classList.add("is-open");

  backdrop.classList.remove("hidden");
  document.body.classList.add("sidepanel-open");
}

function closeSidePanel() {
  const panel = document.getElementById("userSidePanel");
  const backdrop = document.getElementById("sidepanelBackdrop");

  panel.classList.remove("is-open");
  document.body.classList.remove("sidepanel-open");

  setTimeout(() => {
    panel.classList.add("hidden");
    backdrop.classList.add("hidden");
  }, 250);
}


document.getElementById("editUserBtn").onclick = () => {
  const u = USERS_CACHE[selectedUserId];
  if (!u) return;

  const nameInput = document.getElementById("editFullName");
  if (nameInput) nameInput.value = u.fullName || "";

  editAdmin.checked = !!u.roles?.admin;
  editBestuur.checked = !!u.roles?.bestuur;
  editInactive.checked = u.status === "inactive";

  const spArr = speltakkenToArray(u.roles?.speltakken);

  document
    .querySelectorAll(".edit-speltak")
    .forEach(cb => {
      cb.checked = spArr.includes(cb.value);
    });


  panelView.classList.add("hidden");
  panelEdit.classList.remove("hidden");
};

document.getElementById("cancelEditBtn").onclick = () => {
  panelEdit.classList.add("hidden");
  panelView.classList.remove("hidden");
};

document.getElementById("panelEdit").addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveBtn = document.getElementById("saveUserBtn");
  const cancelBtn = document.getElementById("cancelEditBtn");
  const panel = document.getElementById("userSidePanel");

  setButtonLoading(saveBtn, true, "Opslaan…");
  if (cancelBtn) cancelBtn.disabled = true;
  panel?.classList.add("is-busy");

  try {
    const selectedSpeltakken = Array.from(
      document.querySelectorAll(".edit-speltak:checked")
    ).map(cb => cb.value);

    const fullName =
      (document.getElementById("editFullName")?.value || "").trim();

    if (!fullName) {
      showToast("Naam mag niet leeg zijn", "error");
      document.getElementById("editFullName")?.focus();
      return;
    }

    await callFunction("updateUser", {
      uid: selectedUserId,
      fullName,
      roles: {
        admin: editAdmin.checked,
        bestuur: editBestuur.checked,
        speltakken: selectedSpeltakken
      },
      status: editInactive.checked ? "inactive" : "active",
    });

    await loadUsers();
    openUserPanel(selectedUserId);

    panelEdit.classList.add("hidden");
    panelView.classList.remove("hidden");
    showToast("Account bijgewerkt", "success");
    loadAuditLog();
  } catch (e) {
    showToast(e?.message || "Opslaan mislukt", "error", 4200);
  } finally {
    panel?.classList.remove("is-busy");
    if (cancelBtn) cancelBtn.disabled = false;
    setButtonLoading(saveBtn, false);
  }
});

document.getElementById("deleteUserBtn").onclick = () => {
  const deleteModal = document.getElementById("confirmDeleteModal");
  if (!deleteModal) return;

  // Toon de mooie modal
  deleteModal.classList.remove("hidden");

  // Als er op annuleren wordt geklikt
  deleteModal.querySelector("#confirmDeleteCancel").onclick = () => {
    deleteModal.classList.add("hidden");
  };

  // Als er op de rode verwijderknop wordt geklikt
  deleteModal.querySelector("#confirmDeleteSubmit").onclick = async () => {
    deleteModal.classList.add("hidden"); // Sluit modal direct

    try {
      // Via de server: verwijdert login én profiel, en logt het.
      await callFunction("deleteUserAccount", { uid: selectedUserId });

      showToast("Account verwijderd", "success");
      closeSidePanel();
      await loadUsers();
      loadAuditLog();
    } catch (e) {
      showToast(e?.message || "Verwijderen mislukt", "error", 4200);
    }
  };

  // Sluiten als je buiten de modal klikt
  deleteModal.onclick = (e) => {
    if (e.target === deleteModal) deleteModal.classList.add("hidden");
  };
};

document
  .getElementById("closeUserPanelBtn")
  ?.addEventListener("click", closeSidePanel);

document
  .getElementById("sidepanelBackdrop")
  ?.addEventListener("click", closeSidePanel);
