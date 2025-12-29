async function callSetAdminRole(targetUid, makeAdmin) {
  const app = window._firebase.getApps().length
    ? window._firebase.getApp()
    : window._firebase.initializeApp(window.firebaseConfig);

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
    const app = window._firebase.getApps().length
      ? window._firebase.getApp()
      : window._firebase.initializeApp(window.firebaseConfig);

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

    // 👉 stap 2: user direct toevoegen aan user-tabel
    if (uid && window.addUserToTableFromRequest) {
      window.addUserToTableFromRequest(requestId, uid);
    }
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



function updateAccountRequestStatus(requestId, newStatus, rowEl) {
  const app = window._firebase.getApps().length
    ? window._firebase.getApp()
    : window._firebase.initializeApp(window.firebaseConfig);

  const db = window._firebase.getDatabase(app);
  const ref = window._firebase.ref(db, `accountRequests/${requestId}`);

  window._firebase.update(ref, { status: newStatus }).then(() => {
    // UI direct bijwerken
    const statusCell = rowEl.querySelector("[data-status]");
    if (statusCell) statusCell.textContent = newStatus;

    const actionsCell = rowEl.querySelector("[data-actions]");
    if (actionsCell) actionsCell.innerHTML = "—";
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
/* ============================================================
   admin.js — Admin omgeving (fase 1)
   - Alleen admin toegang
   - Read-only gebruikersoverzicht
============================================================
============================================================ */
function getCurrentRolesFromRow(uid) {
  const roles = {};

  document
    .querySelectorAll(`input[data-uid="${uid}"][data-role]`)
    .forEach(input => {
      roles[input.dataset.role] = input.checked;
    });

  const speltakken = [];
  document
    .querySelectorAll(`input[data-uid="${uid}"][data-speltak]`)
    .forEach(input => {
      if (input.checked) speltakken.push(input.dataset.speltak);
    });

  roles.speltakken = speltakken;

  return roles;
}



function saveRolesToFirebase(targetUid, roles) {
  if (!window._firebase || !targetUid) return;

  try {
    const app = window._firebase.getApps().length
      ? window._firebase.getApp()
      : window._firebase.initializeApp(window.firebaseConfig);

    const db = window._firebase.getDatabase(app);
    const rolesRef = window._firebase.ref(db, `users/${targetUid}/roles`);

    return window._firebase.update(rolesRef, roles);
  } catch (err) {
    console.error("Opslaan rollen mislukt:", err);
  }
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


/* ===============================
   USERS RENDER + EDIT (FASE 1)
=============================== */
function renderUsers() {
  const app = window._firebase.getApps().length
    ? window._firebase.getApp()
    : window._firebase.initializeApp(window.firebaseConfig);

  const db = window._firebase.getDatabase(app);
  const usersRef = window._firebase.ref(db, "users");

  window._firebase.get(usersRef).then(snapshot => {
    if (!snapshot.exists()) return;

    const users = snapshot.val();
    const tbody = document.getElementById("userTable");
    if (!tbody) return;

    tbody.innerHTML = "";

    Object.entries(users).forEach(([uid, user]) => {
      const roles = user.roles || {};
      const speltakken = roles.speltakken || [];

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${user.email || uid}</td>

        <td style="text-align:center;">
          <input type="checkbox"
                 data-uid="${uid}"
                 data-role="admin"
                 ${roles.admin ? "checked" : ""}>
        </td>

        <td style="text-align:center;">
          <input type="checkbox"
                 data-uid="${uid}"
                 data-role="bestuur"
                 ${roles.bestuur ? "checked" : ""}>
        </td>

        <td>
          ${["bevers","welpen","scouts","explorers","rovers","stam"].map(sp => `
            <label style="display:block;font-size:0.8rem;">
              <input type="checkbox"
                     data-uid="${uid}"
                     data-speltak="${sp}"
                     ${speltakken.includes(sp) ? "checked" : ""}>
              ${sp}
            </label>
          `).join("")}
        </td>
      `;

      tbody.appendChild(tr);
    });

    bindRoleEvents();
  });
}


/* ===============================
   ROLE UPDATE HANDLERS
=============================== */

function bindRoleEvents() {
   const session = JSON.parse(localStorage.getItem("ovn_auth_session"));
   if (!session?.roles?.admin) return;

 document.querySelectorAll('input[data-role="admin"]').forEach(input => {
   // Bestuur toggle (direct naar RTDB, geen custom claim nodig)
document.querySelectorAll('input[data-role="bestuur"]').forEach(input => {
  input.addEventListener("change", (e) => {
    const uid = e.target.dataset.uid;
    const checked = e.target.checked;

    saveRolesToFirebase(uid, {
      ...getCurrentRolesFromRow(uid),
      bestuur: checked
    });
  });
});

  input.addEventListener("change", async (e) => {
    const checkbox = e.target;
    const uid = checkbox.dataset.uid;
    const makeAdmin = checkbox.checked;

    const row = checkbox.closest("tr");
    const name =
      row?.querySelector("td")?.textContent || "deze gebruiker";

    // herstelstandaard bij annuleren / fout
    checkbox.checked = !makeAdmin;

    const actionText = makeAdmin
      ? `Admin rechten verlenen aan ${name}`
      : `Admin rechten verwijderen van ${name}`;

    if (!confirm(actionText)) return;

    try {
      await callSetAdminRole(uid, makeAdmin);

      // token vernieuwen voor huidige admin
      const auth = window._firebase.getAuth();
      if (auth.currentUser) {
        await auth.currentUser.getIdToken(true);
      }

      checkbox.checked = makeAdmin;
    } catch (err) {
      alert(err?.message || "Wijzigen admin-rechten mislukt");
    }
  });
});

  // Speltak toggles
document.querySelectorAll("input[data-speltak]").forEach(input => {
  input.addEventListener("change", e => {
    const uid = e.target.dataset.uid;

    // Lees altijd de actuele selectie uit de DOM (bron van waarheid)
    const speltakken = Array.from(
      document.querySelectorAll(`input[data-uid="${uid}"][data-speltak]:checked`)
    ).map(el => el.dataset.speltak);

    saveRolesToFirebase(uid, {
      ...getCurrentRolesFromRow(uid),
      speltakken
    });
  });
});

}

/* ===============================
   LOCAL PERSISTENCE (FASE 1)
=============================== */
function persistUsers() {
  if (typeof saveUsers !== "function") {
    console.error("saveUsers() niet beschikbaar — check script volgorde");
    return;
  }
  saveUsers(USERS);
}

window.addUserToTableFromRequest = function (requestId, uid) {
  if (!window.accountRequests || !window.users) return;

  const req = window.accountRequests.find(r => r.id === requestId);
  if (!req) return;

  const newUser = {
    uid,
    naam: req.naam,
    email: req.email,
    roles: req.requestedRoles || {},
    speltakken: req.speltakken || []
  };

  // voorkom dubbel toevoegen
  if (window.users.some(u => u.uid === uid)) return;

  window.users.push(newUser);

  // her-render user tabel
  if (typeof window.renderUsers === "function") {
    window.renderUsers();
  }
};

/* ============================================================
   ACCOUNT REQUESTS — READ ONLY (FASE C.1)
============================================================ */

function renderAccountRequests() {
  const app = window._firebase.getApps().length
    ? window._firebase.getApp()
    : window._firebase.initializeApp(window.firebaseConfig);

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
          <td>${r.naam || "—"}</td>
          <td>${r.email || "—"}</td>
          <td>${rollen}</td>
          <td>${speltakken}</td>
          <td data-status>${r.status || "pending"}</td>
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
          });
        }



        tbody.appendChild(tr);
      });
  });
}
waitForFirebase(renderAccountRequests);

waitForFirebase(renderUsers);

