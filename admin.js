
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

    const tempPassword =
      "Welkom48!";


    // Maak gebruiker aan zonder de admin uit te loggen.
    const secondaryAppName =
      `SecondaryAuthApp-${Date.now()}`;

    const secondaryApp =
      window._firebase.initializeApp(
        window.firebaseConfig,
        secondaryAppName
      );

    const secondaryAuth =
      window._firebase.getAuth(
        secondaryApp
      );

    let userCredential = null;

    try {
      userCredential =
        await window._firebase
          .createUserWithEmailAndPassword(
            secondaryAuth,
            email,
            tempPassword
          );

    } catch (authError) {
      if (
        authError.code !==
        "auth/email-already-in-use"
      ) {
        throw new Error(
          "Auth-registratie mislukt: " +
          authError.message
        );
      }

      console.warn(
        "E-mailadres bestaat al in Firebase Authentication. Alleen de databasegegevens worden verwerkt."
      );

    } finally {
      try {
        if (
          window._firebase.deleteApp
        ) {
          await window._firebase.deleteApp(
            secondaryApp
          );
        }
      } catch (cleanupError) {
        console.warn(
          "Tijdelijke Firebase-app kon niet worden verwijderd:",
          cleanupError
        );
      }
    }


    const newUid =
      userCredential?.user?.uid ||
      requestId;


    // Maak of actualiseer het gebruikersprofiel.
    await window._firebase.set(
      window._firebase.ref(
        db,
        `users/${newUid}`
      ),
      {
        fullName:
          requestData.fullName || "",

        email,

        status: "active",

        createdAt:
          Date.now(),

        roles: {
          admin:
            !!requestData
              .requestedRoles
              ?.admin,

          bestuur:
            !!requestData
              .requestedRoles
              ?.bestuur,

          speltakken:
            requestData.speltakken || {}
        }
      }
    );


    // Verwijder de afgehandelde aanvraag.
    await window._firebase.set(
      requestRef,
      null
    );


    rowEl?.remove();

    closeAccountRequestModal();
    await renderAccountRequests();
    await loadUsers();


    const firstName =
      requestData.fullName
        ? requestData.fullName
            .trim()
            .split(/\s+/)[0]
        : "Scout";


    const mailSubject =
      "Je account voor de OVN Jaarplanning is actief!";

    const mailBody =
      `Heyhoi ${firstName},\n\n` +
      `Je account voor de Jaarplanning van OVN is zojuist goedgekeurd!\n\n` +
      `Je kunt nu inloggen met de volgende gegevens:\n` +
      `- Website: https://ovnjaarplanning.nl\n` +
      `- Gebruikersnaam: ${email}\n` +
      `- Tijdelijk wachtwoord: ${tempPassword}\n\n` +
      `Pas direct je wachtwoord aan na je eerste keer inloggen.\n\n` +
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
      <p>Het account is nu actief in de database. Stuur handmatig een mailtje naar <strong>${toEmail}</strong> met de onderstaande gegevens:</p>
      
      <label><strong>Onderwerp:</strong></label>
      <input type="text" value="${subject}" readonly style="width:100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px;">
      
      <label><strong>Inhoud:</strong></label>
      <textarea readonly rows="10" style="width:100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: sans-serif;">${body}</textarea>
      
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


