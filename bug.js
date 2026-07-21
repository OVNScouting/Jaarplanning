import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    getDatabase,
    ref,
    onValue,
    update,
    remove
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

if (getApps().length === 0 && window.firebaseConfig) {
    initializeApp(window.firebaseConfig);
}

let db, auth;
let allBugs = [];

document.addEventListener("DOMContentLoaded", () => {
    try {
        auth = getAuth();
        db = getDatabase();

        onAuthStateChanged(auth, (user) => {
            const adminEmails = ["ovnscouting@gmail.com"];

            if (user && adminEmails.includes(user.email)) {
                document.getElementById("adminBugSection")?.classList.remove("hidden");
                laadAdminBugs();
            } else {
                document.getElementById("accessDeniedCard")?.classList.remove("hidden");
            }
        });

        document.getElementById("statusFilter")?.addEventListener("change", () => {
            renderBugs();
        });
    } catch (error) {
        console.error("Fout bij initialiseren van Firebase in bug.js:", error);
    }
});

function laadAdminBugs() {
    const bugsRef = ref(db, "bugs");
    onValue(bugsRef, (snapshot) => {
        const data = snapshot.val();

        if (!data) {
            allBugs = [];
        } else {
            allBugs = Object.keys(data).map(key => ({ id: key, ...data[key] }));

            // Sorteren op status (Nieuw -> In behandeling -> Opgelost) en daarna op datum (nieuwste eerst)
            const statusOrder = { "Nieuw": 1, "In behandeling": 2, "Opgelost": 3 };
            allBugs.sort((a, b) => {
                const orderA = statusOrder[a.status] || 99;
                const orderB = statusOrder[b.status] || 99;
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                return new Date(b.datum) - new Date(a.datum);
            });
        }

        renderBugs();
    });
}

function renderBugs() {
    const tbody = document.getElementById("bugTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const selectedStatus = document.getElementById("statusFilter")?.value || "alle";

    const filteredBugs = allBugs.filter(bug => {
        if (selectedStatus === "alle") return true;
        return bug.status === selectedStatus;
    });

    const badge = document.getElementById("bugCountBadge");
    if (badge) badge.innerText = `${filteredBugs.length} meldingen`;

    if (filteredBugs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: var(--text-muted);">Geen meldingen gevonden voor deze status.</td></tr>`;
        return;
    }

    filteredBugs.forEach(bug => {
        const tr = document.createElement("tr");

        // Subtiele achtergrondkleur op basis van status
        let statusBg = "";
        if (bug.status === "Nieuw") {
            statusBg = "background-color: rgba(239, 68, 68, 0.03);"; // Zeer zacht rood
        } else if (bug.status === "In behandeling") {
            statusBg = "background-color: rgba(245, 158, 11, 0.03);"; // Zeer zacht oranje/geel
        } else if (bug.status === "Opgelost") {
            statusBg = "background-color: rgba(16, 185, 129, 0.03);"; // Zeer zacht groen
        }

        tr.style = `border-bottom: 1px solid var(--border); ${statusBg}`;

        const datumFormatted = new Date(bug.datum).toLocaleString("nl-NL", {
            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
        });

        tr.innerHTML = `
            <td style="padding: 12px; white-space: nowrap; color: var(--text-muted);">${datumFormatted}</td>
            <td style="padding: 12px; font-weight: 500;">${escapeHtml(bug.melder)}</td>
            <td style="padding: 12px;">
                <strong style="display: block; color: var(--text-main);">${escapeHtml(bug.titel)}</strong>
                <span style="color: var(--text-muted); font-size: 13px; display: block; margin-top: 2px;">${escapeHtml(bug.beschrijving)}</span>
                <a href="${bug.pagina}" target="_blank" style="font-size: 11px; color: var(--blue); text-decoration: none; margin-top: 4px; display: inline-block;">Ga naar pagina ↗</a>
            </td>
            <td style="padding: 12px;">
                <select class="status-select" data-id="${bug.id}" style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border); font-size: 13px;">
                    <option value="Nieuw" ${bug.status === 'Nieuw' ? 'selected' : ''}>Nieuw</option>
                    <option value="In behandeling" ${bug.status === 'In behandeling' ? 'selected' : ''}>In behandeling</option>
                    <option value="Opgelost" ${bug.status === 'Opgelost' ? 'selected' : ''}>Opgelost</option>
                </select>
            </td>
            <td style="padding: 12px; text-align: right;">
                <button class="delete-bug-btn" data-id="${bug.id}" style="background: none; border: none; color: #f43e3e; cursor: pointer; font-size: 13px; font-weight: 600;">Verwijderen</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll(".status-select").forEach(select => {
        select.addEventListener("change", (e) => {
            const bugId = e.target.getAttribute("data-id");
            update(ref(db, `bugs/${bugId}`), { status: e.target.value });
        });
    });

    document.querySelectorAll(".delete-bug-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const bugId = e.target.getAttribute("data-id");
            if (confirm("Weet je zeker dat je deze melding wilt verwijderen?")) {
                remove(ref(db, `bugs/${bugId}`));
            }
        });
    });
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}