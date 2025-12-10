// ========================================================
// login.js — universeel login systeem voor ALLE pagina’s
// ========================================================

const LOGIN_PW = "Olivier48Leiding";

const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const loginStatus = document.getElementById("loginStatus");

// --------------------------------------------------------
// UI update functie
// --------------------------------------------------------
function updateLoginUI() {
    const mode = localStorage.getItem("mode") || "ouder";

    // Login/Logout knoppen (alleen op index aanwezig)
    if (loginButton) loginButton.classList.toggle("hidden", mode === "leiding");
    if (logoutButton) logoutButton.classList.toggle("hidden", mode !== "leiding");

   // Leiding-badge (op alle pagina's aanwezig)
    if (loginStatus) loginStatus.classList.toggle("hidden", mode !== "leiding");

    // Dashboard- / bestuurskaarten alleen zichtbaar voor leiding (index)
    const dashboardCards = document.querySelectorAll(".speltak-card.dashboard");
    dashboardCards.forEach(card => {
        card.classList.toggle("hidden", mode !== "leiding");
    });
}
}

// --------------------------------------------------------
// Login handler
// --------------------------------------------------------
if (loginButton) {
    loginButton.addEventListener("click", () => {
        const pw = prompt("Voer leiding wachtwoord in:");
        if (pw === LOGIN_PW) {
            localStorage.setItem("mode", "leiding");
            updateLoginUI();
            alert("Je bent ingelogd als leiding.");
            location.reload();
        } else {
            alert("Onjuist wachtwoord.");
        }
    });
}

// --------------------------------------------------------
// Logout handler
// --------------------------------------------------------
if (logoutButton) {
    logoutButton.addEventListener("click", () => {
        localStorage.setItem("mode", "ouder");
        updateLoginUI();
        alert("Je bent uitgelogd.");
        location.reload();
    });
}

// --------------------------------------------------------
// Initial UI update
// --------------------------------------------------------
updateLoginUI();