function renderUsers(users) {
  USERS_CACHE = users || {};
  const tbody = document.getElementById("userTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  const filters = Array.from(
    document.querySelectorAll("#userFilters input:checked")
  ).map(cb => cb.dataset.filter);

  const rows = Object.entries(USERS_CACHE)
    .filter(([_, u]) => {
      // status / rol filters
      if (filters.includes("inactive") && u.status !== "inactive") return false;
      if (filters.includes("admin") && !u.roles?.admin) return false;
      if (filters.includes("bestuur") && !u.roles?.bestuur) return false;

      // speltak filters
      const speltakFilters = filters.filter(f =>
        ["bevers", "welpen", "scouts", "explorers", "rovers", "stam"].includes(f)
      );

      if (speltakFilters.length > 0) {
        const userSpeltakken = speltakkenToArray(u.roles?.speltakken);
        const heeftMatch = speltakFilters.some(s => userSpeltakken.includes(s));

        if (!heeftMatch) return false;
      }

      return true;
    })
    .sort((a, b) =>
      (a[1].fullName || "").localeCompare(
        b[1].fullName || "",
        "nl",
        { sensitivity: "base" }
      )
    );

  // Lege staat
  const noUsersMsg = document.getElementById("noUsersMessage");
  if (noUsersMsg) {
    noUsersMsg.classList.toggle("hidden", rows.length > 0);
  }

  // Render
  rows.forEach(([uid, user]) => {
    const tr = document.createElement("tr");
    tr.dataset.uid = uid;

    const isInactive = user.status === "inactive";
    if (isInactive) tr.style.opacity = "0.5";

    tr.innerHTML = `
<td>
  ${user.fullName ||
      `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.email}
</td>
      <td>
        <span class="status-badge ${isInactive ? "status-inactive" : "status-active"}">
          ${isInactive ? "Gedeactiveerd" : "Actief"}
        </span>
      </td>
    `;

    tr.classList.add("user-row");
    tr.tabIndex = 0; // keyboard focus

    tr.addEventListener("click", () => openUserPanel(uid));
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openUserPanel(uid);
      }
    });

    tbody.appendChild(tr);

  });
}

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

  // Users laden
  loadUsers();

  // Filters binden
  document
    .querySelectorAll("#userFilters input")
    .forEach(cb =>
      cb.addEventListener("change", () => renderUsers(USERS_CACHE))
    );
});


function openUserPanel(uid) {
  selectedUserId = uid;
  const u = USERS_CACHE[uid];
  if (!u) return;

  // UI openen
  openSidePanel();

  // View-state resetten
  document.getElementById("panelView").classList.remove("hidden");
  document.getElementById("panelEdit").classList.add("hidden");

  // Data vullen
  document.getElementById("panelName").textContent =
    u.fullName || "—";
  document.getElementById("panelEmail").textContent = u.email || "—";
  document.getElementById("panelStatus").textContent = u.status || "active";
  document.getElementById("panelCreated").textContent =
    u.createdAt ? new Date(u.createdAt).toLocaleDateString("nl-NL") : "—";

  const roles = document.getElementById("panelRoles");
  roles.innerHTML = "";

  if (u.roles?.admin) roles.innerHTML += "<li>Admin</li>";
  if (u.roles?.bestuur) roles.innerHTML += "<li>Bestuur</li>";
  const spArr = speltakkenToArray(u.roles?.speltakken);
  if (spArr.length) {
    spArr.forEach(s => {
      roles.innerHTML += `<li>${s}</li>`;
    });
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

document.getElementById("saveUserBtn").onclick = async () => {
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

    await callFunction("updateUser", {
      uid: selectedUserId,
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
  } catch (e) {
    showToast(e?.message || "Opslaan mislukt", "error", 4200);
  } finally {
    panel?.classList.remove("is-busy");
    if (cancelBtn) cancelBtn.disabled = false;
    setButtonLoading(saveBtn, false);
  }
};

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
      const app = getFirebaseApp();
      const db = window._firebase.getDatabase(app);
      const userRef = window._firebase.ref(db, `users/${selectedUserId}`);

      await window._firebase.remove(userRef);

      showToast("Gebruiker succesvol verwijderd", "success");
      closeSidePanel();
      loadUsers();
    } catch (e) {
      alert(e.message || "Verwijderen mislukt");
    }
  };

  // Sluiten als je buiten de modal klikt
  deleteModal.onclick = (e) => {
    if (e.target === deleteModal) deleteModal.classList.add("hidden");
  };
};

// ===============================
// Filters inklapbaar maken
// ===============================
const toggleBtn = document.getElementById("toggleUserFilters");
const filtersEl = document.getElementById("userFilters");

if (toggleBtn && filtersEl) {
  toggleBtn.addEventListener("click", () => {
    const isHidden = filtersEl.classList.contains("hidden");

    filtersEl.classList.toggle("hidden", !isHidden);
    toggleBtn.textContent = isHidden
      ? "Verberg filters"
      : "Toon filters";
  });
}

document
  .getElementById("closeUserPanelBtn")
  ?.addEventListener("click", closeSidePanel);

document
  .getElementById("sidepanelBackdrop")
  ?.addEventListener("click", closeSidePanel);
