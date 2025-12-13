// ========================================================
// LOGIN CONFIG — wachtwoorden + context
// ========================================================

const LOGIN_MAP = {
    "LeidingBevers48": {
        mode: "leiding",
        speltak: "bevers",
        badge: "Je bent ingelogd: Bever Leiding"
    },
    "WelpenLeiding48": {
        mode: "leiding",
        speltak: "welpen",
        badge: "Je bent ingelogd: Welpen Leiding"
    },
    "Scout48Leiding": {
        mode: "leiding",
        speltak: "scouts",
        badge: "Je bent ingelogd: Scouts Leiding"
    },
    "Leiding48Explo": {
        mode: "leiding",
        speltak: "explorers",
        badge: "Je bent ingelogd: Explorer Leiding"
    },
    "Rovers48": {
        mode: "leiding",
        speltak: "rovers",
        badge: "Je bent ingelogd als Rover"
    },
    "OVN48stam": {
        mode: "leiding",
        speltak: "stam",
        badge: "Je bent ingelogd als Stam"
    },
    "Admin48": {
        mode: "admin",
        speltak: null,
        badge: "Je bent ingelogd als Admin"
    }
};



// ========================================================
// login.js — universeel login systeem 
// ========================================================

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
 if (loginStatus) {
    const badge = localStorage.getItem("authBadge");
    loginStatus.textContent = badge || "";
    loginStatus.classList.toggle("hidden", !badge);
}

    // Dashboard- / bestuurskaarten alleen zichtbaar voor leiding (index)
    const dashboardCards = document.querySelectorAll(".speltak-card.dashboard");
    dashboardCards.forEach(card => {
    card.classList.toggle("hidden", mode !== "leiding" && mode !== "admin");
    });
}

// --------------------------------------------------------
// Login handler
// --------------------------------------------------------
if (loginButton) {
    loginButton.addEventListener("click", () => {
        const pw = prompt("Voer wachtwoord in:");
        const auth = LOGIN_MAP[pw];

        if (!auth) {
            alert("Onjuist wachtwoord.");
            return;
        }

        localStorage.setItem("mode", auth.mode);
        localStorage.setItem("authSpeltak", auth.speltak ?? "");
        localStorage.setItem("authBadge", auth.badge);

        updateLoginUI();
        location.reload();
    });
}

// --------------------------------------------------------
// Logout handler
// --------------------------------------------------------
if (logoutButton) {
    logoutButton.addEventListener("click", () => {
        localStorage.removeItem("mode");
        localStorage.removeItem("authSpeltak");
        localStorage.removeItem("authBadge");
        updateLoginUI();
        alert("Je bent uitgelogd.");
        location.reload();
    });
}

// --------------------------------------------------------
// Initial UI update
// --------------------------------------------------------
updateLoginUI();
