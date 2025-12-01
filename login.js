// login.js — centraal login systeem voor ALLE pagina's

const LOGIN_PW = "Olivier48Leiding";

const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");

function updateLoginUI() {
    const mode = localStorage.getItem("mode") || "ouder";
    if (mode === "leiding") {
        if (loginButton) loginButton.classList.add("hidden");
        if (logoutButton) logoutButton.classList.remove("hidden");
    } else {
        if (loginButton) loginButton.classList.remove("hidden");
        if (logoutButton) logoutButton.classList.add("hidden");
    }
}

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

if (logoutButton) {
    logoutButton.addEventListener("click", () => {
        localStorage.setItem("mode", "ouder");
        updateLoginUI();
        alert("Je bent uitgelogd.");
        location.reload();
    });
}

updateLoginUI();
