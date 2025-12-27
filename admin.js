// ============================================================
// WACHT TOT FIREBASE BESCHIKBAAR IS
// ============================================================
function waitForFirebase(callback, retries = 20) {
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

(function guardAdmin() {
  const session = JSON.parse(localStorage.getItem("ovn_auth_session"));

  if (!session || !session.roles?.admin) {
    document.body.innerHTML =
      "<p style='padding:2rem'>Geen toegang</p>";
    return;
  }

  document.body.classList.remove("hidden");
})();

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

  // Admin / Bestuur toggles
  document.querySelectorAll("input[data-role]").forEach(input => {
    input.addEventListener("change", e => {
      const userIndex = e.target.dataset.user;
      const role = e.target.dataset.role;

   // Voorkom dat laatste admin zichzelf uitschakelt
if (
  role === "admin" &&
  !e.target.checked &&
  USERS.filter(u => u.roles.admin).length === 1
) {
  alert("Er moet minimaal één admin blijven.");
  e.target.checked = true;
  return;
}

const uid = e.target.dataset.uid;

saveRolesToFirebase(uid, {
  ...getCurrentRolesFromRow(uid),
  [role]: e.target.checked
});

    });
  });

  // Speltak toggles
  document.querySelectorAll("input[data-speltak]").forEach(input => {
    input.addEventListener("change", e => {
      const userIndex = e.target.dataset.user;
      const speltak = e.target.dataset.speltak;

      const list = USERS[userIndex].roles.speltakken || [];

      if (e.target.checked && !list.includes(speltak)) {
        list.push(speltak);
      }

      if (!e.target.checked) {
        USERS[userIndex].roles.speltakken =
          list.filter(s => s !== speltak);
      }

      const uid = e.target.dataset.uid;

saveRolesToFirebase(uid, {
  ...getCurrentRolesFromRow(uid),
  speltakken: list
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
          <td>${r.status || "pending"}</td>
          <td style="font-size:0.85rem">${created}</td>
        `;

        tbody.appendChild(tr);
      });
  });
}
waitForFirebase(renderAccountRequests);

waitForFirebase(renderUsers);

