
function getFirebaseApp() {
  return window._firebase.getApps().length
    ? window._firebase.getApp()
    : window._firebase.initializeApp(window.firebaseConfig);
}
function speltakkenToArray(speltakken) {
  if (!speltakken) return [];
  if (Array.isArray(speltakken)) return speltakken;
  if (typeof speltakken === "object") {
    return Object.keys(speltakken).filter(k => speltakken[k] === true);
  }
  return [];
}


async function approveRequestViaFunction(requestId, rowEl) {
  rowEl.classList.add("loading");
  const actionCell = rowEl.querySelector("[data-actions]");
  if (!actionCell) return;

  try {
    const app = getFirebaseApp();
    const db = window._firebase.getDatabase(app);

    // 1. Haal de gegevens van de aanvraag op
    const requestSnap = await window._firebase.get(window._firebase.ref(db, `accountRequests/${requestId}`));
    if (!requestSnap.exists()) throw new Error("Aanvraag niet gevonden");
    const requestData = requestSnap.val();

    const email = requestData.email.trim();
    const tempPassword = "Welkom48!"; // Het standaard wachtwoord

    // 2. Maak de gebruiker aan in Firebase Authentication (via een secundaire app-instantie om uitloggen admin te voorkomen)
    // We maken een tijdelijke app aan met een unieke naam om de gebruiker te registreren
    const secondaryApp = window._firebase.initializeApp(window.firebaseConfig, "SecondaryAuthApp");
    const secondaryAuth = window._firebase.getAuth(secondaryApp);

    let userCredential;
    try {
      userCredential = await window._firebase.createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
      // Ruim de secundaire app direct weer op via de juiste SDK methode
      if (window._firebase.deleteApp) {
        await window._firebase.deleteApp(secondaryApp);
      }
    } catch (authErr) {
      // Als er iets misgaat, proberen we de app alsnog netjes te verwijderen
      try {
        if (window._firebase.deleteApp) {
          await window._firebase.deleteApp(secondaryApp);
        }
      } catch (e) { }

      // Als de gebruiker al bestaat in Auth, gaan we gewoon door naar de database-stap
      if (authErr.code === "auth/email-already-in-use") {
        console.warn("Gebruiker bestaat al in Firebase Auth, we updaten alleen de database.");
      } else {
        throw new Error("Auth registratie mislukt: " + authErr.message);
      }
    }

    const newUid = userCredential ? userCredential.user.uid : requestId;

    // 3. Maak de gebruiker direct aan in de 'users' tabel in de Database
    await window._firebase.set(window._firebase.ref(db, `users/${newUid}`), {
      fullName: requestData.fullName || "",
      email: email,
      status: "active",
      createdAt: Date.now(),
      roles: {
        admin: !!requestData.requestedRoles?.admin,
        bestuur: !!requestData.requestedRoles?.bestuur,
        speltakken: requestData.speltakken || []
      }
    });

    // 4. Verwijder de aanvraag uit de lijst
    await window._firebase.set(window._firebase.ref(db, `accountRequests/${requestId}`), null);

    rowEl.remove();
    loadUsers();

    // 5. Toon een pop-up met de kant-en-klare mailtekst om te kopiëren!
    const mailSubject = "Je account voor de OVN Jaarplanning is actief!";
    const mailBody = `Hoi ${requestData.fullName || 'Scout'},\n\n` +
      `Je account voor de Jaarplanning-website is zojuist goedgekeurd!\n\n` +
      `Je kunt nu inloggen met de volgende gegevens:\n` +
      `- Website: https://ovnscouting.github.io/Jaarplanning/\n` +
      `- Gebruikersnaam: ${email}\n` +
      `- Tijdelijk wachtwoord: ${tempPassword}\n\n` +
      `Pas direct je wachtwoord aan na je eerste keer inloggen.\n\n` +
      `Met vriendelijke groet,\n` +
      `De OVN Admin`;

    // We maken een mooie modal met de tekst die je zo kunt kopiëren
    showCopyModal(email, mailSubject, mailBody);

  } catch (err) {
    console.error("Goedkeuren mislukt:", err);
    showToast("Fout bij goedkeuren: " + err.message, "error", 4200);
  } finally {
    rowEl.classList.remove("loading");
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



async function updateAccountRequestStatus(requestId, newStatus, rowEl, reason = "") {
  if (newStatus !== "rejected") return;

  rowEl.classList.add("loading");

  const actionsCell = rowEl.querySelector("[data-actions]");
  const originalActions = actionsCell ? actionsCell.innerHTML : "";

  if (actionsCell) {
    actionsCell.innerHTML = `
      <span class="inline-loading">
        <span class="btn-spinner" aria-hidden="true"></span>
        Afwijzen…
      </span>
    `;
  }

  try {
    await callFunction("rejectAccountRequest", { requestId, reason });

    // Reject verwijdert aanvraag direct (server-side) → lijst opnieuw ophalen
    renderAccountRequests();
    showToast("Aanvraag afgewezen (mail verstuurd)", "success");

  } catch (e) {
    if (actionsCell) actionsCell.innerHTML = originalActions;
    showToast(e?.message || "Afwijzen mislukt", "error", 4200);
  } finally {
    rowEl.classList.remove("loading");
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



/* ============================================================
   ACCOUNT REQUESTS — READ ONLY (FASE C.1)
============================================================ */

function renderAccountRequests() {
  const app = getFirebaseApp();


  const db = window._firebase.getDatabase(app);
  const requestsRef = window._firebase.ref(db, "accountRequests");

  window._firebase.get(requestsRef).then(snapshot => {
    if (!snapshot.exists()) return;

    const requests = snapshot.val();
    const tbody = document.getElementById("accountRequestTable");
    if (!tbody) return;

    tbody.innerHTML = "";

    Object.entries(requests)
      .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0))
      .forEach(([id, r]) => {
        const tr = document.createElement("tr");

        const rollen = [
          r.requestedRoles?.admin ? "Admin" : null,
          r.requestedRoles?.bestuur ? "Bestuur" : null
        ].filter(Boolean).join(", ") || "—";

        const speltakken = Array.isArray(r.speltakken) && r.speltakken.length
          ? r.speltakken.join(", ")
          : "—";

        const created = r.createdAt
          ? new Date(r.createdAt).toLocaleString("nl-NL")
          : "—";

        tr.innerHTML = `
          <td>${r.fullName || "—"}</td>
          <td>${r.email || "—"}</td>
          
          <td>${rollen}</td>
          <td>${speltakken}</td>
         <td data-status>
<span class="status-badge status-${["approved", "rejected", "pending"].includes(r.status) ? r.status : "pending"}">
              ${r.status === "approved"
            ? "Goedgekeurd"
            : r.status === "rejected"
              ? "Afgewezen"
              : "In behandeling"
          }
            </span>
          </td>
          <td style="font-size:0.85rem">${created}</td>
        <td data-actions>
  ${r.status === "pending" ? `
    <button class="pill-btn success" data-approve>Goedkeuren</button>
    <button class="pill-btn danger" data-reject>Afwijzen</button>
  ` : "—"}
</td>


        `;
        if (r.status === "pending") {
          tr.querySelector("[data-approve]")?.addEventListener("click", () => {
            approveRequestViaFunction(id, tr);
          });

          tr.querySelector("[data-reject]")?.addEventListener("click", () => {
            const ok = confirm("Weet je zeker dat je deze aanvraag wilt afwijzen?");
            if (!ok) return;

            updateAccountRequestStatus(id, "rejected", tr, "");
          });
        }




        tbody.appendChild(tr);
      });
  });
}
waitForFirebase(renderAccountRequests);

function loadUsers() {
  const app = getFirebaseApp();

  const db = window._firebase.getDatabase(app);
  const ref = window._firebase.ref(db, "users");

  window._firebase.get(ref).then(snap => {
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
    await callFunction("updateUser", {
      uid: selectedUserId,
      roles: {
        admin: editAdmin.checked,
        bestuur: editBestuur.checked,
        speltakken: Array.from(
          document.querySelectorAll(".edit-speltak:checked")
        ).map(cb => cb.value),
      },
      status: editInactive.checked ? "inactive" : "active",
    });

    loadUsers();
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
