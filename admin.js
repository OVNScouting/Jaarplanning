/* ============================================================
   admin.js — Admin omgeving (fase 1)
   - Alleen admin toegang
   - Read-only gebruikersoverzicht
============================================================ */
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
(function renderUsers() {
  if (typeof USERS === "undefined") {
    console.warn("USERS niet gevonden (login.js)");
    return;
  }

  const SPELTAKKEN = [
    "bevers",
    "welpen",
    "scouts",
    "explorers",
    "rovers",
    "stam"
  ];

  const tbody = document.getElementById("userTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  USERS.forEach((user, index) => {
    const tr = document.createElement("tr");

    const speltakCheckboxes = SPELTAKKEN.map(sp => {
      const checked = user.roles.speltakken?.includes(sp) ? "checked" : "";
      return `
        <label style="display:block;font-size:0.8rem;">
          <input type="checkbox"
                 data-user="${index}"
                 data-speltak="${sp}"
                 ${checked}>
          ${sp}
        </label>
      `;
    }).join("");

    tr.innerHTML = `
      <td>${user.username}</td>

      <td style="text-align:center;">
        <input type="checkbox"
               data-user="${index}"
               data-role="admin"
               ${user.roles.admin ? "checked" : ""}>
      </td>

      <td style="text-align:center;">
        <input type="checkbox"
               data-user="${index}"
               data-role="bestuur"
               ${user.roles.bestuur ? "checked" : ""}>
      </td>

      <td>${speltakCheckboxes}</td>
    `;

    tbody.appendChild(tr);
  });

  bindRoleEvents();
})();

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

USERS[userIndex].roles[role] = e.target.checked;
persistUsers();
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

      USERS[userIndex].roles.speltakken = list;
      persistUsers();
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

