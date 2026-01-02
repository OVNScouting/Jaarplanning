
function getFirebaseApp() {
  return window._firebase.getApps().length
    ? window._firebase.getApp()
    : window._firebase.initializeApp(window.firebaseConfig);
}

async function callSetAdminRole(targetUid, makeAdmin) {
const app = getFirebaseApp();


  const functions = window._firebase.getFunctions(app);
  const fn = window._firebase.httpsCallable(functions, "setAdminRole");

  return fn({ targetUid, makeAdmin });
}


async function approveRequestViaFunction(requestId, rowEl) {
  // visuele state
  rowEl.classList.add("loading");

  const actionCell = rowEl.querySelector("[data-actions]");
  const originalActions = actionCell.innerHTML;

  // voorkom dubbel klikken
  actionCell.innerHTML = "⏳ Goedkeuren…";

  try {
    const app = getFirebaseApp();


    const functions = window._firebase.getFunctions(app);
    const approveFn = window._firebase.httpsCallable(
      functions,
      "approveAccountRequest"
    );

    const result = await approveFn({ requestId });
    const { uid } = result.data || {};

    // ===== Optimistische UI =====
    rowEl.querySelector("[data-status]").textContent = "approved";
    actionCell.innerHTML = "✓ Goedgekeurd";

    // visuele afronding
    rowEl.classList.add("approved");
    
    setTimeout(() => {
      rowEl.style.transition = "opacity 0.4s ease";
      rowEl.style.opacity = "0";
      setTimeout(() => {
        rowEl.remove();
        // Userlijst verversen na visuele afronding
        loadUsers();
      }, 400);
    }, 900);
    
       
  } catch (err) {
    console.error("Goedkeuren mislukt:", err);

    // herstel UI
    actionCell.innerHTML = originalActions;

    alert(
      "Goedkeuren mislukt: " +
      (err?.message || err?.details || "Onbekende fout")
    );
  } finally {
    rowEl.classList.remove("loading");
  }
}

let USERS_CACHE = {};
let selectedUserId = null;

function getFunctions() {
const app = getFirebaseApp();
  return window._firebase.getFunctions(app);
}

function callFunction(name, data) {
  const fn = window._firebase.httpsCallable(getFunctions(), name);
  return fn(data).then(r => r.data);
}



function updateAccountRequestStatus(requestId, newStatus, rowEl) {
  const app = getFirebaseApp();


  const db = window._firebase.getDatabase(app);
  const ref = window._firebase.ref(db, `accountRequests/${requestId}`);

  window._firebase.update(ref, { status: newStatus }).then(() => {
    // UI direct bijwerken

const statusCell = rowEl.querySelector("[data-status]");
if (statusCell) {
  statusCell.innerHTML = `
    <span class="status-badge status-${newStatus}">
      ${
        newStatus === "approved"
          ? "Goedgekeurd"
          : newStatus === "rejected"
          ? "Afgewezen"
          : "In behandeling"
      }
    </span>
  `;
}

  });
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
    const auth = window._firebase.getAuth();

    const unsubscribe = window._firebase.onAuthStateChanged(auth, async (user) => {
      unsubscribe();

      if (!user) {
        deny();
        return;
      }

      try {
        const token = await user.getIdTokenResult();
        if (!token.claims?.admin) {
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
        ["bevers", "welpen", "scouts", "explorers", "rovers"].includes(f)
      );

      if (speltakFilters.length > 0) {
        const userSpeltakken = u.roles?.speltakken || [];
        const heeftMatch = speltakFilters.some(s =>
          userSpeltakken.includes(s)
        );
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
      <td>${user.naam || user.email || uid}</td>
      <td>
        <span class="status-badge ${isInactive ? "status-inactive" : "status-active"}">
          ${isInactive ? "Gedeactiveerd" : "Actief"}
        </span>
      </td>
    `;

    tr.addEventListener("click", () => openUserPanel(uid));
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
            <span class="status-badge status-${r.status || "pending"}">
              ${
                r.status === "approved"
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
          updateAccountRequestStatus(id, "rejected", tr);
          // Acties weg na afwijzen
          const actionsCell = tr.querySelector("[data-actions]");
          if (actionsCell) actionsCell.innerHTML = "—";
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
  if (u.roles?.speltakken?.length) {
    u.roles.speltakken.forEach(s => {
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

  document
  .querySelectorAll(".edit-speltak")
  .forEach(cb => {
    cb.checked = u.roles?.speltakken?.includes(cb.value) || false;
  });

  panelView.classList.add("hidden");
  panelEdit.classList.remove("hidden");
};

document.getElementById("cancelEditBtn").onclick = () => {
  panelEdit.classList.add("hidden");
  panelView.classList.remove("hidden");
};

document.getElementById("saveUserBtn").onclick = async () => {
  try {
    await callFunction("updateUserRoles", {
      uid: selectedUserId,
      roles: {
        admin: editAdmin.checked,
        bestuur: editBestuur.checked,
        speltakken: Array.from(
          document.querySelectorAll(".edit-speltak:checked")
        ).map(cb => cb.value)
      }
    });

    await callFunction("setUserStatus", {
      uid: selectedUserId,
      status: editInactive.checked ? "inactive" : "active"
    });

    alert("Account bijgewerkt");
    loadUsers();
    panelEdit.classList.add("hidden");
    panelView.classList.remove("hidden");
  } catch (e) {
    alert(e.message || "Opslaan mislukt");
  }
};

document.getElementById("deleteUserBtn").onclick = async () => {
  if (!confirm("Account volledig verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
  try {
    await callFunction("deleteUser", { uid: selectedUserId });
    closeSidePanel();
    loadUsers();
  } catch (e) {
    alert(e.message || "Verwijderen mislukt");
  }
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
