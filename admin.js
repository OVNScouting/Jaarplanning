/* ============================================================
   admin.js — Admin omgeving (fase 1)
   - Alleen admin toegang
   - Read-only gebruikersoverzicht
============================================================ */

/* ===============================
   ADMIN GUARD
=============================== */
(function guardAdmin() {
  const session = JSON.parse(localStorage.getItem("ovn_auth_session"));

  if (!session?.roles?.admin) {
    document.body.innerHTML =
      "<p style='padding:2rem'>Geen toegang</p>";
    return;
  }

  document.body.classList.remove("hidden");
})();

/* ===============================
   USERS RENDER (FASE 1)
=============================== */
(function renderUsers() {
  if (typeof USERS === "undefined") {
    console.warn("USERS niet gevonden (login.js)");
    return;
  }

  const tbody = document.getElementById("userTable");
  if (!tbody) return;

  USERS.forEach(user => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${user.username}</td>
      <td>${user.roles?.admin ? "✔️" : "—"}</td>
      <td>${user.roles?.bestuur ? "✔️" : "—"}</td>
      <td>${(user.roles?.speltakken || []).join(", ")}</td>
    `;

    tbody.appendChild(tr);
  });
})();
