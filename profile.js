// ======================================================================
// profile.js — Profielbeheer (Fase 2)
// ======================================================================

(function () {
    let database = null;
    let currentUser = null;

    // 1. Wacht tot Firebase en de auth status geladen zijn
    document.addEventListener("auth-changed", async (e) => {
        const loggedIn = e.detail.loggedIn;

        if (!loggedIn) {
            // Niet ingelogd? Terug naar de homepage
            window.location.href = "index.html";
            return;
        }

        const session = window.getAuthSession();
        if (!session) return;

        // Initialiseer database connectie
        const app = window._firebase.getApps().length
            ? window._firebase.getApp()
            : window._firebase.initializeApp(window.firebaseConfig);
        database = window._firebase.getDatabase(app);

        // Activeer dwingende popup als het standaardwachtwoord gewijzigd moet worden
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("force_pw_change") === "true") {
            const modal = document.getElementById("pwUpdateModal");
            if (modal) {
                modal.classList.remove("hidden");
                // Extra CSS-injectie om te voorkomen dat ze per ongeluk de achtergrond kunnen misbruiken
                modal.style.display = "flex";
                modal.style.backdropFilter = "blur(5px)";
            }
        }

        // Laad de gegevens van de gebruiker in de pagina
        loadUserProfile(session.id);
    });

    // 2. Gegevens ophalen uit de database en tonen
    async function loadUserProfile(uid) {
        try {
            const userRef = window._firebase.ref(database, `users/${uid}`);
            const snapshot = await window._firebase.get(userRef);

            if (!snapshot.exists()) {
                console.error("Gebruiker niet gevonden in database.");
                const sessionFallback = window.getAuthSession() || {};
                // Val direct terug op sessiegegevens
                document.getElementById("profName").textContent = sessionFallback.name || "Nieuwe Gebruiker";
                document.getElementById("profEmail").textContent = sessionFallback.email || "Geen e-mailadres bekend";

                const rolesContainer = document.getElementById("profRoles");
                rolesContainer.innerHTML = `<span style="color: var(--text-muted); font-style: italic;">Profiel wordt aangemaakt door admin.</span>`;
                return;
            }

            const data = snapshot.val();

            // Vul de naam en het e-mailadres in
            document.getElementById("profName").textContent = data.fullName || "Geen naam ingesteld";
            document.getElementById("profEmail").textContent = data.email || "Geen e-mailadres bekend";

            // Vul de rollen & speltakken in
            const rolesContainer = document.getElementById("profRoles");
            rolesContainer.innerHTML = ""; // leegmaken

            let badgesToToon = [];

            // Check of de gebruiker Admin of Bestuur is
            if (data.roles?.admin) badgesToToon.push({ label: "Admin", class: "admin-badge" });
            if (data.roles?.bestuur) badgesToToon.push({ label: "Bestuur", class: "bestuur-badge" });

            // Lees de speltakken uit de database (dit is een array/lijst zoals ['welpen'])
            const speltakken = data.roles?.speltakken;
            if (Array.isArray(speltakken)) {
                speltakken.forEach(s => {
                    badgesToToon.push({ label: s.charAt(0).toUpperCase() + s.slice(1), class: "speltak-badge" });
                });
            } else if (speltakken && typeof speltakken === "object") {
                // Fallback voor als het als object opgeslagen zou staan { welpen: true }
                Object.keys(speltakken).forEach(s => {
                    if (speltakken[s]) {
                        badgesToToon.push({ label: s.charAt(0).toUpperCase() + s.slice(1), class: "speltak-badge" });
                    }
                });
            }

            // Als er helemaal niks is toegewezen
            if (badgesToToon.length === 0) {
                rolesContainer.innerHTML = `<span style="color: var(--text-muted); font-style: italic;">Geen speltakken of rollen toegewezen.</span>`;
                return;
            }

            // Render de badges naar het scherm
            badgesToToon.forEach(badge => {
                const span = document.createElement("span");
                span.className = `pill-badge ${badge.class || ""}`;
                span.textContent = badge.label;
                // Styling voor de badges direct toepassen zodat we geen CSS hoeven te wijzigen
                span.style.padding = "0.25rem 0.75rem";
                span.style.borderRadius = "20px";
                span.style.fontSize = "0.85rem";
                span.style.fontWeight = "bold";
                span.style.display = "inline-block";

                // Geef speltakken een ander kleurtje dan admin/bestuur
                if (badge.class === "admin-badge" || badge.class === "bestuur-badge") {
                    span.style.background = "#e0f2fe";
                    span.style.color = "#0369a1";
                } else {
                    span.style.background = "#dcfce7";
                    span.style.color = "#15803d";
                }

                rolesContainer.appendChild(span);
            });

        } catch (err) {
            console.error("Fout bij laden profiel:", err);
        }
    }

    // 3. Wachtwoord wijzigen logica
    document.getElementById("btnUpdatePassword").onclick = async () => {
        const newPw = document.getElementById("newPassword").value;
        const confirmPw = document.getElementById("confirmPassword").value;

        if (!newPw || newPw.length < 6) {
            alert("Het wachtwoord moet minimaal 6 tekens lang zijn.");
            return;
        }

        if (newPw !== confirmPw) {
            alert("De wachtwoorden komen niet overeen.");
            return;
        }

        try {
            const app = window._firebase.getApps().length
                ? window._firebase.getApp()
                : window._firebase.initializeApp(window.firebaseConfig);
            const auth = window._firebase.getAuth(app);
            const user = auth.currentUser;

            if (!user) {
                alert("Geen actieve sessie gevonden. Log opnieuw in.");
                return;
            }

            await window._firebase.updatePassword(user, newPw);

            alert("Je wachtwoord is succesvol gewijzigd! 🎉");

            // Verwijder de query parameter uit de URL en verberg de waarschuwing
            document.getElementById("pwWarning").classList.add("hidden");

            // Reset de invoervelden
            document.getElementById("newPassword").value = "";
            document.getElementById("confirmPassword").value = "";

            // Stuur de gebruiker terug naar de homepage
            window.location.href = "index.html";

        } catch (err) {
            console.error("Wachtwoord wijzigen mislukt:", err);

            if (err.code === "auth/requires-recent-login") {
                // Verberg de wachtwoord-modal
                document.getElementById("pwUpdateModal").classList.add("hidden");

                // Toon de gestileerde fout-modal
                const errorModal = document.getElementById("reauthErrorModal");
                if (errorModal) {
                    errorModal.classList.remove("hidden");
                    errorModal.style.display = "flex";
                    errorModal.style.backdropFilter = "blur(5px)";
                }

                // Logica voor de "Opnieuw Inloggen" knop
                document.getElementById("btnReauthLogin").onclick = async () => {
                    try {
                        const auth = window._firebase.getAuth(app);
                        await window._firebase.signOut(auth);
                        window.location.href = "index.html?trigger_login=true";
                    } catch (signoutErr) {
                        window.location.href = "index.html";
                    }
                };
            } else {
                alert("Fout bij wijzigen: " + err.message);
            }
        }
    };
})();
