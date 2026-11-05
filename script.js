/* ======================================================================
   IMPORTS
   ====================================================================== */
import {
    sanitizeText,
    escapeHtml,
    sanitizeHtml,
    linkifyText,
    todayISO,
    isPast,
    isFutureOrToday,
    compareDateTime,
    formatDateDisplay,
    formatDateRange,
    isoFromInput,
    sortOpkomsten,
    getNextUpcoming,
    isOpkomstVoorbij,
    getSeizoenVanDatum,
    isSeizoenToegestaan,
    isBinnen3Dagen
} from "./utils.js";


import {
    initializeApp,
    getApp,
    getApps,
    getDatabase,
    getAuth,
    ref,
    get,
    set,
    update,
    push
} from "./firebase-imports.js";


/* ======================================================================
   FIREBASE INIT
   ====================================================================== */
const speltak = window.location.pathname
    .split("/")
    .pop()
    .replace(".html", "")
    .toLowerCase();

/* ======================================================================
   AUTH — rollen & rechten (nieuw login-systeem)
   ====================================================================== */

function getSession() {
    // Gebruik de centrale login.js sessie als die bestaat
    if (typeof window.getAuthSession === "function") return window.getAuthSession();
    try {
        return JSON.parse(localStorage.getItem("ovn_auth_session"));
    } catch {
        return null;
    }
}

function isLoggedIn() {
    if (typeof window.isLoggedIn === "function") return window.isLoggedIn();
    return !!getSession();
}

function isAdmin() {
    const s = getSession();
    return !!s?.roles?.admin;
}

function isBestuur() {
    const s = getSession();
    return !!s?.roles?.bestuur;
}

function hasSpeltakRechten() {
    const s = getSession();
    if (!s) return false;
    if (s.roles?.admin) return true;
    if (s.roles?.bestuur) return true;

    const sp = s.roles?.speltakken;

    // Ondersteun BOTH:
    // - array: ["bevers","welpen",...]
    // - object: { bevers: true, welpen: false, ... }
    if (Array.isArray(sp)) return sp.includes(speltak);
    if (sp && typeof sp === "object") return sp[speltak] === true;

    return false;
}

/*
 * Controleren of de huidige gebruiker private gegevens
 * van een specifieke speltak mag wijzigen.
 *
 * Dit is nodig omdat een Roverleider een gedeelde
 * Stamopkomst wel publiek mag invullen, maar niet
 * automatisch schrijfrechten heeft op stam/opkomsten.
 */

function hasSpeltakRechtenVoor(
    targetSpeltak
) {
    const session =
        getSession();


    if (!session) {
        return false;
    }


    if (
        session.roles?.admin ||
        session.roles?.bestuur
    ) {
        return true;
    }


    const speltakken =
        session.roles?.speltakken;


    if (
        Array.isArray(speltakken)
    ) {
        return speltakken.includes(
            targetSpeltak
        );
    }


    if (
        speltakken &&
        typeof speltakken === "object"
    ) {
        return (
            speltakken[targetSpeltak] ===
            true
        );
    }


    return false;
}
const config = window.speltakConfig || { showBert: false, showLeiding: true };

const app = getApps().length ? getApp() : initializeApp(window.firebaseConfig);
const db = getDatabase(app);
const PUBLIC_ROOT = `${speltak}/public`;
const PUBLIC_OPK_FIELDS = new Set([
    "datum",
    "einddatum", // NIEUW
    "starttijd",
    "eindtijd",
    "thema",
    "bijzonderheden",
    "typeOpkomst",
    "buddy",
    "bert_met"
]);

function isPublicOpkomstField(field) {
    return PUBLIC_OPK_FIELDS.has(field);
}


// Standaard start/eindtijden per speltak
const defaultTimes = {
    bevers: { start: "10:30", eind: "12:30" },
    welpen: { start: "14:00", eind: "17:00" },
    scouts: { start: "14:00", eind: "17:00" },
    explorers: { start: "19:30", eind: "22:30" },
    rovers: { start: "19:30", eind: "22:30" },
    stam: { start: "19:30", eind: "22:30" },
};

// fallback als speltak niet voorkomt
const defaultTime = defaultTimes[speltak] || { start: "*", eind: "*" };


/* ======================================================================
   DOM ELEMENTS
   ====================================================================== */
const infoTekst = document.getElementById("infotekst");
const infoEdit = document.getElementById("infotekst_edit");
const infoEditorWrapper = document.getElementById("infoEditorWrapper");
const infoEditButton = document.getElementById("infoEditButton");
const toolbarButtons = document.querySelectorAll("#infoEditorToolbar button");
const colorPicker = document.getElementById("colorPicker");

const loadingIndicator = document.getElementById("loadingIndicator");
const errorIndicator = document.getElementById("errorIndicator");

const headerRowTop = document.getElementById("headerRowTop");
const headerRowBottom = document.getElementById("headerRowBottom");

const tableBody = document.getElementById("tableBody");

const tableWrapper = document.querySelector(".table-wrapper");
let tableHScroll = null;
let tableHInner = null;

const editModeButton = document.getElementById("editModeButton");

const filterAll = document.getElementById("filterAll");
const filterFuture = document.getElementById("filterFuture");
const filterPast = document.getElementById("filterPast");

const openLedenbeheerButton = document.getElementById("openLedenbeheerButton");

const ledenbeheerSection = document.getElementById("ledenbeheerSection");

const jeugdContainer = document.getElementById("jeugdLeden");
const ledenbeheerLeiding = document.getElementById("leidingLeden");
const addMemberButton = document.getElementById("addMemberButton");

const memberModal = document.getElementById("addMemberModal");
const memberType = document.getElementById("memberType");
const memberName = document.getElementById("memberName");
/* ======================================================================
   LEDENMODAL — BEHEERACTIES
====================================================================== */

const memberManagementActions =
    document.getElementById(
        "memberManagementActions"
    );

const toggleMemberVisibilityButton =
    document.getElementById(
        "toggleMemberVisibility"
    );

const toggleMemberVisibilityIcon =
    document.getElementById(
        "toggleMemberVisibilityIcon"
    );

const toggleMemberVisibilityText =
    document.getElementById(
        "toggleMemberVisibilityText"
    );

const deleteMemberFromModalButton =
    document.getElementById(
        "deleteMemberFromModal"
    );


/*
 * Volledige gegevens van het lid dat momenteel
 * in de modal geopend is.
 */

let editingMemberObject = null;

/* ======================================================================
   LEDENBEHEER — DYNAMISCHE ACTIEKEUZE
====================================================================== */

let memberActionChoiceModal = null;
let memberActionChoiceResolver = null;


/*
 * De keuze-modal wordt één keer opgebouwd.
 * Daardoor hoeft dezelfde HTML niet in alle speltakpagina's
 * te worden toegevoegd.
 */

function ensureMemberActionChoiceModal() {
    if (memberActionChoiceModal) {
        return memberActionChoiceModal;
    }


    const modal =
        document.createElement("div");

    modal.id =
        "memberActionChoiceModal";

    modal.className =
        "modal hidden member-action-choice-modal";

    modal.setAttribute(
        "role",
        "dialog"
    );

    modal.setAttribute(
        "aria-modal",
        "true"
    );

    modal.setAttribute(
        "aria-labelledby",
        "memberActionChoiceTitle"
    );


    modal.innerHTML = `
        <div class="modal-content member-action-choice-content">

            <div class="member-action-choice-header">
                <div>
                    <h3 id="memberActionChoiceTitle">
                        Kies een actie
                    </h3>

                    <p id="memberActionChoiceDescription"></p>
                </div>

                <button
                    id="closeMemberActionChoice"
                    class="member-link-modal-close"
                    type="button"
                    aria-label="Venster sluiten"
                >
                    ×
                </button>
            </div>

            <div
                id="memberActionChoiceOptions"
                class="member-action-choice-options"
            ></div>

            <button
                id="cancelMemberActionChoice"
                class="pill-btn outline member-action-choice-cancel"
                type="button"
            >
                Annuleren
            </button>

        </div>
    `;


    document.body.appendChild(
        modal
    );


    memberActionChoiceModal =
        modal;


    const closeButton =
        modal.querySelector(
            "#closeMemberActionChoice"
        );

    const cancelButton =
        modal.querySelector(
            "#cancelMemberActionChoice"
        );


    closeButton?.addEventListener(
        "click",
        closeMemberActionChoice
    );


    cancelButton?.addEventListener(
        "click",
        closeMemberActionChoice
    );


    modal.addEventListener(
        "click",
        event => {
            if (event.target === modal) {
                closeMemberActionChoice();
            }
        }
    );


    return modal;
}


/*
 * Modal sluiten en de wachtende Promise afronden.
 */

function closeMemberActionChoice(result = null) {
    memberActionChoiceModal
        ?.classList
        .add("hidden");


    document.body.classList.remove(
        "member-action-choice-open"
    );


    if (memberActionChoiceResolver) {
        memberActionChoiceResolver(
            result
        );

        memberActionChoiceResolver =
            null;
    }
}


/*
 * Herbruikbare keuze-modal openen.
 *
 * Voorbeeld:
 *
 * const result = await openMemberActionChoice({
 *     title: "Lid verbergen",
 *     description: "Waar wil je dit lid verbergen?",
 *     options: [...]
 * });
 */

function openMemberActionChoice({
    title,
    description = "",
    options = []
}) {
    const modal =
        ensureMemberActionChoiceModal();


    const titleElement =
        modal.querySelector(
            "#memberActionChoiceTitle"
        );

    const descriptionElement =
        modal.querySelector(
            "#memberActionChoiceDescription"
        );

    const optionsContainer =
        modal.querySelector(
            "#memberActionChoiceOptions"
        );


    if (titleElement) {
        titleElement.textContent =
            title;
    }


    if (descriptionElement) {
        descriptionElement.textContent =
            description;

        descriptionElement.classList.toggle(
            "hidden",
            !description
        );
    }


    if (optionsContainer) {
        optionsContainer.innerHTML =
            "";


        options.forEach(option => {
            const button =
                document.createElement("button");

            button.type =
                "button";

            button.className =
                [
                    "member-action-choice-option",
                    option.danger
                        ? "danger"
                        : "",
                    option.primary
                        ? "primary"
                        : ""
                ]
                    .filter(Boolean)
                    .join(" ");


            button.innerHTML = `
                <span class="member-action-choice-option-title">
                    ${escapeHtml(option.title)}
                </span>

                ${
                    option.description
                        ? `
                            <span class="member-action-choice-option-description">
                                ${escapeHtml(option.description)}
                            </span>
                        `
                        : ""
                }
            `;


            button.addEventListener(
                "click",
                () => {
                    closeMemberActionChoice(
                        option.value
                    );
                }
            );


            optionsContainer.appendChild(
                button
            );
        });
    }


    modal.classList.remove(
        "hidden"
    );


    document.body.classList.add(
        "member-action-choice-open"
    );


    return new Promise(resolve => {
        memberActionChoiceResolver =
            resolve;
    });
}


/*
 * Escape sluit ook deze modal.
 */

document.addEventListener(
    "keydown",
    event => {
        if (
            event.key === "Escape" &&
            memberActionChoiceModal &&
            !memberActionChoiceModal.classList.contains(
                "hidden"
            )
        ) {
            closeMemberActionChoice();
        }
    }
);
/* ======================================================================
   LEDENMODAL — HULPFUNCTIES VOOR GEKOPPELDE ACTIES
====================================================================== */

/*
 * Naam van de huidige planning voor zichtbare teksten.
 */

function getCurrentSpeltakLabel() {
    if (speltak === "rovers") {
        return "Rovers";
    }

    if (speltak === "stam") {
        return "Stam";
    }

    return (
        speltak.charAt(0).toUpperCase() +
        speltak.slice(1)
    );
}


/*
 * Bepalen of het geopende lid aan een lid
 * in de andere planning gekoppeld is.
 */

function getLinkedMemberActionContext(
    member,
    type
) {
    if (
        type !== "jeugd" ||
        !member
    ) {
        return null;
    }


    if (
        speltak === "rovers" &&
        member.linkedStamMemberId
    ) {
        return {
            currentSpeltak:
                "rovers",

            currentLabel:
                "Rovers",

            linkedSpeltak:
                "stam",

            linkedLabel:
                "Stam",

            linkedMemberId:
                member.linkedStamMemberId,

            linkedField:
                "linkedRoverMemberId"
        };
    }


    if (
        speltak === "stam" &&
        member.linkedRoverMemberId
    ) {
        return {
            currentSpeltak:
                "stam",

            currentLabel:
                "Stam",

            linkedSpeltak:
                "rovers",

            linkedLabel:
                "Rovers",

            linkedMemberId:
                member.linkedRoverMemberId,

            linkedField:
                "linkedStamMemberId"
        };
    }


    return null;
}


/*
 * Gewone ledenmodal sluiten en volledig resetten.
 */

function closeAndResetMemberModal() {
    memberModal
        ?.classList
        .add("hidden");


    editingMemberId =
        null;

    editingMemberType =
        null;

    editingMemberObject =
        null;


    if (memberType) {
        memberType.disabled =
            false;
    }


    memberManagementActions
        ?.classList
        .add("hidden");
}


/* ======================================================================
   LEDENMODAL — TONEN / VERBERGEN
====================================================================== */

toggleMemberVisibilityButton
    ?.addEventListener(
        "click",
        async () => {
            if (
                !isLeiding() ||
                !editingMemberObject ||
                !editingMemberId ||
                !editingMemberType
            ) {
                return;
            }


            const member =
                editingMemberObject;

            const type =
                editingMemberType;

            const path =
                type === "jeugd"
                    ? "jeugdleden"
                    : "leiding";

            const newHiddenValue =
                !member.hidden;

            const actionWord =
                newHiddenValue
                    ? "verbergen"
                    : "tonen";

            const actionTitle =
                newHiddenValue
                    ? "Lid verbergen"
                    : "Lid tonen";

            const currentLabel =
                getCurrentSpeltakLabel();

            const linkedContext =
                getLinkedMemberActionContext(
                    member,
                    type
                );


            /*
             * Gekoppeld Rover-/Stamlid:
             * kiezen tussen huidige of beide planningen.
             */

            const options =
                linkedContext
                    ? [
                        {
                            value:
                                "current",

                            title:
                                `Alleen bij ${linkedContext.currentLabel} ${actionWord}`,

                            description:
                                `De zichtbaarheid bij ${linkedContext.linkedLabel} blijft ongewijzigd.`,

                            primary:
                                true
                        },

                        {
                            value:
                                "both",

                            title:
                                `Bij ${linkedContext.currentLabel} én ${linkedContext.linkedLabel} ${actionWord}`,

                            description:
                                "De zichtbaarheid wordt in beide planningen gelijk aangepast."
                        }
                    ]
                    : [
                        {
                            value:
                                "current",

                            title:
                                `${member.naam} ${actionWord}`,

                            description:
                                `Dit wijzigt de zichtbaarheid in de planning van ${currentLabel}.`,

                            primary:
                                true
                        }
                    ];


            const choice =
                await openMemberActionChoice({
                    title:
                        actionTitle,

                    description:
                        linkedContext
                            ? `Waar wil je ${member.naam} ${actionWord}?`
                            : `Wil je ${member.naam} ${actionWord}?`,

                    options
                });


            /*
             * Gesloten of geannuleerd.
             */

            if (!choice) {
                return;
            }


            toggleMemberVisibilityButton.disabled =
                true;


            try {
                const updates = {};


                /*
                 * Huidige planning aanpassen.
                 */

                updates[
                    `${speltak}/${path}/${member.id}/hidden`
                ] =
                    newHiddenValue;


                if (type === "jeugd") {
                    updates[
                        `${PUBLIC_ROOT}/jeugdleden/${member.id}/hidden`
                    ] =
                        newHiddenValue;
                }


                /*
                 * Bij keuze 'beide' ook het gekoppelde
                 * Rover- of Stamrecord aanpassen.
                 */

                if (
                    choice === "both" &&
                    linkedContext
                ) {
                    updates[
                        `${linkedContext.linkedSpeltak}/jeugdleden/${linkedContext.linkedMemberId}/hidden`
                    ] =
                        newHiddenValue;

                    updates[
                        `${linkedContext.linkedSpeltak}/public/jeugdleden/${linkedContext.linkedMemberId}/hidden`
                    ] =
                        newHiddenValue;
                }


                /*
                 * Eén atomische update.
                 */

                await update(
                    ref(db),
                    updates
                );


                /*
                 * De geopende modal direct actualiseren.
                 */

                editingMemberObject = {
                    ...member,

                    hidden:
                        newHiddenValue
                };


                updateMemberManagementActions(
                    editingMemberObject
                );


                await loadEverything();

            } catch (error) {
                console.error(
                    "Zichtbaarheid lid wijzigen mislukt:",
                    error
                );


                alert(
                    "De zichtbaarheid kon niet worden gewijzigd."
                );

            } finally {
                toggleMemberVisibilityButton.disabled =
                    false;
            }
        }
    );


/* ======================================================================
   LEDENMODAL — LID VERWIJDEREN
====================================================================== */

deleteMemberFromModalButton
    ?.addEventListener(
        "click",
        async () => {
            if (
                !isLeiding() ||
                !editingMemberObject ||
                !editingMemberId ||
                !editingMemberType
            ) {
                return;
            }


            const member =
                editingMemberObject;

            const type =
                editingMemberType;

            const path =
                type === "jeugd"
                    ? "jeugdleden"
                    : "leiding";

            const currentLabel =
                getCurrentSpeltakLabel();

            const linkedContext =
                getLinkedMemberActionContext(
                    member,
                    type
                );


            /*
             * Gekoppelde leden krijgen twee keuzes.
             */

            const options =
                linkedContext
                    ? [
                        {
                            value:
                                "current",

                            title:
                                `Alleen verwijderen uit ${linkedContext.currentLabel}`,

                            description:
                                `Het lid blijft bestaan bij ${linkedContext.linkedLabel}. De koppeling wordt verwijderd.`,

                            danger:
                                true
                        },

                        {
                            value:
                                "both",

                            title:
                                `Volledig verwijderen uit ${linkedContext.currentLabel} én ${linkedContext.linkedLabel}`,

                            description:
                                "Beide gekoppelde ledenrecords worden definitief verwijderd.",

                            danger:
                                true
                        }
                    ]
                    : [
                        {
                            value:
                                "current",

                            title:
                                `${member.naam} verwijderen`,

                            description:
                                `Het lid wordt definitief verwijderd uit ${currentLabel}.`,

                            danger:
                                true
                        }
                    ];


            const choice =
                await openMemberActionChoice({
                    title:
                        "Lid verwijderen",

                    description:
                        linkedContext
                            ? `Wat wil je met ${member.naam} doen?`
                            : `Weet je zeker dat je ${member.naam} wilt verwijderen?`,

                    options
                });


            /*
             * Gesloten of geannuleerd.
             */

            if (!choice) {
                return;
            }


            deleteMemberFromModalButton.disabled =
                true;


            try {
                const updates = {};


                /*
                 * Huidige record altijd verwijderen.
                 */

                updates[
                    `${speltak}/${path}/${member.id}`
                ] =
                    null;


                if (type === "jeugd") {
                    updates[
                        `${PUBLIC_ROOT}/jeugdleden/${member.id}`
                    ] =
                        null;
                }


                /*
                 * Gekoppeld Rover-/Stamlid.
                 */

                if (linkedContext) {

                    /*
                     * Alleen uit huidige planning verwijderen:
                     * gekoppelde lid blijft bestaan, maar
                     * verwijzing naar het verwijderde record verdwijnt.
                     */

                    if (choice === "current") {
                        updates[
                            `${linkedContext.linkedSpeltak}/jeugdleden/${linkedContext.linkedMemberId}/${linkedContext.linkedField}`
                        ] =
                            null;

                        updates[
                            `${linkedContext.linkedSpeltak}/public/jeugdleden/${linkedContext.linkedMemberId}/${linkedContext.linkedField}`
                        ] =
                            null;
                    }


                    /*
                     * Volledig verwijderen:
                     * ook het gekoppelde private en publieke
                     * ledenrecord verwijderen.
                     */

                    if (choice === "both") {
                        updates[
                            `${linkedContext.linkedSpeltak}/jeugdleden/${linkedContext.linkedMemberId}`
                        ] =
                            null;

                        updates[
                            `${linkedContext.linkedSpeltak}/public/jeugdleden/${linkedContext.linkedMemberId}`
                        ] =
                            null;
                    }
                }


                /*
                 * Alle verwijderingen in één keer uitvoeren.
                 */

                await update(
                    ref(db),
                    updates
                );


                closeAndResetMemberModal();


                await loadEverything();

            } catch (error) {
                console.error(
                    "Lid verwijderen mislukt:",
                    error
                );


                alert(
                    "Het lid kon niet worden verwijderd."
                );

            } finally {
                deleteMemberFromModalButton.disabled =
                    false;
            }
        }
    );
/* ======================================================================
   ROVERS ↔ STAM — LEDENKOPPELING
====================================================================== */

/*
 * Onderdelen in de gewone ledenmodal.
 * Niet elk element bestaat op iedere speltakpagina;
 * daarom worden ze overal veilig met optional chaining gebruikt.
 */

const memberModalTitle =
    document.getElementById("memberModalTitle");

const memberIsRover =
    document.getElementById("memberIsRover");

const stamRoverOption =
    document.getElementById("stamRoverOption");

const roverAutomaticStamNotice =
    document.getElementById("roverAutomaticStamNotice");

const memberLinkStatus =
    document.getElementById("memberLinkStatus");


/*
 * Handmatige koppelmodal.
 */

const openMemberLinkModalButton =
    document.getElementById("openMemberLinkModalButton");

const memberLinkModal =
    document.getElementById("memberLinkModal");

const closeMemberLinkModalButton =
    document.getElementById("closeMemberLinkModal");

const cancelMemberLinkButton =
    document.getElementById("cancelMemberLink");

const saveMemberLinkButton =
    document.getElementById("saveMemberLink");

const memberLinkRoverSelect =
    document.getElementById("memberLinkRoverSelect");

const memberLinkStamSelect =
    document.getElementById("memberLinkStamSelect");

const memberLinkError =
    document.getElementById("memberLinkError");

const memberLinkCurrentInfo =
    document.getElementById("memberLinkCurrentInfo");


/*
 * Lokale kopieën voor de twee selectielijsten.
 */

let availableRoverMembers = [];
let availableStamMembers = [];

const welpenExtraFields = document.getElementById("welpenExtraFields");
const memberWelpenNaam = document.getElementById("memberWelpenNaam");
const memberNest = document.getElementById("memberNest");
const memberNestLeider = document.getElementById("memberNestLeider");

const scoutsExtraFields = document.getElementById("scoutsExtraFields");
const memberPloeg = document.getElementById("memberPloeg");
const memberPL = document.getElementById("memberPL");
const memberAPL = document.getElementById("memberAPL");


// Alleen tonen als speltak welpen is
if (welpenExtraFields) {
    if (speltak !== "welpen") {
        welpenExtraFields.style.display = "none";
    }
}

function toggleWelpenExtraFields() {
    if (!welpenExtraFields) return;

    if (speltak !== "welpen") {
        welpenExtraFields.classList.add("hidden");
        welpenExtraFields.style.display = "none";
        return;
    }

    if (memberType.value === "jeugd") {
        welpenExtraFields.classList.remove("hidden");
        welpenExtraFields.style.display = "block";

        const nestFields = document.getElementById("welpenNestFields");
        if (nestFields) nestFields.style.display = "block";
    } else {
        // Leiding: wel welpennaam, geen nestinfo
        welpenExtraFields.classList.remove("hidden");
        welpenExtraFields.style.display = "block";

        document.getElementById("welpenNestFields").style.display = "none";
    }
}


function toggleScoutsExtraFields() {
    if (!scoutsExtraFields) return;

    // Alleen zichtbaar bij speltak scouts
    if (speltak !== "scouts") {
        scoutsExtraFields.classList.add("hidden");
        scoutsExtraFields.style.display = "none";
        return;
    }

    // Alleen jeugdleden hebben een ploeg + PL/APL
    if (memberType.value === "jeugd") {
        scoutsExtraFields.classList.remove("hidden");
        scoutsExtraFields.style.display = "block";

        // Dropdown altijd opnieuw vullen
        fillScoutsPloegDropdown();

        const heeftPloeg = memberPloeg.value !== "";

        memberPL.disabled = !heeftPloeg;
        memberAPL.disabled = !heeftPloeg;

        if (!heeftPloeg) {
            memberPL.checked = false;
            memberAPL.checked = false;
        }
    } else {
        // Voor leiding alles verbergen en resetten
        scoutsExtraFields.classList.add("hidden");
        scoutsExtraFields.style.display = "";
        memberPloeg.value = "";
        memberPL.checked = false;
        memberAPL.checked = false;
        memberPL.disabled = true;
        memberAPL.disabled = true;
    }
}

/* ======================================================================
   ROVERS ↔ STAM — HULPFUNCTIES
====================================================================== */


/*
 * Alleen Rovers en Stam gebruiken deze uitbreiding.
 */

function supportsRoverStamLinks() {
    return (
        speltak === "rovers" ||
        speltak === "stam"
    );
}


/*
 * Geeft de gekoppelde ID van een lid terug.
 */

function getLinkedMemberId(member, sourceSpeltak = speltak) {
    if (!member) return "";

    if (sourceSpeltak === "rovers") {
        return member.linkedStamMemberId || "";
    }

    if (sourceSpeltak === "stam") {
        return member.linkedRoverMemberId || "";
    }

    return "";
}


/*
 * Naam veilig bepalen.
 */

function getMemberDisplayName(member) {
    return String(
        member?.naam ||
        "Naam onbekend"
    ).trim();
}


/*
 * Een ledenobject uit Firebase omzetten naar een array.
 */

function memberObjectToArray(memberObject) {
    return Object
        .entries(memberObject || {})
        .map(([id, member]) => ({
            id,
            ...member
        }))
        .sort((a, b) =>
            getMemberDisplayName(a)
                .localeCompare(
                    getMemberDisplayName(b),
                    "nl",
                    {
                        sensitivity: "base"
                    }
                )
        );
}


/*
 * Foutmelding in de koppelmodal tonen of verbergen.
 */

function showMemberLinkError(message = "") {
    if (!memberLinkError) return;

    memberLinkError.textContent =
        message;

    memberLinkError.classList.toggle(
        "hidden",
        !message
    );
}


/*
 * Informatievak in de koppelmodal tonen of verbergen.
 */

function showMemberLinkInfo(message = "") {
    if (!memberLinkCurrentInfo) return;

    memberLinkCurrentInfo.textContent =
        message;

    memberLinkCurrentInfo.classList.toggle(
        "hidden",
        !message
    );
}


/*
 * Koppelstatus in de gewone ledenmodal tonen.
 */

function showMemberModalLinkStatus(message = "", status = "neutral") {
    if (!memberLinkStatus) return;

    memberLinkStatus.textContent =
        message;

    memberLinkStatus.dataset.status =
        status;

    memberLinkStatus.classList.toggle(
        "hidden",
        !message
    );
}


/*
 * Verwijdert een bestaande wederzijdse koppeling.
 *
 * De ledenrecords zelf blijven bestaan.
 * Alleen de verwijzingen naar elkaar worden verwijderd.
 */

function addUnlinkUpdates(
    updates,
    sourceSpeltak,
    sourceMemberId,
    linkedMemberId
) {
    if (
        !sourceMemberId ||
        !linkedMemberId
    ) {
        return;
    }


    if (sourceSpeltak === "rovers") {
        addExistingMemberUpdates(
            updates,
            "rovers",
            sourceMemberId,
            {
                linkedStamMemberId:
                    null
            }
        );

        addExistingMemberUpdates(
            updates,
            "stam",
            linkedMemberId,
            {
                linkedRoverMemberId:
                    null
            }
        );

        return;
    }


    if (sourceSpeltak === "stam") {
        addExistingMemberUpdates(
            updates,
            "stam",
            sourceMemberId,
            {
                linkedRoverMemberId:
                    null
            }
        );

        addExistingMemberUpdates(
            updates,
            "rovers",
            linkedMemberId,
            {
                linkedStamMemberId:
                    null
            }
        );
    }
}

/*
 * Alle Rover- en Stamleden ophalen.
 *
 * We lezen hier bewust uit public/jeugdleden:
 * - deze gegevens zijn ook voor de planning beschikbaar;
 * - dit voorkomt dat alleen het openen van de modal al
 *   afhankelijk is van toegang tot de andere private speltak.
 *
 * De daadwerkelijke schrijfrechten regelen we later in
 * de Firebase Rules.
 */

async function loadRoverAndStamMembersForLinking() {
    const [
        roverSnapshot,
        stamSnapshot
    ] = await Promise.all([
        get(
            ref(
                db,
                "rovers/public/jeugdleden"
            )
        ),

        get(
            ref(
                db,
                "stam/public/jeugdleden"
            )
        )
    ]);


    availableRoverMembers =
        memberObjectToArray(
            roverSnapshot.exists()
                ? roverSnapshot.val()
                : {}
        );


    availableStamMembers =
        memberObjectToArray(
            stamSnapshot.exists()
                ? stamSnapshot.val()
                : {}
        );


    return {
        rovers: availableRoverMembers,
        stam: availableStamMembers
    };
}


/*
 * Selectelement opnieuw vullen.
 */

function fillMemberLinkSelect(
    selectElement,
    members,
    placeholder
) {
    if (!selectElement) return;

    selectElement.innerHTML = "";


    const placeholderOption =
        document.createElement("option");

    placeholderOption.value = "";
    placeholderOption.textContent =
        placeholder;

    selectElement.appendChild(
        placeholderOption
    );


    members.forEach(member => {
        const option =
            document.createElement("option");

        option.value =
            member.id;

const sourceSpeltak =
    selectElement === memberLinkRoverSelect
        ? "rovers"
        : "stam";


const linkedId =
    getLinkedMemberId(
        member,
        sourceSpeltak
    );


option.textContent =
    linkedId
        ? `${getMemberDisplayName(member)} — gekoppeld`
        : `${getMemberDisplayName(member)} `;


        selectElement.appendChild(
            option
        );
    });
}


/*
 * Beide selectielijsten vullen.
 */

async function populateMemberLinkSelects() {
    if (
        !memberLinkRoverSelect ||
        !memberLinkStamSelect
    ) {
        return;
    }


    memberLinkRoverSelect.disabled =
        true;

    memberLinkStamSelect.disabled =
        true;


    try {
        const {
            rovers,
            stam
        } =
            await loadRoverAndStamMembersForLinking();


        fillMemberLinkSelect(
            memberLinkRoverSelect,
            rovers,
            rovers.length
                ? "Selecteer een Rover"
                : "Geen Roverleden gevonden"
        );


        fillMemberLinkSelect(
            memberLinkStamSelect,
            stam,
            stam.length
                ? "Selecteer een Stamlid"
                : "Geen Stamleden gevonden"
        );
        showMemberLinkInfo("");

updateMemberLinkSaveButton({
    disabled: true,
    text: "Leden koppelen"
});

    } finally {
        memberLinkRoverSelect.disabled =
            false;

        memberLinkStamSelect.disabled =
            false;
    }
}

/* ======================================================================
   ROVERS ↔ STAM — FIREBASE HULPFUNCTIES
====================================================================== */


/*
 * Basisgegevens voor een nieuw lid.
 */

function createBaseMemberData(
    naam,
    extraData = {}
) {
    return {
        hidden: false,
        volgorde: 999,
        naam,
        ...extraData
    };
}


/*
 * Een jeugdledenrecord tegelijk naar private en public schrijven.
 */

function addMemberUpdates(
    updates,
    targetSpeltak,
    memberId,
    memberData
) {
    updates[
        `${targetSpeltak}/jeugdleden/${memberId}`
    ] = memberData;

    updates[
        `${targetSpeltak}/public/jeugdleden/${memberId}`
    ] = memberData;
}


/*
 * Bestaand lid tegelijk private en public bijwerken.
 */

function addExistingMemberUpdates(
    updates,
    targetSpeltak,
    memberId,
    changes
) {
    Object
        .entries(changes)
        .forEach(([field, value]) => {
            updates[
                `${targetSpeltak}/jeugdleden/${memberId}/${field}`
            ] = value;

            updates[
                `${targetSpeltak}/public/jeugdleden/${memberId}/${field}`
            ] = value;
        });
}


/*
 * Private record ophalen.
 *
 * De public-versie is voldoende om dropdowns te vullen,
 * maar bij het synchroniseren van een naam gebruiken we
 * bij voorkeur het private record.
 */

async function getPrivateMember(
    targetSpeltak,
    memberId
) {
    if (
        !targetSpeltak ||
        !memberId
    ) {
        return null;
    }

    const snapshot =
        await get(
            ref(
                db,
                `${targetSpeltak}/jeugdleden/${memberId}`
            )
        );

    if (!snapshot.exists()) {
        return null;
    }

    return {
        id: memberId,
        ...snapshot.val()
    };
}


/*
 * Gekoppeld lid in de andere speltak bepalen.
 */

async function getLinkedCounterpart(
    sourceSpeltak,
    member
) {
    if (!member) return null;

    if (
        sourceSpeltak === "rovers" &&
        member.linkedStamMemberId
    ) {
        return getPrivateMember(
            "stam",
            member.linkedStamMemberId
        );
    }

    if (
        sourceSpeltak === "stam" &&
        member.linkedRoverMemberId
    ) {
        return getPrivateMember(
            "rovers",
            member.linkedRoverMemberId
        );
    }

    return null;
}

/*
 * Maakt een Rover en een Stamlid aan die direct
 * wederzijds aan elkaar zijn gekoppeld.
 */

async function createLinkedRoverAndStamMembers(
    naam,
    {
        roverExtraData = {},
        stamExtraData = {}
    } = {}
) {
    /*
     * Eerst beide Firebase-IDs genereren.
     * push() schrijft hier nog niets weg.
     */

    const roverRef =
        push(
            ref(
                db,
                "rovers/jeugdleden"
            )
        );

    const stamRef =
        push(
            ref(
                db,
                "stam/jeugdleden"
            )
        );

    const roverId =
        roverRef.key;

    const stamId =
        stamRef.key;

    if (
        !roverId ||
        !stamId
    ) {
        throw new Error(
            "De leden-ID's konden niet worden aangemaakt."
        );
    }


    const roverData =
        createBaseMemberData(
            naam,
            {
                ...roverExtraData,

                linkedStamMemberId:
                    stamId
            }
        );


    const stamData =
        createBaseMemberData(
            naam,
            {
                ...stamExtraData,

                linkedRoverMemberId:
                    roverId
            }
        );


    const updates = {};

    addMemberUpdates(
        updates,
        "rovers",
        roverId,
        roverData
    );

    addMemberUpdates(
        updates,
        "stam",
        stamId,
        stamData
    );


    /*
     * Eén atomische update:
     * óf alle vier records worden opgeslagen,
     * óf geen van de vier.
     */

    await update(
        ref(db),
        updates
    );


    return {
        roverId,
        stamId,
        roverData,
        stamData
    };
}
/*
 * Maakt voor een bestaand, nog niet gekoppeld Stamlid
 * een nieuw Roverrecord aan.
 */

async function createRoverForExistingStamMember(
    stamMemberId,
    naam
) {
    if (!stamMemberId) {
        throw new Error(
            "Het bestaande Stamlid heeft geen geldige ID."
        );
    }


    const existingStamMember =
        await getPrivateMember(
            "stam",
            stamMemberId
        );


    if (!existingStamMember) {
        throw new Error(
            "Het Stamlid kon niet worden gevonden."
        );
    }


    if (
        existingStamMember
            .linkedRoverMemberId
    ) {
        return {
            roverId:
                existingStamMember
                    .linkedRoverMemberId,

            alreadyLinked: true
        };
    }


    const roverRef =
        push(
            ref(
                db,
                "rovers/jeugdleden"
            )
        );

    const roverId =
        roverRef.key;


    if (!roverId) {
        throw new Error(
            "Er kon geen Rover-ID worden aangemaakt."
        );
    }


    const roverData =
        createBaseMemberData(
            naam,
            {
                linkedStamMemberId:
                    stamMemberId
            }
        );


    const updates = {};

    addMemberUpdates(
        updates,
        "rovers",
        roverId,
        roverData
    );


    addExistingMemberUpdates(
        updates,
        "stam",
        stamMemberId,
        {
            naam,

            linkedRoverMemberId:
                roverId
        }
    );


    await update(
        ref(db),
        updates
    );


    return {
        roverId,
        alreadyLinked: false
    };
}
/*
 * Wanneer de naam van een gekoppeld Rover- of Stamlid
 * wordt aangepast, krijgt het gekoppelde record
 * automatisch dezelfde naam.
 */

async function syncLinkedMemberName(
    sourceSpeltak,
    sourceMember,
    newName
) {
    if (
        !sourceMember ||
        !newName
    ) {
        return;
    }


    const linkedId =
        getLinkedMemberId(
            sourceMember,
            sourceSpeltak
        );


    if (!linkedId) {
        return;
    }


    const targetSpeltak =
        sourceSpeltak === "rovers"
            ? "stam"
            : "rovers";


    const updates = {};

    addExistingMemberUpdates(
        updates,
        targetSpeltak,
        linkedId,
        {
            naam: newName
        }
    );


    await update(
        ref(db),
        updates
    );
}


/* ======================================================================
   ROVERS ↔ STAM — KOPPELMODAL OPENEN EN SLUITEN
====================================================================== */

async function openMemberLinkModal() {
    if (!supportsRoverStamLinks()) {
        return;
    }


    if (!isLeiding()) {
        alert(
            "Alleen leiding kan leden koppelen."
        );

        return;
    }


    if (!memberLinkModal) {
        return;
    }


    showMemberLinkError("");
    showMemberLinkInfo("");


    if (memberLinkRoverSelect) {
        memberLinkRoverSelect.innerHTML = `
            <option value="">
                Roverleden laden…
            </option>
        `;

        memberLinkRoverSelect.disabled =
            true;
    }


    if (memberLinkStamSelect) {
        memberLinkStamSelect.innerHTML = `
            <option value="">
                Stamleden laden…
            </option>
        `;

        memberLinkStamSelect.disabled =
            true;
    }


  updateMemberLinkSaveButton({
    disabled: true,
    text: "Leden koppelen"
});


    memberLinkModal.classList.remove(
        "hidden"
    );


    try {
        await populateMemberLinkSelects();

        updateMemberLinkSaveButton({
    disabled: true,
    text: "Leden koppelen"
});

    } catch (error) {
        console.error(
            "Rover- en Stamleden laden mislukt:",
            error
        );


        showMemberLinkError(
            "De ledenlijsten konden niet worden geladen."
        );
    }
}


function closeMemberLinkModal() {
    memberLinkModal
        ?.classList
        .add("hidden");


    showMemberLinkError("");
    showMemberLinkInfo("");


    if (memberLinkRoverSelect) {
        memberLinkRoverSelect.value = "";
    }


    if (memberLinkStamSelect) {
        memberLinkStamSelect.value = "";
    }
updateMemberLinkSaveButton({
    disabled: true,
    text: "Leden koppelen"
});

}


openMemberLinkModalButton
    ?.addEventListener(
        "click",
        openMemberLinkModal
    );


closeMemberLinkModalButton
    ?.addEventListener(
        "click",
        closeMemberLinkModal
    );


cancelMemberLinkButton
    ?.addEventListener(
        "click",
        closeMemberLinkModal
    );


memberLinkModal?.addEventListener(
    "click",
    event => {
        if (
            event.target ===
            memberLinkModal
        ) {
            closeMemberLinkModal();
        }
    }
);
/* ======================================================================
   KOPPELMODAL — SELECTIE-INFORMATIE
====================================================================== */
/* ======================================================================
   KOPPELMODAL — OPSLAANKNOP BIJWERKEN
====================================================================== */

function updateMemberLinkSaveButton({
    disabled = false,
    text = "Leden koppelen"
} = {}) {
    if (!saveMemberLinkButton) {
        return;
    }

    saveMemberLinkButton.disabled =
        disabled;

    saveMemberLinkButton.textContent =
        text;
}
function updateSelectedMemberLinkInfo() {
    if (
        !memberLinkRoverSelect ||
        !memberLinkStamSelect
    ) {
        return;
    }


    const roverId =
        memberLinkRoverSelect.value;

    const stamId =
        memberLinkStamSelect.value;


    const rover =
        availableRoverMembers.find(
            member =>
                member.id === roverId
        );

    const stam =
        availableStamMembers.find(
            member =>
                member.id === stamId
        );


    showMemberLinkError("");


    /*
     * Standaardtoestand.
     */

    updateMemberLinkSaveButton({
        disabled:
            !roverId ||
            !stamId,

        text:
            "Leden koppelen"
    });


    /*
     * Niets geselecteerd.
     */

    if (
        !roverId &&
        !stamId
    ) {
        showMemberLinkInfo("");

        return;
    }


    /*
     * Alleen een Rover geselecteerd.
     */

    if (
        rover &&
        !stam
    ) {
        if (
            rover.linkedStamMemberId
        ) {
            const linkedStam =
                availableStamMembers.find(
                    member =>
                        member.id ===
                        rover.linkedStamMemberId
                );


            showMemberLinkInfo(
                linkedStam
                    ? `Gekoppeld aan ${getMemberDisplayName(linkedStam)} in Stam.`
                    : "De bestaande Stamkoppeling kon niet worden gevonden."
            );

        } else {
            showMemberLinkInfo(
                "Dit Roverlid is nog niet gekoppeld."
            );
        }

        return;
    }


    /*
     * Alleen een Stamlid geselecteerd.
     */

    if (
        !rover &&
        stam
    ) {
        if (
            stam.linkedRoverMemberId
        ) {
            const linkedRover =
                availableRoverMembers.find(
                    member =>
                        member.id ===
                        stam.linkedRoverMemberId
                );


            showMemberLinkInfo(
                linkedRover
                    ? `Gekoppeld aan ${getMemberDisplayName(linkedRover)} bij Rovers.`
                    : "De bestaande Roverkoppeling kon niet worden gevonden."
            );

        } else {
            showMemberLinkInfo(
                "Dit Stamlid is nog niet gekoppeld."
            );
        }

        return;
    }


    /*
     * Beide leden geselecteerd.
     */

    if (
        !rover ||
        !stam
    ) {
        showMemberLinkInfo("");

        return;
    }


    const alreadyLinkedTogether =
        rover.linkedStamMemberId === stam.id &&
        stam.linkedRoverMemberId === rover.id;


    /*
     * Exact deze combinatie bestaat al.
     */

    if (alreadyLinkedTogether) {
        showMemberLinkInfo(
            "Deze leden zijn al aan elkaar gekoppeld."
        );


        updateMemberLinkSaveButton({
            disabled: true,
            text: "Al gekoppeld"
        });

        return;
    }


    const roverHasOtherLink =
        rover.linkedStamMemberId &&
        rover.linkedStamMemberId !== stam.id;


    const stamHasOtherLink =
        stam.linkedRoverMemberId &&
        stam.linkedRoverMemberId !== rover.id;


    /*
     * Minimaal één van de twee heeft al een
     * andere koppeling.
     */

    if (
        roverHasOtherLink ||
        stamHasOtherLink
    ) {
        showMemberLinkInfo(
            "Let op: de bestaande koppeling wordt vervangen."
        );


        updateMemberLinkSaveButton({
            disabled: false,
            text: "Koppeling vervangen"
        });

        return;
    }


    /*
     * Normale nieuwe koppeling.
     */

    showMemberLinkInfo(
        `${getMemberDisplayName(rover)} wordt gekoppeld aan ${getMemberDisplayName(stam)}.`
    );


    updateMemberLinkSaveButton({
        disabled: false,
        text: "Leden koppelen"
    });
}

/* ======================================================================
   ROVERS ↔ STAM — BESTAANDE LEDEN KOPPELEN
====================================================================== */

async function saveSelectedMemberLink() {
    if (!isLeiding()) {
        showMemberLinkError(
            "Alleen leiding kan leden koppelen."
        );

        return;
    }


    const roverId =
        memberLinkRoverSelect
            ?.value || "";

    const stamId =
        memberLinkStamSelect
            ?.value || "";


    if (
        !roverId ||
        !stamId
    ) {
        showMemberLinkError(
            "Selecteer zowel een Roverlid als een Stamlid."
        );

        return;
    }


    const rover =
        availableRoverMembers.find(
            member =>
                member.id === roverId
        );

    const stam =
        availableStamMembers.find(
            member =>
                member.id === stamId
        );


    if (
        !rover ||
        !stam
    ) {
        showMemberLinkError(
            "Een van de geselecteerde leden kon niet worden gevonden."
        );

        return;
    }


    const alreadyLinkedTogether =
        rover.linkedStamMemberId === stamId &&
        stam.linkedRoverMemberId === roverId;


    if (alreadyLinkedTogether) {
        showMemberLinkInfo(
            `${rover.naam} en ${stam.naam} zijn al aan elkaar gekoppeld.`
        );

        return;
    }


    const roverHasOtherLink =
        rover.linkedStamMemberId &&
        rover.linkedStamMemberId !== stamId;

    const stamHasOtherLink =
        stam.linkedRoverMemberId &&
        stam.linkedRoverMemberId !== roverId;


    if (
        roverHasOtherLink ||
        stamHasOtherLink
    ) {
        const confirmed =
            confirm(
                "Minimaal één geselecteerd lid is al aan iemand anders gekoppeld. " +
                "De oude koppeling wordt verwijderd en vervangen. Doorgaan?"
            );


        if (!confirmed) {
            return;
        }
    }


    showMemberLinkError("");


   updateMemberLinkSaveButton({
    disabled: true,
    text: "Koppelen…"
});


    try {
        const updates = {};


        /*
         * Oude Roverkoppeling losmaken.
         */

        if (
            rover.linkedStamMemberId &&
            rover.linkedStamMemberId !== stamId
        ) {
            addUnlinkUpdates(
                updates,
                "rovers",
                roverId,
                rover.linkedStamMemberId
            );
        }


        /*
         * Oude Stamkoppeling losmaken.
         */

        if (
            stam.linkedRoverMemberId &&
            stam.linkedRoverMemberId !== roverId
        ) {
            addUnlinkUpdates(
                updates,
                "stam",
                stamId,
                stam.linkedRoverMemberId
            );
        }


        /*
         * Nieuwe wederzijdse koppeling vastleggen.
         */

        addExistingMemberUpdates(
            updates,
            "rovers",
            roverId,
            {
                linkedStamMemberId:
                    stamId
            }
        );


        addExistingMemberUpdates(
            updates,
            "stam",
            stamId,
            {
                linkedRoverMemberId:
                    roverId
            }
        );


        /*
         * Namen gelijkmaken.
         *
         * We gebruiken de naam van het Roverlid als leidend,
         * omdat Rover automatisch ook Stam is.
         */

        addExistingMemberUpdates(
            updates,
            "stam",
            stamId,
            {
                naam:
                    getMemberDisplayName(
                        rover
                    )
            }
        );


        await update(
            ref(db),
            updates
        );


        showMemberLinkInfo(
            `${getMemberDisplayName(rover)} is gekoppeld aan het Stamlid.`
        );


        await loadRoverAndStamMembersForLinking();

        await populateMemberLinkSelects();

        await loadEverything();


        /*
         * Modal na een korte succesvolle bevestiging sluiten.
         */

        window.setTimeout(
            closeMemberLinkModal,
            650
        );

    } catch (error) {
        console.error(
            "Leden koppelen mislukt:",
            error
        );


        showMemberLinkError(
            error?.message ||
            "De leden konden niet worden gekoppeld."
        );

    } finally {
       /*
 * Alleen resetten wanneer de modal nog open is.
 * Bij succes wordt hij kort daarna gesloten.
 */

if (
    memberLinkModal &&
    !memberLinkModal.classList.contains(
        "hidden"
    )
) {
    updateSelectedMemberLinkInfo();
}
    }
}

saveMemberLinkButton
    ?.addEventListener(
        "click",
        saveSelectedMemberLink
    );


memberLinkRoverSelect
    ?.addEventListener(
        "change",
        updateSelectedMemberLinkInfo
    );


memberLinkStamSelect
    ?.addEventListener(
        "change",
        updateSelectedMemberLinkInfo
    );
// PL/APL wederzijds exclusief
memberPL?.addEventListener("change", () => {
    if (memberPL.checked) memberAPL.checked = false;
});

memberAPL?.addEventListener("change", () => {
    if (memberAPL.checked) memberPL.checked = false;
});

memberPloeg?.addEventListener("change", () => {
    const heeftPloeg = memberPloeg.value !== "";

    if (!heeftPloeg) {
        memberPL.checked = false;
        memberAPL.checked = false;
    }

    memberPL.disabled = !heeftPloeg;
    memberAPL.disabled = !heeftPloeg;
});

// Scouts ploegopties dynamisch vullen
const SCOUTS_OPTIES = [
    { value: "", label: "Geen ploeg" },
    { value: "meeuw", label: "Meeuwen" },
    { value: "reiger", label: "Reigers" },
    { value: "kievit", label: "Kieviten" },
    { value: "sperwer", label: "Sperwers" }
];

function fillScoutsPloegDropdown() {
    if (!memberPloeg) return;

    memberPloeg.innerHTML = ""; // leegmaken

    SCOUTS_OPTIES.forEach(opt => {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        memberPloeg.appendChild(o);
    });
}

// Type-wissel: juiste extra velden tonen
memberType?.addEventListener("change", () => {
    toggleWelpenExtraFields();
    toggleScoutsExtraFields();
});

function resetOpkomstFields() {
    // 1. Haal de datum van vandaag op in lokaal formaat (YYYY-MM-DD)
    const vandaag = new Date();
    const jaar = vandaag.getFullYear();
    const maand = String(vandaag.getMonth() + 1).padStart(2, '0');
    const dag = String(vandaag.getDate()).padStart(2, '0');

    // 2. Stel de standaardwaarde van het datumveld in op vandaag
    opDatum.value = `${jaar}-${maand}-${dag}`;

    if (opEindDatum) opEindDatum.value = ""; // NIEUW
    if (opEindDatumWrapper) opEindDatumWrapper.classList.add("hidden"); // NIEUW

    opStart.value = defaultTime.start;
    opEind.value = defaultTime.eind;
    opThema.value = "";
    opProcor.value = "";
    if (opBuddy) opBuddy.value = "";
    opLocatie.value = "";
    opType.value = "normaal";
    opMateriaal.value = "";
    opBijzonderheden.value = "";
    if (opNotities) { opNotities.value = ""; }
    opKijkers.value = "0";
    opExtraAantal.value = "0";
    opExtraNamen.value = "";
    if (opBert) opBert.value = "";
}


const saveMember = document.getElementById("saveMember");
const cancelMember = document.getElementById("cancelMember");

const opModal = document.getElementById("opkomstModal");
const deleteOpkomstModal = document.getElementById("deleteOpkomstModal");
const deleteOpkomstText = document.getElementById("deleteOpkomstText");
const confirmDeleteOpkomst = document.getElementById("confirmDeleteOpkomst");
const cancelDeleteOpkomst = document.getElementById("cancelDeleteOpkomst");
const opModalTitle = document.getElementById("opModalTitle");
const opDatum = document.getElementById("opDatum");
const opEindDatum = document.getElementById("opEindDatum"); // NIEUW
const opEindDatumWrapper = document.getElementById("opEindDatumWrapper"); // NIEUW
const opStart = document.getElementById("opStart");
const opEind = document.getElementById("opEind");
const opProcor = document.getElementById("opProcor");
const opBuddy = document.getElementById("opBuddy");
const opThema = document.getElementById("opThema");
const opLocatie = document.getElementById("opLocatie");
const opType = document.getElementById("opType");
const opMateriaal = document.getElementById("opMateriaal");

const opBijzonderheden =
    document.getElementById("opBijzonderheden");

const opNotities =
    document.getElementById("opNotities");

const opKijkers =
    document.getElementById("opKijkers");
const opExtraAantal = document.getElementById("opExtraAantal");
const opExtraNamen = document.getElementById("opExtraNamen");
const opBert = document.getElementById("opBert");

const saveOpkomst = document.getElementById("saveOpkomst");
const cancelOpkomst = document.getElementById("cancelOpkomst");
const closeButtons = document.querySelectorAll(".close-section");
const fab = document.getElementById("fabAddOpkomst");
const logoutButton = document.getElementById("logoutButton");

opType?.addEventListener("change", () => {
    const isKamp = opType.value === "kamp";

    opEindDatumWrapper?.classList.toggle(
        "hidden",
        !isKamp
    );

    if (!opEindDatum) return;

    if (isKamp) {
        /*
         * De einddatum mag niet vóór de
         * begindatum liggen.
         */
        opEindDatum.min = opDatum?.value || "";

        /*
         * Alleen automatisch invullen wanneer
         * de einddatum nog leeg is.
         *
         * Daardoor opent de datumkiezer direct
         * bij de gekozen begindatum.
         */
        if (!opEindDatum.value && opDatum?.value) {
            opEindDatum.value = opDatum.value;
        }
    } else {
        opEindDatum.value = "";
        opEindDatum.removeAttribute("min");
    }
});

opDatum?.addEventListener("change", () => {
    if (
        opType?.value !== "kamp" ||
        !opEindDatum
    ) {
        return;
    }

    const nieuweBegindatum = opDatum.value;

    /*
     * De einddatum kan nooit vóór
     * de begindatum worden gekozen.
     */
    opEindDatum.min = nieuweBegindatum;

    /*
     * Corrigeer de einddatum wanneer:
     * - hij nog leeg is;
     * - of hij vóór de nieuwe begindatum ligt.
     */
    if (
        nieuweBegindatum &&
        (
            !opEindDatum.value ||
            opEindDatum.value < nieuweBegindatum
        )
    ) {
        opEindDatum.value = nieuweBegindatum;
    }
});

// Globale variabelen voor status
let bestuurData = [];
let actiefFilter = 'all'; // 'all', 'future', 'past'

/**
 * Initialiseer de knoppen/chips voor het filteren
 */
function initBestuurControls() {
    const filterAll = document.getElementById('filterAll');
    const filterFuture = document.getElementById('filterFuture');
    const filterPast = document.getElementById('filterPast');

    if (filterAll && filterFuture && filterPast) {
        filterAll.addEventListener('click', () => setFilter('all', filterAll));
        filterFuture.addEventListener('click', () => setFilter('future', filterFuture));
        filterPast.addEventListener('click', () => setFilter('past', filterPast));
    }
}

/**
 * Wissel van actief filter (Alles / Komend / Verleden)
 */
function setFilter(filterType, clickedChip) {
    actiefFilter = filterType;

    // Update actieve status op de filter-chips
    document.querySelectorAll('.planning-controls .chip').forEach(chip => {
        chip.classList.remove('active');
    });
    clickedChip.classList.add('active');

    // Herteken de tabel met het actieve filter
    renderBestuurTabel(bestuurData);
}

/**
 * Render de bestuursagenda in de tabel
 * @param {Array} data - Array met bestuursobjecten uit Firebase/databron
 */
function renderBestuurTabel(data) {
    bestuurData = data || [];
    const tbody = document.getElementById('bestuurTabelBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    // 1. Sortering: Chronologisch op datum en tijd (m.b.v. compareDateTime uit utils.js)
    const gesorteerd = [...bestuurData].sort((a, b) =>
        compareDateTime(a.datum, a.tijd, b.datum, b.tijd)
    );

    // 2. Filteren op basis van gekozen chip
    const gefilterd = gesorteerd.filter(item => {
        const past = isPast(item.datum);
        if (actiefFilter === 'future') return !past;
        if (actiefFilter === 'past') return past;
        return true; // 'all'
    });

    if (gefilterd.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #666; padding: 20px;">Geen bestuursitems gevonden.</td></tr>`;
        return;
    }

    // 3. Eerstvolgende item detecteren (het eerste item dat géén verleden is)
    let eerstvolgendeGevonden = false;

    gefilterd.forEach(item => {
        const tr = document.createElement('tr');
        const past = isPast(item.datum);
        const rawType = (item.type || 'overig').toLowerCase().trim();

        // Bepaal de rij-kleurklasse
        if (past) {
            tr.classList.add('row-verleden');
        } else if (!eerstvolgendeGevonden) {
            tr.classList.add('row-eerstvolgende');
            eerstvolgendeGevonden = true;
        } else {
            // Koppelt direct aan rijklassen zoals .row-groepsraad, .row-bestuursvergadering, .row-activiteit
            tr.classList.add(`row-${rawType.replace(/\s+/g, '')}`);
        }

        // HTML voor de 6 gespecificeerde kolommen
        tr.innerHTML = `
      <td>${formatDateDisplay(item.datum)}</td>
      <td>${sanitizeText(item.tijd || '—')}</td>
      <td><strong>${sanitizeText(item.titel || '—')}</strong></td>
      <td>${sanitizeText(item.type || 'Overig')}</td>
      <td>${sanitizeText(item.locatie || '—')}</td>
      <td>${sanitizeText(item.beschrijving || item.bijzonderheden || '—')}</td>
    `;

        tbody.appendChild(tr);
    });
}

// Initialiseer de controls zodra de pagina geladen is
document.addEventListener('DOMContentLoaded', () => {
    initBestuurControls();
});

/* ======================================================================
   HORIZONTALE SCROLLBALK – zwevend
   ====================================================================== */
function initHorizontalScrollProxy() {
    if (!tableWrapper || tableHScroll) return;

    // Maak de zwevende scrollbalk
    tableHScroll = document.createElement("div");
    tableHScroll.className = "table-h-scroll";

    tableHInner = document.createElement("div");
    tableHInner.className = "table-h-inner";
    tableHScroll.appendChild(tableHInner);

    // Voeg hem toe aan de body (zwevend boven alles)
    document.body.appendChild(tableHScroll);

    // Scroll-sync beide kanten op
    tableHScroll.addEventListener("scroll", () => {
        if (!tableWrapper) return;
        tableWrapper.scrollLeft = tableHScroll.scrollLeft;
    });

    tableWrapper.addEventListener("scroll", () => {
        if (!tableHScroll) return;
        tableHScroll.scrollLeft = tableWrapper.scrollLeft;
    });

    // Reageren op scroll en resize om positie bij te werken
    window.addEventListener("scroll", updateHorizontalScrollPosition);
    window.addEventListener("resize", () => {
        syncHorizontalScrollProxy();
    });
}

function syncHorizontalScrollProxy() {
    if (!tableWrapper || !tableHInner) return;
    // Breedte van de inhoud = breedte van de tabel (voor horizontale scroll)
    tableHInner.style.width = tableWrapper.scrollWidth + "px";
    updateHorizontalScrollPosition();
}

function updateHorizontalScrollPosition() {
    if (!tableWrapper || !tableHScroll) return;

    const rect = tableWrapper.getBoundingClientRect();

    // Check of horizontale scrollbar nodig is
    const hasOverflow = tableWrapper.scrollWidth > tableWrapper.clientWidth + 1;
    if (!hasOverflow) {
        tableHScroll.style.display = "none";
        return;
    }

    // Altijd tonen zodra er overflow is
    tableHScroll.style.display = "block";

    // Scrollbar even breed als de tabel
    tableHScroll.style.left = rect.left + "px";
    tableHScroll.style.width = rect.width + "px";


}


// Direct bij load de proxy aanmaken
initHorizontalScrollProxy();

/* ======================================================================
   STATE
   ====================================================================== */
let data = {};

// Mobiele kaartjesweergave (hier bovenaan gedeclareerd: setMode() rendert
// al tijdens het laden van de module, vóór de functies verderop).
const MOBILE_VIEW_KEY = "ovn_mobile_view";
const expandedCards = new Set();
const PRESENCE_LABELS = {
    aanwezig: { icon: "✓", label: "Aanwezig" },
    afwezig: { icon: "✗", label: "Afwezig" },
    onbekend: { icon: "?", label: "Onbekend" }
};
let opkomsten = [];
let jeugd = [];
let leiding = [];
let sharedStamMembers = [];
let nextUpcomingId = null;
let infoEditActive = false;
let editingMemberId = null;
let editingMemberType = null;

let editMode = false;

// Houdt bij of de opkomstmodal een nieuwe of bestaande opkomst bevat
let editingOpkomstId = null;

// --- NIEUW: SEIZOEN FILTER ---
let currentSeizoenFilter = getSeizoenVanDatum(todayISO());
// -----------------------------
// ===============================
// UNDO BUFFER — OPKOMSTEN
// ===============================
let pendingDeleteOpkomst = null; // { id, data, timeout }
let opkomstToDelete = null;
/* ======================================================================
   MODE FUNCTIONS
   ====================================================================== */
function isOuder() {
    return !isLoggedIn() || !hasSpeltakRechten();
}

function isLeiding() {
    return isLoggedIn() && hasSpeltakRechten();
}

// ----------------------------------------------------------------------
// MODE STATE
// ----------------------------------------------------------------------
let mode = isLeiding() ? "leiding" : "ouder";

// Edit-modus is nu een aparte vlag, en alleen geldig als je leiding bent
function isEdit() {
    return editMode && isLeiding();
}

let currentFilter = "all";

// Initiele mode + data
setMode(isLeiding() ? "leiding" : "ouder");
loadEverything();

// ==========================================
// AUTH CHANGE LISTENER (LOGIN / LOGOUT)
// ==========================================
document.addEventListener("auth-changed", async () => {
    const newMode = isLeiding() ? "leiding" : "ouder";

    // Edit-mode altijd uit bij auth switch
    editMode = false;

    setMode(newMode);

    // Volledig opnieuw laden zodat tabel, headers,
    // kolommen en rechten kloppen
    await loadEverything();
});

function setMode(newMode) {
    // Validatie
    if (newMode !== "ouder" && newMode !== "leiding") {
        newMode = "ouder";
    }

    // Basis-modus opslaan
    mode = newMode;
    // NIET opslaan in localStorage — mode is page-local

    // ALTIJD eerst compleet resetten
    document.body.classList.remove("mode-ouder", "mode-leiding", "mode-bewerken");

    // Basis-modus toevoegen
    document.body.classList.add(`mode-${mode}`);

    // Bewerken-modus toevoegen ALS leiding + editMode true
    if (mode === "leiding" && editMode) {
        document.body.classList.add("mode-bewerken");
    }

    applyModeVisibility();
    renderTable();
}

function applyModeVisibility() {
    // Bepaal of de huidige gebruiker een 'ouder' is (geen leiding)
    const isOuderCheck = isOuder();

    // Leiding-only elementen verbergen voor ouders
    document.querySelectorAll(".only-leiding").forEach(el => {
        el.classList.toggle("hide-view", isOuderCheck);
    });

    // Kolommen die ouders niet mogen zien
    document.querySelectorAll(".col-locatie, .col-materiaal, .col-type, .col-leiding").forEach(el => {
        el.classList.toggle("hide-view", isOuderCheck);
    });

    // FAB (opkomst toevoegen) alleen zichtbaar voor leiding
    if (fab) fab.classList.toggle("hide-view", isOuderCheck);

    // Sidebar alleen voor leiding
    const sidebar = document.getElementById("leidingSidebar");
    if (sidebar) sidebar.classList.toggle("hidden", isOuderCheck);

    // --- SEIZOEN DROPDOWN INJECTIE (Iedereen) ---
    const filterContainer = document.getElementById("seizoenFilterContainer");
    if (filterContainer) {
        const isLeidingCheck = !isOuder();

        // Logica voor welke opties we tonen
        // Automatisch: vanaf 2025-2026 t/m het seizoen na het huidige.
        // (Voorheen stond hier een vaste lijst t/m 26/27, waardoor
        // 27/28 nooit verscheen.)
        const huidigSeizoen = getSeizoenVanDatum(todayISO());
        const huidigStartJaar = Number(huidigSeizoen.split("-")[0]);
        const opties = [];
        for (let jaar = 2025; jaar <= huidigStartJaar + 1; jaar++) {
            opties.push({
                val: `${jaar}-${jaar + 1}`,
                label: `${String(jaar).slice(2)}/${String(jaar + 1).slice(2)}`
            });
        }

        let html = `<label>Seizoen:</label><select id="filterSeizoen" class="cell-select">`;

        opties.forEach(opt => {
            // Als het ouder is, check of het seizoen toegestaan is
            if (isLeidingCheck || isSeizoenToegestaan(opt.val)) {
                html += `<option value="${opt.val}" ${currentSeizoenFilter === opt.val ? 'selected' : ''}>${opt.label}</option>`;
            }
        });

        html += `</select>`;
        filterContainer.innerHTML = html;
    }
}


/* ======================================================================
   LOAD EVERYTHING
   ====================================================================== */
async function loadEverything() {
    loadingIndicator?.classList.remove(
        "hidden"
    );

    errorIndicator?.classList.add(
        "hidden"
    );


    /*
     * Alleen op de Roverspagina wordt deze variabele
     * gevuld met publieke Stamopkomsten.
     */

    let sharedStamOpkomsten = {};
sharedStamMembers = [];

    try {
        if (isOuder()) {
            // Ouder: alleen public
            const pubSnap = await get(ref(db, PUBLIC_ROOT));
            if (!pubSnap.exists()) throw new Error("Geen publieke data gevonden");
            data = pubSnap.val() || {};
        } else {
            // Leiding: private + public; merge jeugd-aanwezigheid uit public
            const [privSnap, pubSnap] = await Promise.all([
                get(ref(db, speltak)),
                get(ref(db, PUBLIC_ROOT))
            ]);

            if (!privSnap.exists()) throw new Error("Geen private data gevonden");

            data = privSnap.val() || {};
            const pub = pubSnap.exists() ? (pubSnap.val() || {}) : {};
            const pubOpkomsten = pub.opkomsten || {};

            if (data.opkomsten && pubOpkomsten) {
                Object.keys(data.opkomsten).forEach((opId) => {
                    const pubAanw = pubOpkomsten?.[opId]?.aanwezigheid;
                    if (!pubAanw) return;

                    // Alleen jeugd keys mergen (geen leiding-*)
                    const jeugdAanw = {};
                    for (const [k, v] of Object.entries(pubAanw)) {
                        if (!String(k).startsWith("leiding-")) jeugdAanw[k] = v;
                    }

                    data.opkomsten[opId].aanwezigheid = {
                        ...(data.opkomsten[opId].aanwezigheid || {}),
                        ...jeugdAanw
                    };
                });
            }
        }
        /*
         * Rovers toont ook de publieke Stamopkomsten.
         *
         * We lezen alleen stam/public/opkomsten:
         * - ouders mogen deze gegevens zien;
         * - Roverleiding krijgt geen private Stamnotities;
         * - aanwezigheid staat al in dezelfde publieke opkomst.
         */

if (speltak === "rovers") {
    /*
     * Stamopkomsten en publieke Stamleden tegelijk laden.
     *
     * De Stamleden zijn nodig om in de kolom
     * 'Aanw. leden' het volledige aantal Stamleden
     * te tonen, dus niet alleen gekoppelde Rovers.
     */

    const [
        stamPublicOpkomstenSnapshot,
        stamPublicMembersSnapshot
    ] =
        await Promise.all([
            get(
                ref(
                    db,
                    "stam/public/opkomsten"
                )
            ),

            get(
                ref(
                    db,
                    "stam/public/jeugdleden"
                )
            )
        ]);


    sharedStamOpkomsten =
        stamPublicOpkomstenSnapshot.exists()
            ? (
                stamPublicOpkomstenSnapshot.val() ||
                {}
            )
            : {};


    const stamMembersData =
        stamPublicMembersSnapshot.exists()
            ? (
                stamPublicMembersSnapshot.val() ||
                {}
            )
            : {};


    sharedStamMembers =
        Object
            .entries(
                stamMembersData
            )
            .map(
                ([id, member]) => ({
                    id,

                    naam:
                        member.naam || "",

                    hidden:
                        !!member.hidden,

                    volgorde:
                        member.volgorde ?? 999
                })
            )
            .sort(
                (a, b) =>
                    a.volgorde -
                    b.volgorde
            );
}
        loadingIndicator?.classList.add("hidden");

  /* ================================================================
   OPKOMSTEN — EIGEN PLANNING + GEDEELDE STAMOPKOMSTEN
================================================================ */

/*
 * Opkomsten van de actieve pagina.
 */

const ownOpkomsten =
    Object
        .entries(
            data.opkomsten || {}
        )
        .map(
            ([id, value]) => ({
                id,

                ...value,

                /*
                 * Werkelijke Firebasebron.
                 */

                bronSpeltak:
                    speltak,

                /*
                 * Op de Stampagina zelf is een Stamopkomst
                 * geen extern gedeelde opkomst.
                 */

                isGedeeldeStamOpkomst:
                    false,

                /*
                 * Unieke lokale sleutel.
                 * Handig omdat verschillende Firebase-nodes
                 * theoretisch dezelfde push-ID kunnen bevatten.
                 */

                rowKey:
                    `${speltak}:${id}`
            })
        );


/*
 * Publieke Stamopkomsten die alleen op de
 * Roverspagina worden toegevoegd.
 */

const sharedOpkomsten =
    speltak === "rovers"
        ? Object
            .entries(
                sharedStamOpkomsten
            )
            .map(
                ([id, value]) => ({
                    id,

                    ...value,

                    bronSpeltak:
                        "stam",

                    isGedeeldeStamOpkomst:
                        true,

                    rowKey:
                        `stam:${id}`
                })
            )
        : [];


/*
 * Beide lijsten samenvoegen en daarna opnieuw
 * chronologisch sorteren.
 */

opkomsten =
    sortOpkomsten([
        ...ownOpkomsten,
        ...sharedOpkomsten
    ]);


/*
 * Eerstvolgende opkomst bepalen over de
 * volledige gecombineerde planning.
 */

const nextUpcoming =
    getNextUpcoming(
        opkomsten
    );


nextUpcomingId =
    nextUpcoming
        ? nextUpcoming.rowKey
        : null;

        // Jeugd
// Jeugd
jeugd = Object.entries(data.jeugdleden || {})
    .map(([id, v]) => ({
        id,

        naam:
            v.naam || "",

        WelpenNaam:
            v.WelpenNaam || "",

        Nest:
            (v.Nest || "").toLowerCase(),

        NestLeider:
            !!v.NestLeider,

        Ploeg:
            (v.Ploeg || "").toLowerCase(),

        PL:
            !!v.PL,

        APL:
            !!v.APL,

        hidden:
            !!v.hidden,

        volgorde:
            v.volgorde ?? 999,


        /*
         * Rover ↔ Stam-koppeling behouden.
         *
         * Deze velden zijn alleen gevuld bij gekoppelde
         * Rover- en Stamleden. Op andere speltakken
         * blijven ze gewoon een lege string.
         */

        linkedStamMemberId:
            v.linkedStamMemberId || "",

        linkedRoverMemberId:
            v.linkedRoverMemberId || ""
    }))
    .sort(
        (a, b) =>
            a.volgorde - b.volgorde
    );

        if (speltak === "welpen") {
            const NestOrder = { zwart: 1, bruin: 2, wit: 3, grijs: 4, "": 5, none: 5 };
            jeugd.sort((a, b) => {
                const na = NestOrder[a.Nest || "none"];
                const nb = NestOrder[b.Nest || "none"];
                if (na !== nb) return na - nb;
                if (a.NestLeider !== b.NestLeider) return a.NestLeider ? -1 : 1;
                return a.naam.localeCompare(b.naam);
            });
        }

        if (speltak === "scouts") {
            const PLOEG_ORDER = { meeuw: 1, reiger: 2, kievit: 3, sperwer: 4, "": 5 };
            jeugd.sort((a, b) => {
                const pa = PLOEG_ORDER[a.Ploeg || ""] || 999;
                const pb = PLOEG_ORDER[b.Ploeg || ""] || 999;
                if (pa !== pb) return pa - pb;
                if (a.PL !== b.PL) return a.PL ? -1 : 1;
                if (a.APL !== b.APL) return a.APL ? -1 : 1;
                return a.naam.localeCompare(b.naam);
            });
        }

        // Leiding
        leiding = Object.entries(data.leiding || {})
            .map(([id, v]) => ({
                id,
                naam: v.naam || "",
                WelpenNaam: v.WelpenNaam || "",
                hidden: !!v.hidden,
                volgorde: v.volgorde ?? 999
            }))
            .sort((a, b) => a.volgorde - b.volgorde);

        renderEverything();
    } catch (err) {
        console.error(err);
        loadingIndicator?.classList.add("hidden");
        errorIndicator?.classList.remove("hidden");

        const msg = String(err?.message || err || "");
        const isPerm =
            err?.code === "PERMISSION_DENIED" ||
            msg.toLowerCase().includes("permission denied");

        errorIndicator.textContent = isPerm
            ? "Geen toegang tot deze data."
            : "Jaarplanning kon niet geladen worden.";

        opkomsten = [];
        renderTable();
    }
}


function renderEverything() {
    loadInfo();
    renderTable();
    renderLedenbeheer();
    renderMeldingen();

    // Na renderen pas scrollen/highlighten (dashboard → speltak)
    scrollToOpkomstFromHash();
}


/* ======================================================================
   INFO BLOK
   ====================================================================== */
function loadInfo() {
    // Ook bij het tonen opschonen: beschermt tegen oude of
    // rechtstreeks in de database gezette HTML.
    const veilig = sanitizeHtml(data.infotekst || "");
    infoTekst.innerHTML = veilig;
    infoEdit.innerHTML = veilig;
}

function toggleInfoEdit() {
    if (!isLeiding()) return alert("Alleen leiding kan info bewerken.");
    infoEditActive = !infoEditActive;

    if (infoEditActive) {
        // Naar bewerk-modus
        infoEditorWrapper.classList.remove("hidden");
        infoTekst.classList.add("hidden");
        infoEditButton.textContent = "Opslaan info";
    } else {
        // Opslaan
        const sanitized = sanitizeHtml(infoEdit.innerHTML);

        // Eén atomische update: privé en publiek lopen nooit uit elkaar.
        update(ref(db), {
            [`${speltak}/infotekst`]: sanitized,
            [`${PUBLIC_ROOT}/infotekst`]: sanitized
        }).then(() => {
            // Lokale state en weergave direct bijwerken
            data.infotekst = sanitized;
            infoTekst.innerHTML = sanitized;
            infoEdit.innerHTML = sanitized;

            infoEditorWrapper.classList.add("hidden");
            infoTekst.classList.remove("hidden");
            infoEditButton.textContent = "Info bewerken";
        }).catch(error => {
            // Voorheen faalde opslaan stil; nu blijft de editor open
            // zodat de tekst niet verloren gaat.
            console.error("Info opslaan mislukt:", error);
            infoEditActive = true;
            toonMelding(
                "Opslaan mislukt",
                "De informatie kon niet worden opgeslagen. Controleer je verbinding en probeer het opnieuw."
            );
        });
    }
}
// ===============================================
// WELPEN – NEST ORDER HELPERS
// ===============================================
const NEST_ORDER = ["zwart", "bruin", "wit", "grijs", ""];

function getNestIndex(nest) {
    const idx = NEST_ORDER.indexOf(nest || "");
    return idx === -1 ? 999 : idx;
}

// SCOUTS – PLOEG ORDER & MAPPING
const SCOUT_PLOEGEN = ["meeuw", "reiger", "kievit", "sperwer", ""];
const SCOUT_PLOEG_LABELS = {
    "meeuw": "Meeuwen",
    "reiger": "Reigers",
    "kievit": "Kieviten",
    "sperwer": "Sperwers",
    "": "Zonder ploeg"
};

/* ======================================================================
   SCOUTS — LEDENBEHEER
====================================================================== */
function renderLedenbeheerScouts() {
    const jeugdContainer = document.getElementById("jeugdLeden");
    const leidingContainer = ledenbeheerLeiding;
    if (!jeugdContainer || !leidingContainer) return;

    jeugdContainer.innerHTML = "";
    leidingContainer.innerHTML = "";

    const ICONS = {
        "sperwer": "assets/Ploegteken-sperwer.png",
        "kievit": "assets/Ploegteken-kievit.png",
        "reiger": "assets/Ploegteken-reiger.png",
        "meeuw": "assets/Ploegteken-meeuw.png",
        "": ""
    };

    const byPloeg = {};
    SCOUT_PLOEGEN.forEach(p => (byPloeg[p] = []));

    jeugd.forEach(j => {
        const key = j.Ploeg || "";
        if (!byPloeg[key]) byPloeg[key] = [];
        byPloeg[key].push(j);
    });

    SCOUT_PLOEGEN.forEach(ploeg => {
        const leden = byPloeg[ploeg];
        const label = SCOUT_PLOEG_LABELS[ploeg];
        const icon = ICONS[ploeg];

        const header = document.createElement("div");
        header.className = `ploeg-header ploeg-${ploeg}`;
        header.innerHTML = icon
            ? `<img src="${escapeHtml(icon)}" class="ploeg-icoon" alt=""> ${escapeHtml(label)}`
            : escapeHtml(label);
        jeugdContainer.appendChild(header);

        leden
            .sort((a, b) => {
                if (a.PL !== b.PL) return a.PL ? -1 : 1;
                if (a.APL !== b.APL) return a.APL ? -1 : 1;
                return a.naam.localeCompare(b.naam);
            })
            .forEach(j => jeugdContainer.appendChild(makeMemberRowScouts(j)));
    });

    leiding.forEach(l => leidingContainer.appendChild(makeMemberRow(l, "leiding")));
}
function makeMemberRowScouts(obj) {
    const li = document.createElement("li");
    li.classList.add("draggable");
    li.draggable = true;
    li.dataset.id = obj.id;
    li.dataset.type = "jeugd";
    li.dataset.ploeg = obj.Ploeg || "";

  if (obj.hidden) {
    li.classList.add(
        "lid-verborgen"
    );
}


li.innerHTML = `
    <button
        type="button"
        class="member-row-button"
        aria-label="${escapeHtml(obj.naam)} openen"
        title="${obj.hidden
            ? `${escapeHtml(obj.naam)} — verborgen`
            : escapeHtml(obj.naam)
        }"
    >
        <span class="member-row-name">
            ${escapeHtml(obj.naam)}
        </span>

        ${
            obj.PL
                ? `<span class="member-row-role">PL</span>`
                : obj.APL
                    ? `<span class="member-row-role">APL</span>`
                    : ""
        }
    </button>
`;


const memberButton =
    li.querySelector(
        ".member-row-button"
    );


memberButton?.addEventListener(
    "click",
    event => {
        event.stopPropagation();

        openEditMember(
            obj,
            "jeugd"
        );
    }
);

   

    // DRAG & DROP
    li.addEventListener("dragstart", e => {
        e.dataTransfer.setData("id", obj.id);
    });

    li.addEventListener("dragover", e => {
        e.preventDefault();
        li.classList.add("drag-over");
    });

    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));

    li.addEventListener("drop", async e => {
        e.preventDefault();
        li.classList.remove("drag-over");

        const draggedId = e.dataTransfer.getData("id");
        const targetId = obj.id;

        if (!draggedId || draggedId === targetId) return;

        const dragged = jeugd.find(j => j.id === draggedId);
        if (!dragged) return;

        const oldPloeg = dragged.Ploeg || "";
        const newPloeg = obj.Ploeg || "";

        // ===============================
        // PLOEGWISSEL?
        // ===============================
        if (oldPloeg !== newPloeg) {
            const oldLabel = SCOUT_PLOEG_LABELS[oldPloeg];
            const newLabel = SCOUT_PLOEG_LABELS[newPloeg];

            const ok = confirm(
                `${dragged.naam} verplaatsen van '${oldLabel}' naar '${newLabel}'?\n\n` +
                `Let op: PL/APL rollen vervallen bij ploegwissel.`
            );
            if (!ok) return;

            // Eén atomische update voor privé én publiek.
            const ploegUpdates = {};
            for (const root of [speltak, PUBLIC_ROOT]) {
                const base = `${root}/jeugdleden/${dragged.id}`;
                ploegUpdates[`${base}/Ploeg`] = newPloeg;
                ploegUpdates[`${base}/PL`] = false;
                ploegUpdates[`${base}/APL`] = false;
                ploegUpdates[`${base}/volgorde`] = 999;
            }
            await update(ref(db), ploegUpdates);

            return loadEverything();

        }

        // ===============================
        // ZELFDE PLOEG → HERORDENEN
        // ===============================

        const ledenZelfdePloeg = jeugd
            .filter(j => (j.Ploeg || "") === oldPloeg)
            .sort((a, b) => a.volgorde - b.volgorde);

        const from = ledenZelfdePloeg.findIndex(j => j.id === draggedId);
        const to = ledenZelfdePloeg.findIndex(j => j.id === targetId);

        if (from === -1 || to === -1) return;

        // Verplaats
        ledenZelfdePloeg.splice(from, 1);
        ledenZelfdePloeg.splice(to, 0, dragged);

        // Volgorde veilig herschrijven
        const updates = {};
        ledenZelfdePloeg.forEach((j, i) => {
            updates[`${speltak}/jeugdleden/${j.id}/volgorde`] = i + 1;
            updates[`${PUBLIC_ROOT}/jeugdleden/${j.id}/volgorde`] = i + 1;
        });

        await update(ref(db), updates);
        loadEverything();
    });

    return li;
}
/* ======================================================================
   TABEL — HEADER
   ====================================================================== */
function renderTable() {
    headerRowTop.innerHTML = "";
    if (headerRowBottom) headerRowBottom.innerHTML = "";
    tableBody.innerHTML = "";

    addHeaders();

    const visible = opkomsten.filter(o => {
        // 1. Tijd-filter
        let timeMatch = true;
        if (currentFilter === "future") timeMatch = !isOpkomstVoorbij(o);
        if (currentFilter === "past") timeMatch = isOpkomstVoorbij(o);

        // 2. Seizoen-filter (Helperfunctie uit utils.js)
        // Importeer getSeizoenVanDatum in je bestand indien nog niet gedaan
        const opkomstSeizoen = getSeizoenVanDatum(o.datum);
        const seizoenMatch = (currentSeizoenFilter === "all" || opkomstSeizoen === currentSeizoenFilter);

        return timeMatch && seizoenMatch;
    });

    // Lege staten
    if (!opkomsten || opkomsten.length === 0) {
        renderEmptyTableState("nodata");
        renderMobileCards([], "nodata");
        syncHorizontalScrollProxy();
        return;
    }

    if (visible.length === 0) {
        renderEmptyTableState("filtered");
        renderMobileCards([], "filtered");
        syncHorizontalScrollProxy();
        return;
    }


    visible.forEach(o => addRow(o));
    if (isLeiding()) addTotalsRow();

    renderMobileCards(visible);
    syncHorizontalScrollProxy();
}


/* ======================================================================
   MOBIEL — KAARTJESWEERGAVE
   Op de telefoon is de brede tabel lastig te lezen (zie melding over
   in- en uitzoomen). Kaartjes tonen per opkomst de belangrijkste info
   en de aanwezigheid; de tabel blijft beschikbaar via de schakelaar.
   ====================================================================== */

// Desktop: Dashboard/Ledenbeheer niet meer zwevend rechtsonder (ze
// verstopten de knop 'Nieuwe opkomst'), maar naast 'Opkomsten bewerken'.
(function moveLeidingSidebarToToolbar() {
    const sidebarEl = document.getElementById("leidingSidebar");
    const headerRight = document.querySelector(".planning-header-right");
    if (!sidebarEl || !headerRight) return;
    const editBtn = headerRight.querySelector("#editModeButton");
    headerRight.insertBefore(sidebarEl, editBtn || null);
    sidebarEl.classList.add("in-toolbar");
})();

function getMobileView() {
    try {
        return localStorage.getItem(MOBILE_VIEW_KEY) === "tabel" ? "tabel" : "kaarten";
    } catch {
        return "kaarten";
    }
}

function setMobileView(view) {
    try {
        localStorage.setItem(MOBILE_VIEW_KEY, view);
    } catch {
        // Geen opslag beschikbaar: alleen voor deze sessie.
    }
    applyMobileView();
}

function applyMobileView() {
    const view = getMobileView();
    document.body.classList.toggle("mobile-view-tabel", view === "tabel");
    document.body.classList.toggle("mobile-view-kaarten", view === "kaarten");
    document.querySelectorAll(".mobile-view-toggle button").forEach(btn => {
        const active = btn.dataset.view === view;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", String(active));
    });
}

function ensureMobileCardsContainer() {
    let container = document.getElementById("mobileCards");
    if (container) return container;

    const anchor =
        document.getElementById("tableScrollAnchor") ||
        document.querySelector(".planning-main .table-wrapper") ||
        document.querySelector(".table-wrapper");
    if (!anchor) return null;

    const toggle = document.createElement("div");
    toggle.className = "mobile-view-toggle";
    toggle.setAttribute("role", "group");
    toggle.setAttribute("aria-label", "Weergave");
    toggle.innerHTML = `
        <button type="button" data-view="kaarten">Kaartjes</button>
        <button type="button" data-view="tabel">Tabel</button>
    `;
    toggle.querySelectorAll("button").forEach(btn =>
        btn.addEventListener("click", () => setMobileView(btn.dataset.view))
    );

    container = document.createElement("div");
    container.id = "mobileCards";
    container.className = "mobile-cards";
    container.setAttribute("aria-live", "polite");

    anchor.parentNode.insertBefore(toggle, anchor);
    anchor.parentNode.insertBefore(container, anchor);
    applyMobileView();
    return container;
}


function renderMobileCards(visible = [], emptyKind = "") {
    const container = ensureMobileCardsContainer();
    if (!container) return;

    container.innerHTML = "";

    if (!visible.length) {
        const empty = document.createElement("p");
        empty.className = "mobile-cards-empty";
        empty.textContent = emptyKind === "filtered"
            ? "Geen opkomsten zichtbaar met dit filter."
            : "Er zijn nog geen opkomsten gepland.";
        container.appendChild(empty);
        return;
    }

    const nextUpcoming = getNextUpcoming(visible);

    visible.forEach(o => {
        const id = o.rowKey || o.id;
        const past = isOpkomstVoorbij(o);
        const type = o.typeOpkomst || "normaal";

        const card = document.createElement("article");
        card.className = `opkomst-card type-${type}`;
        if (past) card.classList.add("is-past");
        if (nextUpcoming && (nextUpcoming.rowKey || nextUpcoming.id) === id && type !== "geen") {
            card.classList.add("is-next");
        }

        const weekdag = getWeekdagAfkorting(o.datum);
        const datum = type === "kamp" && o.einddatum
            ? formatDateRange(o.datum, o.einddatum)
            : formatDateDisplay(o.datum);
        const tijd = type === "geen"
            ? ""
            : [o.starttijd, o.eindtijd].filter(Boolean).join("–");

        const head = document.createElement("div");
        head.className = "opkomst-card-head";
        head.innerHTML = `
            <div class="opkomst-card-date">
                <span class="opkomst-card-weekday">${escapeHtml(weekdag)}</span>
                <strong>${escapeHtml(datum)}</strong>
                ${tijd ? `<span class="opkomst-card-time">${escapeHtml(tijd)}</span>` : ""}
            </div>
            <span class="opkomst-card-type">${escapeHtml(getOpkomstTypeLabel(type))}</span>
        `;
        card.appendChild(head);

        if (o.thema) {
            const thema = document.createElement("h3");
            thema.className = "opkomst-card-thema";
            thema.innerHTML = linkifyText(o.thema);
            card.appendChild(thema);
        }

        const rows = [
            ["Bijzonderheden", o.bijzonderheden],
            ["Buddy", ["explorers", "rovers"].includes(speltak) ? o.buddy : ""],
            ["Bert logeert bij", config.showBert ? o.bert_met : ""]
        ];

        if (!isOuder()) {
            rows.push(
                ["Procor", o.procor],
                ["Locatie", o.locatie],
                ["Materiaal", o.materiaal],
                ["Notities", o.notities]
            );
        }

        const details = rows.filter(([, v]) => v && String(v).trim());
        if (details.length) {
            const dl = document.createElement("dl");
            dl.className = "opkomst-card-details";
            dl.innerHTML = details.map(([k, v]) =>
                `<div><dt>${escapeHtml(k)}</dt><dd>${linkifyText(v)}</dd></div>`
            ).join("");
            card.appendChild(dl);
        }

        // Aanwezigheid
        if (type !== "geen") {
            const zichtbareJeugd = jeugd.filter(j => !j.hidden);
            const counts = { aanwezig: 0, afwezig: 0, onbekend: 0 };
            const entries = zichtbareJeugd.map(j => {
                const { status } = getPresenceStatus(o, j.id, false);
                if (status && counts[status] !== undefined) counts[status]++;
                return { j, status };
            });

            if (entries.length) {
                const expanded = expandedCards.has(id);
                const presence = document.createElement("div");
                presence.className = "opkomst-card-presence";

                const summary = document.createElement("button");
                summary.type = "button";
                summary.className = "opkomst-card-presence-toggle";
                summary.setAttribute("aria-expanded", String(expanded));
                summary.innerHTML = `
                    <span>Aanwezigheid</span>
                    <span class="presence-counts">
                        <span class="pc pc-aanwezig">✓ ${counts.aanwezig}</span>
                        <span class="pc pc-afwezig">✗ ${counts.afwezig}</span>
                        <span class="pc pc-onbekend">? ${counts.onbekend}</span>
                    </span>
                    <span class="presence-chevron" aria-hidden="true">${expanded ? "▴" : "▾"}</span>
                `;
                summary.addEventListener("click", () => {
                    if (expandedCards.has(id)) expandedCards.delete(id);
                    else expandedCards.add(id);
                    renderMobileCards(visible, emptyKind);
                });
                presence.appendChild(summary);

                if (expanded) {
                    const hint = document.createElement("p");
                    hint.className = "presence-hint";
                    hint.textContent = past && !isLeiding()
                        ? "Deze opkomst is al geweest."
                        : "Tik op een naam om de aanwezigheid te wijzigen.";
                    presence.appendChild(hint);

                    const list = document.createElement("ul");
                    list.className = "presence-list";

                    entries.forEach(({ j, status }) => {
                        const li = document.createElement("li");
                        const btn = document.createElement("button");
                        btn.type = "button";
                        const st = status || "onbekend";
                        btn.className = `presence-chip is-${st}`;
                        btn.disabled = !status || (past && !isLeiding());
                        const info = PRESENCE_LABELS[st];
                        btn.innerHTML = `<span class="presence-icon" aria-hidden="true">${info.icon}</span><span>${escapeHtml(j.naam || "")}</span>`;
                        btn.setAttribute("aria-label", `${j.naam || ""}: ${info.label}. Tik om te wijzigen.`);
                        btn.addEventListener("click", () => togglePresence(o, j.id, false));
                        li.appendChild(btn);
                        list.appendChild(li);
                    });

                    presence.appendChild(list);
                }

                card.appendChild(presence);
            }
        }

        if (isLeiding() && isEdit() && !o.isGedeeldeStamOpkomst) {
            const actions = document.createElement("div");
            actions.className = "opkomst-card-actions";
            const edit = document.createElement("button");
            edit.type = "button";
            edit.className = "pill-btn outline";
            edit.textContent = "Bewerken";
            edit.addEventListener("click", () => openEditOpkomstModal(o));
            actions.appendChild(edit);
            card.appendChild(actions);
        }

        card.querySelectorAll("a").forEach(a =>
            a.addEventListener("click", e => e.stopPropagation())
        );

        container.appendChild(card);
    });
}


function addHeaders() {
    const trTop = headerRowTop;
    const trBottom = headerRowBottom;

    const twoRows = speltak === "welpen" && trBottom;

    trTop.innerHTML = "";
    if (trBottom) trBottom.innerHTML = "";

    // Helper: header met optioneel rowSpan=2
    function addMainHeader(txt, cls) {
        const th = makeHeader(txt, cls);
        if (twoRows) th.rowSpan = 2;
        trTop.appendChild(th);
        return th;
    }

    // Extra kolom voor verwijderen in edit-modus
    if (isEdit()) {
        const th = document.createElement("th");
        th.classList.add("col-delete");
        if (twoRows) th.rowSpan = 2;
        trTop.appendChild(th);
    }


    addMainHeader("Datum", "col-datum");
    addMainHeader("Start");
    addMainHeader("Eind");

    if (!isOuder()) addMainHeader("Procor", "col-procor");

    // Explorers: Buddy-kolom (altijd zichtbaar)
    if (["explorers", "rovers"].includes(speltak)) {
        addMainHeader("Buddy", "col-buddy");
    }


    const thType = addMainHeader("Type", "col-type");
    if (isOuder()) thType.classList.add("hide-view");

    addMainHeader("Thema", "col-thema");
    addMainHeader("Bijzonderheden", "col-bijzonderheden");

    /*
     * Interne notities worden alleen voor leiding
     * aan de tabel toegevoegd.
     */
    if (!isOuder()) {
        addMainHeader("Notities", "col-notities");
    }

    if (config.showBert) {
        addMainHeader("Bert logeert bij", "col-bert");
    }
    const thLoc = addMainHeader("Locatie", "col-locatie");
    if (isOuder()) thLoc.classList.add("hide-view");

    const thMat = addMainHeader("Materiaal", "col-materiaal");
    if (isOuder()) thMat.classList.add("hide-view");

    // ===== JEUGD-KOLOMMEN =====
    const zichtbareJeugd = jeugd.filter(j => !j.hidden);

    if (!twoRows) {
        zichtbareJeugd.forEach(j => {
            const th = document.createElement("th");
            th.classList.add("col-jeugd");

            // SCOUTS kleurmarkeringen
            if (speltak === "scouts") {
                const ploeg = j.Ploeg || "";
                th.classList.add(`ploeg-${ploeg}`);
            }

            // Icons bij PL/APL
            // Het sterretje staat rechtop in een eigen element; in de
            // gedraaide tekst viel het anders half buiten de kolom.
            let icon = "";
            if (j.PL) icon = `<span class="pl-icon" title="PL" aria-label="PL">★</span>`;
            else if (j.APL) icon = `<span class="pl-icon is-apl" title="APL" aria-label="APL">☆</span>`;

            th.innerHTML = `<div class="name-vertical">${icon}${escapeHtml(j.naam)}</div>`;
            trTop.appendChild(th);
        });
    } else {
        // Welpen: boven WelpenNaam, onder echte naam
        zichtbareJeugd.forEach(j => {
            const Nest = (j.Nest || "").toLowerCase();
            const missing = !j.WelpenNaam || !j.WelpenNaam.trim();

            // Bovenste rij: WelpenNaam
            const thTop = document.createElement("th");
            thTop.classList.add("col-jeugd");
            if (Nest) thTop.classList.add(`nest-${Nest}`);

            const divTop = document.createElement("div");
            divTop.classList.add("name-vertical", "welpen-naam");
            if (missing) divTop.classList.add("welpen-missing");
            if (j.NestLeider) divTop.classList.add("welpen-leider");

            divTop.textContent = missing ? "❗" : j.WelpenNaam;
            thTop.appendChild(divTop);
            trTop.appendChild(thTop);

            // Onderste rij: echte naam
            const thBottom = document.createElement("th");
            thBottom.classList.add("col-jeugd");

            const divBottom = document.createElement("div");
            divBottom.classList.add("name-vertical", "welpen-naam-reallife");
            divBottom.textContent = j.naam;

            thBottom.appendChild(divBottom);
            trBottom.appendChild(thBottom);
        });
    }


    // Kijkers-kolom (alleen als niet uitgezet via config)
    if (!isOuder() && config.showKijkers !== false) {
        addMainHeader("Kijkers", "col-kijkers");
    }


    // Divider tussen jeugd en leiding
    const vJ = zichtbareJeugd.length;
    const vL = leiding.filter(l => !l.hidden).length;
    if (vJ > 0 && vL > 0) {
        const split = document.createElement("th");
        split.classList.add("col-divider");
        if (twoRows) split.rowSpan = 2;
        trTop.appendChild(split);
    }

    // ===== LEIDING-KOLOMMEN =====
    if (config.showLeiding) {
        const zichtbareLeiding = leiding.filter(l => !l.hidden);

        if (!twoRows) {
            zichtbareLeiding.forEach(l => {
                const th = document.createElement("th");
                th.classList.add("col-leiding");
                if (isOuder()) th.classList.add("hide-view");
                th.innerHTML = `<div class="name-vertical">${escapeHtml(l.naam)}</div>`;
                trTop.appendChild(th);
            });
        } else {
            zichtbareLeiding.forEach(l => {
                const missing = !l.WelpenNaam || !l.WelpenNaam.trim();

                // bovenste rij: WelpenNaam
                const thTop = document.createElement("th");
                thTop.classList.add("col-leiding");
                if (isOuder()) thTop.classList.add("hide-view");

                const divTop = document.createElement("div");
                divTop.classList.add("name-vertical", "welpen-naam");
                if (missing) divTop.classList.add("welpen-missing");
                divTop.textContent = missing ? "❗" : l.WelpenNaam;

                thTop.appendChild(divTop);
                trTop.appendChild(thTop);

                // onderste rij: echte naam
                const thBottom = document.createElement("th");
                thBottom.classList.add("col-leiding");
                if (isOuder()) thBottom.classList.add("hide-view");

                const divBottom = document.createElement("div");
                divBottom.classList.add("name-vertical", "welpen-naam-reallife");
                divBottom.textContent = l.naam;

                thBottom.appendChild(divBottom);
                trBottom.appendChild(thBottom);
            });
        }
    }
    // Extra + tellers (alleen voor leiding)
    if (!isOuder()) {

        // Extra kolommen (alleen als niet uitgezet via config)
        if (config.showExtraLeiding !== false) {
            if (isEdit()) {
                addMainHeader("Extra", "col-extra-aantal");
                addMainHeader("Extra", "col-extra-namen");
            } else {
                addMainHeader("Extra", "col-extra-namen");
            }
        }

        addMainHeader(config.showLeiding ? "Aanw. jeugd" : "Aanw. leden", "col-aanw-jeugd");
        if (config.showLeiding) addMainHeader("Aanw. leiding", "col-aanw-leiding");
    }

}

function makeHeader(txt, cls) {
    const th = document.createElement("th");
    th.textContent = txt;
    if (cls) th.classList.add(cls);
    return th;
}

function makeDivider() {
    const th = document.createElement("th");
    th.classList.add("col-divider");
    return th;
}
function getTableColCount() {
    // Beste indicatie: aantal headers in de bovenste header-rij
    // (werkt ook voor Welpen met 2 header-rijen)
    return headerRowTop?.children?.length || 1;
}

function renderEmptyTableState(kind) {
    // kind: "nodata" | "filtered" | "error"
    const tr = document.createElement("tr");
    tr.classList.add("row-empty");

    const td = document.createElement("td");
    td.classList.add("empty-state-cell");
    td.colSpan = getTableColCount();

    const isLead = isLeiding();

    let title = "";
    let body = "";

    if (kind === "nodata") {
        title = "Nog geen opkomsten.";
        body = isLead
            ? "Je kunt meteen een eerste opkomst toevoegen via ‘Nieuwe opkomst +’."
            : "Er zijn nog geen opkomsten gepland. Kom later terug of vraag de leiding om de jaarplanning te vullen.";
    } else if (kind === "filtered") {
        title = "Geen opkomsten zichtbaar met dit filter.";
        body = "Er zijn nog geen opkomsten gepland. Kom later terug of vraag de leiding om de jaarplanning te vullen."
    } else {
        title = "Jaarplanning kon niet geladen worden.";
        body = "Controleer je verbinding en probeer het later opnieuw.";
    }

    td.innerHTML = `
    <div class="empty-state">
      <div class="empty-title">${escapeHtml(title)}</div>
      <div class="empty-body">${escapeHtml(body)}</div>
    </div>
  `;

    tr.appendChild(td);
    tableBody.appendChild(tr);
}

function showUndoBanner(message, onUndo) {
    let banner = document.getElementById("undoBanner");

    if (!banner) {
        banner = document.createElement("div");
        banner.id = "undoBanner";
        banner.className = "undo-banner";
        document.body.appendChild(banner);
    }

    banner.innerHTML = `
        <span>${escapeHtml(message)}</span>
        <button id="undoDeleteBtn">Ongedaan maken</button>
    `;

    banner.classList.add("visible");

    document.getElementById("undoDeleteBtn").onclick = () => {
        banner.classList.remove("visible");
        onUndo();
    };
}

function hideUndoBanner() {
    const banner = document.getElementById("undoBanner");
    if (banner) banner.classList.remove("visible");
}

function openDeleteOpkomstModal(opkomst) {
    if (!deleteOpkomstModal || !opkomst) return;

    opkomstToDelete = opkomst;

    const datumTekst = opkomst.datum
        ? formatDateDisplay(opkomst.datum)
        : "deze datum";

    const titelTekst = opkomst.thema
        ? ` (“${opkomst.thema}”)`
        : "";

    if (deleteOpkomstText) {
        deleteOpkomstText.textContent =
            `Weet je zeker dat je de opkomst van ${datumTekst}${titelTekst} wilt verwijderen?`;
    }

    deleteOpkomstModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
}


function closeDeleteOpkomstModal() {
    if (!deleteOpkomstModal) return;

    deleteOpkomstModal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    opkomstToDelete = null;
}
/* ======================================================================
   TABEL — ROWS
   ====================================================================== */
function addRow(o) {
    const tr =
        document.createElement("tr");


    /*
     * rowKey is uniek over meerdere speltakken.
     * De originele Firebase-ID bewaren we apart.
     */

    tr.dataset.id =
        o.rowKey || o.id;

    tr.dataset.firebaseId =
        o.id;

    tr.dataset.bronSpeltak =
        o.bronSpeltak || speltak;

    tr.dataset.opkomstDatum =
        o.datum;

        /*
 * Gedeelde Stamopkomsten herkenbaar maken
 * voor styling en verdere logica.
 */

if (o.isGedeeldeStamOpkomst) {
    tr.classList.add(
        "row-shared-stam"
    );

    tr.dataset.sharedOpkomst =
        "stam";
}

if (isEdit()) {
    tr.classList.add(
        "row-modal-editable"
    );


    if (
        o.isGedeeldeStamOpkomst
    ) {
        tr.classList.add(
            "row-shared-stam-locked"
        );

        tr.title =
            "Klik voor beheer via de Stamplanning";

    } else {
        tr.title =
            "Klik om deze opkomst te bewerken";
    }


    tr.addEventListener(
        "click",
        event => {
            /*
             * Klikken op aanwezigheid, verwijderen
             * of een ander interactief element mag
             * geen rijactie uitvoeren.
             */

            if (
                event.target.closest(
                    ".presence-cell"
                ) ||
                event.target.closest(
                    ".col-delete"
                ) ||
                event.target.closest(
                    "button, input, select, textarea, a"
                )
            ) {
                return;
            }


            if (
                o.isGedeeldeStamOpkomst
            ) {
                openSharedStamOpkomstNotice(
                    o
                );

                return;
            }


            openEditOpkomstModal(
                o
            );
        }
    );
}
    const past = isOpkomstVoorbij(o);
    // Verleden: altijd volledig grijs, geen andere kleurmarkeringen
    if (past) {
        tr.classList.add("row-grey");
    } else {
        // Type-kleuren (alleen voor vandaag/toekomst)
        if (o.typeOpkomst === "geen") tr.classList.add("row-geenopkomst");
        else if (o.typeOpkomst === "bijzonder") tr.classList.add("row-bijzonder");
        else if (o.typeOpkomst === "kamp") tr.classList.add("row-kamp");

if (
    (o.rowKey || o.id) ===
        nextUpcomingId &&
    o.typeOpkomst !== "geen"
) {
    tr.classList.add(
        "row-next"
    );
}
    }


if (isEdit()) {
    const del =
        document.createElement("td");

    del.classList.add(
        "col-delete"
    );


    if (
        o.isGedeeldeStamOpkomst
    ) {
        /*
         * De cel blijft bestaan voor correcte
         * uitlijning met de tabelheader.
         */

        del.classList.add(
            "shared-opkomst-lock-cell"
        );

        del.textContent =
            "🔒";

        del.title =
            "Beheer deze opkomst vanuit de Stamplanning";

        del.setAttribute(
            "aria-label",
            "Stamopkomst is hier niet te verwijderen"
        );

    } else {
        del.classList.add(
            "editable-cell"
        );

        del.textContent =
            "❌";


        del.addEventListener(
            "click",
            event => {
                event.stopPropagation();


                if (!isLeiding()) {
                    return;
                }


                openDeleteOpkomstModal(
                    o
                );
            }
        );
    }


    tr.appendChild(
        del
    );
}

    tr.appendChild(makeEditableCell(o, "datum", "col-datum", "date"));
    tr.appendChild(makeEditableCell(o, "starttijd", "", "time"));
    tr.appendChild(makeEditableCell(o, "eindtijd", "", "time"));

    if (!isOuder()) {
        tr.appendChild(
            makeEditableCell(o, "procor", "col-procor", "text"));
    }
    // Explorers: Buddy-veld (altijd zichtbaar)
    if (["explorers", "rovers"].includes(speltak)) {
        tr.appendChild(
            makeEditableCell(o, "buddy", "col-buddy", "text")
        );
    }

    if (!isOuder()) {
        tr.appendChild(
            makeRestrictedEditable(
                o,
                "typeOpkomst",
                ["normaal", "bijzonder", "kamp", "geen"],
                "col-type"
            )
        );
    }

    tr.appendChild(makeEditableCell(o, "thema", "col-thema"));
    tr.appendChild(
        makeEditableCell(
            o,
            "bijzonderheden",
            "col-bijzonderheden",
            "textarea"
        )
    );

    /*
     * Notities zijn uitsluitend zichtbaar
     * in de leidingweergave.
     */
    if (!isOuder()) {
        tr.appendChild(
            makeEditableCell(
                o,
                "notities",
                "col-notities",
                "textarea"
            )
        );
    }

    if (config.showBert) {
        tr.appendChild(
            makeEditableCell(
                o,
                "bert_met",
                "col-bert"
            )
        );
    }

    if (!isOuder()) {
        tr.appendChild(makeRestrictedEditable(
            o,
            "locatie",
            ["", "Kampvuurkuil", "Zandveld", "Grasveld", "De Hoop",
                "Bever lokaal", "Welpen lokaal", "Van terrein af",
                "Externe locatie", "Keuken", "Overig"],
            "col-locatie"
        ));
    }

    if (!isOuder()) {
        tr.appendChild(makeEditableCell(o, "materiaal", "col-materiaal"));
    }

    jeugd.forEach(j => {
        if (!j.hidden) tr.appendChild(makePresenceCell(o, j.id, j.hidden, false));
    });

    if (!isOuder() && config.showKijkers !== false) {
        tr.appendChild(makeEditableCell(o, "kijkers", "col-kijkers", "number"));
    }


    const vJ = jeugd.filter(j => !j.hidden).length;
    const vL = leiding.filter(l => !l.hidden).length;
    if (vJ > 0 && vL > 0) tr.appendChild(makeDivider());

    if (config.showLeiding) {
        leiding.forEach(l => {
            if (!l.hidden) {
                tr.appendChild(makePresenceCell(o, `leiding-${l.id}`, l.hidden, true));
            }
        });
    }

    if (!isOuder()) {
        // Extra leiding (alleen als niet uitgezet via config)
        if (config.showExtraLeiding !== false) {
            // In bewerkmodus: getal + namen; in view-modus: alleen namen
            if (isEdit()) {
                tr.appendChild(
                    makeEditableCell(o, "extraAantal", "col-extra-aantal", "number")
                );
            }

            tr.appendChild(
                makeEditableCell(o, "extraNamen", "col-extra-namen")
            );
        }


        const [cntJ, cntL] = countPresence(o);

        const tdJ = document.createElement("td");
        tdJ.classList.add("col-aanw-jeugd");
        tdJ.textContent = cntJ;
        tr.appendChild(tdJ);

        if (config.showLeiding) {
            const tdL = document.createElement("td");
            tdL.classList.add("col-aanw-leiding");
            tdL.textContent = cntL;
            tr.appendChild(tdL);
        }


    }

    tableBody.appendChild(tr);
}

function addTotalsRow() {
    const zichtbareJeugd = jeugd.filter(j => !j.hidden);
    const zichtbareLeiding = config.showLeiding ? leiding.filter(l => !l.hidden) : [];

    if (zichtbareJeugd.length === 0 && zichtbareLeiding.length === 0) return;

    const totals = {};
    zichtbareJeugd.forEach(j => (totals[j.id] = 0));
    zichtbareLeiding.forEach(l => (totals[`leiding-${l.id}`] = 0));

    // Filter de opkomsten uitsluitend op basis van het actieve seizoen
    const gefilterdeOpkomsten = (opkomsten || []).filter(o => {
        const opkomstSeizoen = getSeizoenVanDatum(o.datum);
        return (currentSeizoenFilter === "all" || opkomstSeizoen === currentSeizoenFilter);
    });

/*
 * Bereken de totalen op basis van de
 * seizoensgefilterde opkomsten.
 *
 * Bij gedeelde Stamopkomsten wordt automatisch
 * het gekoppelde Stam-ID gebruikt.
 */

gefilterdeOpkomsten.forEach(
    opkomst => {

        zichtbareJeugd.forEach(
            member => {
                const {
                    context,
                    status
                } =
                    getPresenceStatus(
                        opkomst,
                        member.id,
                        false
                    );


                if (
                    context.available &&
                    status === "aanwezig"
                ) {
                    totals[member.id]++;
                }
            }
        );


        zichtbareLeiding.forEach(
            member => {
                const displayKey =
                    `leiding-${member.id}`;


                const {
                    context,
                    status
                } =
                    getPresenceStatus(
                        opkomst,
                        displayKey,
                        true
                    );


                if (
                    context.available &&
                    status === "aanwezig"
                ) {
                    totals[displayKey]++;
                }
            }
        );
    }
);


    const tr = document.createElement("tr");
    tr.classList.add("row-totals");

    const emptyTd = (cls = "") => {
        const td = document.createElement("td");
        if (cls) td.classList.add(cls);
        return td;
    };

    // Zelfde kolom-structuur als addRow(), maar dan leeg/label + totals in ledenkolommen
    if (isEdit()) tr.appendChild(emptyTd()); // delete-kolom

    const tdLabel = document.createElement("td");
    tdLabel.classList.add("col-datum", "totals-label");
    tdLabel.textContent = "Totaal aanwezig";
    tr.appendChild(tdLabel);

    tr.appendChild(emptyTd()); // start
    tr.appendChild(emptyTd()); // eind

    if (!isOuder()) tr.appendChild(emptyTd("col-procor"));

    if (["explorers", "rovers"].includes(speltak)) {
        tr.appendChild(emptyTd("col-buddy"));
    }

    if (!isOuder()) tr.appendChild(emptyTd("col-type"));

    tr.appendChild(emptyTd("col-thema"));
    tr.appendChild(emptyTd("col-bijzonderheden"));

    if (!isOuder()) {
        tr.appendChild(emptyTd("col-notities"));
    }
    if (config.showBert) tr.appendChild(emptyTd("col-bert"));

    if (!isOuder()) tr.appendChild(emptyTd("col-locatie"));
    if (!isOuder()) tr.appendChild(emptyTd("col-materiaal"));

    // Jeugd totals
    zichtbareJeugd.forEach(j => {
        const td = document.createElement("td");
        td.classList.add("col-jeugd");
        td.textContent = String(totals[j.id] ?? 0);
        tr.appendChild(td);
    });

    // Kijkers kolom (alleen als zichtbaar)
    if (!isOuder() && config.showKijkers !== false) tr.appendChild(emptyTd());

    // Divider
    if (zichtbareJeugd.length > 0 && zichtbareLeiding.length > 0) {
        const tdDiv = document.createElement("td");
        tdDiv.classList.add("col-divider");
        tr.appendChild(tdDiv);
    }

    // Leiding totals
    if (config.showLeiding) {
        zichtbareLeiding.forEach(l => {
            const key = `leiding-${l.id}`;
            const td = document.createElement("td");
            td.classList.add("col-leiding");
            if (isOuder()) td.classList.add("hide-view");
            td.textContent = String(totals[key] ?? 0);
            tr.appendChild(td);
        });
    }

    // Extra + aanw tellers kolommen (alleen leiding)
    if (!isOuder()) {
        // Extra kolommen (alleen als zichtbaar)
        if (config.showExtraLeiding !== false) {
            if (isEdit()) tr.appendChild(emptyTd("col-extra-aantal"));
            tr.appendChild(emptyTd("col-extra-namen"));
        }

        // Aanwezigheidstellers: altijd 1 kolom (jeugd/leden) + optioneel leiding
        tr.appendChild(emptyTd()); // Aanw. jeugd / Aanw. leden
        if (config.showLeiding) tr.appendChild(emptyTd()); // Aanw. leiding
    }

    tableBody.appendChild(tr);
}
/* ======================================================================
   CELFUNCTIES — EDITABLE
   ====================================================================== */
function getWeekdagAfkorting(isoDatum) {
    if (!isoDatum) return "";

    /*
     * T12:00:00 voorkomt dat een datum door tijdzoneverschillen
     * onverwacht naar de vorige dag verschuift.
     */
    const datum = new Date(`${isoDatum}T12:00:00`);

    const weekdagen = [
        "Zo",
        "Ma",
        "Di",
        "Wo",
        "Do",
        "Vr",
        "Za"
    ];

    return weekdagen[datum.getDay()] || "";
}
function makeEditableCell(o, field, extraClass = "", type = "text") {
    const td = document.createElement("td");

    if (extraClass) {
        td.classList.add(extraClass);
    }

    const value = o[field];

    if (field === "datum" && value) {
        const weekdag = getWeekdagAfkorting(value);

        if (o.typeOpkomst === "kamp" && o.einddatum) {
            td.innerHTML = `
                <span class="date-weekday">${weekdag}</span>
                <span>${escapeHtml(formatDateRange(value, o.einddatum))}</span>
            `;
        } else {
            td.innerHTML = `
                <span class="date-weekday">${weekdag}</span>
                <span>${escapeHtml(formatDateDisplay(value))}</span>
            `;
        }
    } else if (
        ["thema", "bijzonderheden", "notities"].includes(field) &&
        /https?:\/\//i.test(String(value || ""))
    ) {
        // Links klikbaar maken (veilig: linkifyText escapet eerst).
        td.innerHTML = linkifyText(value);
        td.querySelectorAll("a").forEach(a =>
            a.addEventListener("click", e => e.stopPropagation())
        );
    } else {
        td.textContent = value ?? "";
    }

    return td;
}

function getOpkomstTypeLabel(
    typeOpkomst
) {
    const labels = {
        normaal:
            "Normaal",

        bijzonder:
            "Bijzonder",

        kamp:
            "Kamp",

        geen:
            "Geen opkomst"
    };


    return (
        labels[typeOpkomst] ||
        typeOpkomst ||
        "—"
    );
}
/* ======================================================================
   CELFUNCTIES — DROPDOWN
   ====================================================================== */

function makeRestrictedEditable(
    o,
    field,
    opties,
    extraClass = ""
) {
    const td =
        document.createElement("td");


    if (extraClass) {
        td.classList.add(
            extraClass
        );
    }


    const value =
        o[field] || "";


    if (
        field === "typeOpkomst"
    ) {
        /*
         * Op Rovers overschrijven we alleen
         * de zichtbare tekst.
         *
         * o.typeOpkomst zelf blijft bijvoorbeeld
         * 'kamp' of 'bijzonder', zodat de bestaande
         * rijkleur behouden blijft.
         */

        if (
            o.isGedeeldeStamOpkomst
        ) {
            td.textContent =
                "Stamopkomst";

            td.classList.add(
                "shared-stam-type"
            );

            td.title =
                `Oorspronkelijk type: ${
                    getOpkomstTypeLabel(
                        value
                    )
                }`;

        } else {
            td.textContent =
                getOpkomstTypeLabel(
                    value
                );
        }

    } else {
        td.textContent =
            value || "—";
    }


    return td;
}

/* ======================================================================
   AANWEZIGHEID
   ====================================================================== */
/* ======================================================================
   AANWEZIGHEID — ROVER ↔ STAM CONTEXT
====================================================================== */

/*
 * Geeft voor een zichtbare tabelcel terug:
 *
 * - welk ID in Firebase gebruikt moet worden;
 * - naar welke speltak geschreven moet worden;
 * - of de cel daadwerkelijk beschikbaar is.
 *
 * `displayKey` blijft het Rover-ID waarmee de kolom
 * op rovers.html is opgebouwd.
 *
 * `databaseKey` wordt bij een Stamopkomst het
 * gekoppelde Stam-ID.
 */

function getPresenceContext(
    opkomst,
    displayKey,
    isLeidingCell = false
) {
    const targetSpeltak =
        opkomst?.bronSpeltak ||
        speltak;


    /*
     * Gewone opkomst van de huidige planning.
     */

    if (
        !opkomst
            ?.isGedeeldeStamOpkomst
    ) {
        return {
            available:
                true,

            displayKey,

            databaseKey:
                displayKey,

            targetSpeltak,

            isSharedStam:
                false
        };
    }


    /*
     * De gedeelde Stamopkomst gebruikt op Rovers
     * uitsluitend gekoppelde jeugd-/ledenrecords.
     *
     * Leidingaanwezigheid van Stam wordt niet via
     * de Roverplanning beheerd.
     */

    if (isLeidingCell) {
        return {
            available:
                false,

            displayKey,

            databaseKey:
                "",

            targetSpeltak:
                "stam",

            isSharedStam:
                true,

            reason:
                "Stamleiding wordt beheerd via de Stamplanning."
        };
    }


    const roverMember =
        jeugd.find(
            member =>
                member.id ===
                displayKey
        );


    const linkedStamMemberId =
        roverMember
            ?.linkedStamMemberId ||
        "";


    if (!linkedStamMemberId) {
        return {
            available:
                false,

            displayKey,

            databaseKey:
                "",

            targetSpeltak:
                "stam",

            isSharedStam:
                true,

            reason:
                "Dit Roverlid is nog niet gekoppeld aan een Stamlid."
        };
    }


    return {
        available:
            true,

        displayKey,

        databaseKey:
            linkedStamMemberId,

        targetSpeltak:
            "stam",

        isSharedStam:
            true
    };
}


/*
 * Status van één aanwezigheidscel ophalen.
 */

function getPresenceStatus(
    opkomst,
    displayKey,
    isLeidingCell = false
) {
    const context =
        getPresenceContext(
            opkomst,
            displayKey,
            isLeidingCell
        );


    if (
        !context.available ||
        !context.databaseKey
    ) {
        return {
            context,

            status:
                null
        };
    }


    return {
        context,

        status:
            opkomst
                ?.aanwezigheid
                ?.[context.databaseKey] ||
            "onbekend"
    };
}

function makePresenceCell(
    o,
    key,
    hidden,
    isLeidingCell
) {
    const td =
        document.createElement("td");


    /*
     * Basisclasses.
     */

    if (hidden) {
        td.classList.add(
            "hide-view"
        );
    }


    if (isLeidingCell) {
        td.classList.add(
            "col-leiding"
        );


        if (!isLeiding()) {
            td.classList.add(
                "hide-view"
            );
        }

    } else {
        td.classList.add(
            "col-jeugd"
        );
    }


    /*
     * Het zichtbare lid in de huidige planning zoeken.
     */

    const member =
        key.startsWith("leiding-")
            ? leiding.find(
                leidingMember =>
                    leidingMember.id ===
                    key.replace(
                        "leiding-",
                        ""
                    )
            )
            : jeugd.find(
                jeugdMember =>
                    jeugdMember.id ===
                    key
            );


    if (!member) {
        td.classList.add(
            "hide-view"
        );

        return td;
    }


    /*
     * Scouts: bestaand kleuraccent per ploeg behouden.
     */

    if (
        speltak === "scouts" &&
        !isLeidingCell
    ) {
        const ploeg =
            (
                member.Ploeg ||
                ""
            ).toLowerCase();


        td.classList.add(
            "scouts-accent"
        );


        if (ploeg === "sperwer") {
            td.classList.add(
                "presence-scout-sperwer"
            );

        } else if (
            ploeg === "kievit"
        ) {
            td.classList.add(
                "presence-scout-kievit"
            );

        } else if (
            ploeg === "reiger"
        ) {
            td.classList.add(
                "presence-scout-reiger"
            );

        } else if (
            ploeg === "meeuw"
        ) {
            td.classList.add(
                "presence-scout-meeuw"
            );
        }
    }


    const {
        context,
        status
    } =
        getPresenceStatus(
            o,
            key,
            isLeidingCell
        );


    /*
     * Geen gekoppeld Stamlid:
     * toon een neutrale, niet-klikbare cel.
     */

    if (
        !context.available
    ) {
        td.textContent =
            "—";

        td.classList.add(
            "presence-cell",
            "presence-unavailable"
        );

        td.title =
            context.reason ||
            "Aanwezigheid is hier niet beschikbaar.";

        td.setAttribute(
            "aria-label",
            td.title
        );

        return td;
    }


    const currentStatus =
        status ||
        "onbekend";


    const symbols = {
        aanwezig:
            "✅",

        afwezig:
            "✖️",

        onbekend:
            "❓",

        urgent:
            "⚠️"
    };


    td.textContent =
        symbols[currentStatus] ||
        "❔";


    td.classList.add(
        "presence-cell",
        `presence-${currentStatus}`
    );


    /*
     * Handige informatie voor inspectie en styling.
     */

    td.dataset.displayMemberId =
        key;

    td.dataset.databaseMemberId =
        context.databaseKey;

    td.dataset.presenceSpeltak =
        context.targetSpeltak;


    /*
     * Jeugd/leden: altijd klikbaar, ook voor ouders.
     */

    if (!isLeidingCell) {
        td.classList.add(
            "editable-cell"
        );


        td.addEventListener(
            "click",
            () =>
                togglePresence(
                    o,
                    key,
                    false
                )
        );


    /*
     * Leiding: alleen aanklikbaar door leiding.
     */

    } else if (isLeiding()) {
        td.classList.add(
            "editable-cell"
        );


        td.addEventListener(
            "click",
            () =>
                togglePresence(
                    o,
                    key,
                    true
                )
        );
    }


    return td;
}

let heeftBevestigd3Dagen = sessionStorage.getItem("heeftBevestigd3Dagen");

async function togglePresence(
    o,
    key,
    isLeidingCell = false
) {
    // Bij een kamp telt de laatste dag (een lopend kamp is niet voorbij).
    const datumOpkomst =
        new Date(
            `${isOpkomstVoorbij(o) ? o.datum : todayISO()}T12:00:00`
        );

    const vandaag =
        new Date();


    vandaag.setHours(
        0,
        0,
        0,
        0
    );


    /*
     * Verleden: ouders kunnen niets meer wijzigen; leiding wel, zodat
     * de aanwezigheid achteraf netjes bijgewerkt kan worden.
     */

    if (
        datumOpkomst <
        vandaag &&
        !isLeiding()
    ) {
        await toonMelding(
            "Datum verstreken",
            "Deze opkomst is al geweest. Neem contact op met de leiding als de aanwezigheid niet klopt."
        );

        return;
    }


    /*
     * Binnen drie dagen bevestiging vragen.
     */

    const alBevestigd =
        sessionStorage.getItem(
            "heeftBevestigd3Dagen"
        ) === "true";


    if (
        !isLeiding() &&
        isBinnen3Dagen(
            o.datum
        ) &&
        !alBevestigd
    ) {
        const bevestigd =
            await toonWaarschuwing(
                "Bevestigen",
                "Let op: deze opkomst is binnen 3 dagen. Heb je dit doorgegeven aan je leiding?"
            );


        if (!bevestigd) {
            return;
        }


        sessionStorage.setItem(
            "heeftBevestigd3Dagen",
            "true"
        );
    }


    const {
        context,
        status:
            huidigeStatus
    } =
        getPresenceStatus(
            o,
            key,
            isLeidingCell
        );


    /*
     * Bijvoorbeeld een ongekoppeld Roverlid.
     */

    if (
        !context.available ||
        !context.databaseKey
    ) {
        await toonMelding(
            "Niet gekoppeld",
            context.reason ||
            "Deze aanwezigheid kan niet worden aangepast."
        );

        return;
    }


    const nieuweStatus =
        huidigeStatus === "onbekend"
            ? "aanwezig"
            : huidigeStatus === "aanwezig"
                ? "afwezig"
                : "onbekend";


    try {
        const updates = {};


        /*
         * Jeugd/leden wordt altijd in public opgeslagen.
         *
         * Dit pad is ook door ouders beschrijfbaar.
         */

        if (!isLeidingCell) {
            updates[
                `${context.targetSpeltak}/public/opkomsten/${o.id}/aanwezigheid/${context.databaseKey}`
            ] =
                nieuweStatus;
        }


        /*
         * Private aanwezigheid alleen bijwerken wanneer
         * de gebruiker daadwerkelijk rechten heeft voor
         * de doelspeltak.
         *
         * Dit voorkomt dat een Roverleider bij een
         * Stamopkomst een atomische update laat mislukken.
         */

        if (
            auth.currentUser &&
            hasSpeltakRechtenVoor(
                context.targetSpeltak
            )
        ) {
            updates[
                `${context.targetSpeltak}/opkomsten/${o.id}/aanwezigheid/${context.databaseKey}`
            ] =
                nieuweStatus;
        }


        /*
         * Een leidingcel heeft geen openbaar pad.
         * Zonder private rechten kan deze dus niet
         * worden gewijzigd.
         */

        if (
            isLeidingCell &&
            !hasSpeltakRechtenVoor(
                context.targetSpeltak
            )
        ) {
            await toonMelding(
                "Geen toegang",
                "Je hebt geen rechten om deze leidingaanwezigheid te wijzigen."
            );

            return;
        }


        if (
            Object.keys(updates).length ===
            0
        ) {
            return;
        }


        await update(
            ref(db),
            updates
        );


        /*
         * Direct lokaal bijwerken.
         *
         * Hierdoor reageert de cel meteen, ook voordat
         * Firebase opnieuw volledig is ingeladen.
         */

        o.aanwezigheid = {
            ...(
                o.aanwezigheid ||
                {}
            ),

            [context.databaseKey]:
                nieuweStatus
        };


        await loadEverything();

    } catch (error) {
        console.error(
            "Fout bij opslaan aanwezigheid:",
            {
                error,
                opkomstId:
                    o.id,
                targetSpeltak:
                    context.targetSpeltak,
                displayKey:
                    key,
                databaseKey:
                    context.databaseKey
            }
        );


        await toonMelding(
            "Opslaan mislukt",
            "De aanwezigheid kon niet worden opgeslagen. Probeer het opnieuw."
        );
    }
}

async function toonWaarschuwing(titel, bericht) {
    const dialog = document.getElementById("waarschuwingPopup");
    document.getElementById("popupTitel").innerText = titel;
    document.getElementById("popupTekst").innerText = bericht;

    dialog.showModal();

    // Wacht tot de gebruiker op een knop in het formulier klikt
    const returnValue = await new Promise(resolve => {
        dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
    });

    // Retourneert true als op "Ja..." geklikt is, false bij "Annuleren"
    return returnValue === "confirm";
}

function toonMelding(titel, tekst) {
    return new Promise((resolve) => {
        // Maak de overlay aan
        const overlay = document.createElement('div');
        // Gebruik de class die je al hebt voor je andere popups (bijv. 'popup-overlay')
        overlay.className = 'popup-overlay';

        // Zorg voor de HTML structuur
        overlay.innerHTML = `
            <div class="popup-box">
                <h3>${escapeHtml(titel)}</h3>
                <p>${escapeHtml(tekst)}</p>
                <button id="ok-btn">OK</button>
            </div>
        `;

        document.body.appendChild(overlay);

        // Zorg dat de OK knop de popup verwijdert
        document.getElementById('ok-btn').addEventListener('click', () => {
            overlay.remove();
            resolve();
        });
    });
}
function countPresence(
    o
) {
    let jeugdCount =
        0;

    let leidingCount =
        0;


    /*
     * Gedeelde Stamopkomst op rovers.html:
     *
     * tel alle zichtbare Stamleden uit de publieke
     * Stamledenlijst, dus niet alleen gekoppelde Rovers.
     */

    if (
        speltak === "rovers" &&
        o.isGedeeldeStamOpkomst
    ) {
        sharedStamMembers.forEach(
            stamMember => {
                if (stamMember.hidden) {
                    return;
                }


                if (
                    o.aanwezigheid
                        ?.[stamMember.id] ===
                    "aanwezig"
                ) {
                    jeugdCount++;
                }
            }
        );


    /*
     * Alle normale opkomsten en de Stampagina zelf.
     */

    } else {
        jeugd.forEach(
            member => {
                if (member.hidden) {
                    return;
                }


                const {
                    context,
                    status
                } =
                    getPresenceStatus(
                        o,
                        member.id,
                        false
                    );


                if (
                    context.available &&
                    status === "aanwezig"
                ) {
                    jeugdCount++;
                }
            }
        );
    }


    /*
     * Leiding blijft volgens de gewone paginalogica tellen.
     *
     * Rovers en Stam zijn leden-only speltakken, waardoor
     * config.showLeiding daar normaal gesproken false is.
     */

    if (config.showLeiding) {
        leiding.forEach(
            member => {
                if (member.hidden) {
                    return;
                }


                const {
                    context,
                    status
                } =
                    getPresenceStatus(
                        o,
                        `leiding-${member.id}`,
                        true
                    );


                if (
                    context.available &&
                    status === "aanwezig"
                ) {
                    leidingCount++;
                }
            }
        );
    }


    /*
     * Kijkers blijven meetellen zoals op stam.html.
     */

    if (
        config.showKijkers !==
        false
    ) {
        jeugdCount +=
            Number(
                o.kijkers ||
                0
            );
    }


    if (
        config.showExtraLeiding !==
        false
    ) {
        leidingCount +=
            Number(
                o.extraAantal ||
                0
            );
    }


    return [
        jeugdCount,
        leidingCount
    ];
}

/* ======================================================================
   LEDENBEHEER
   ====================================================================== */
function renderLedenbeheer() {
    const jeugdContainer = document.getElementById("jeugdLeden");
    const leidingContainer = ledenbeheerLeiding;

    // jeugdContainer is verplicht; leidingContainer alleen als we leiding tonen
    if (!jeugdContainer) return;
    if (config.showLeiding && !leidingContainer) return;

    const ledenOnly = !config.showLeiding;

    // Kopjes / kolommen aanpassen in leden-only speltakken (rovers/stam)
    const jeugdCol = jeugdContainer.closest(".ledenbeheer-col");
    const jeugdH3 = jeugdCol?.querySelector("h3");
    if (jeugdH3) jeugdH3.textContent = ledenOnly ? "Leden" : "Jeugdleden";

    const leidingCol = leidingContainer?.closest(".ledenbeheer-col");
    if (leidingCol) leidingCol.style.display = ledenOnly ? "none" : "";

    // Melding “te weinig leiding” is irrelevant bij leden-only
    const leidingMeldingRow =
        document.getElementById("meldingLeidingAan")?.closest(".meldingen-row");
    if (leidingMeldingRow) leidingMeldingRow.style.display = ledenOnly ? "none" : "";

    // Scouts hebben eigen systeem
    if (speltak === "scouts") return renderLedenbeheerScouts();

    // Welpen: bestaande nestlogica
    if (speltak === "welpen") {
        jeugdContainer.innerHTML = "";
        if (leidingContainer) leidingContainer.innerHTML = "";

        const byNest = {};
        jeugd.forEach(j => {
            const key = j.Nest || "";
            if (!byNest[key]) byNest[key] = [];
            byNest[key].push(j);
        });

        Object.keys(byNest)
            .sort((a, b) => getNestIndex(a) - getNestIndex(b))
            .forEach(nest => {
                const niceName =
                    nest === "zwart" ? "Zwart" :
                        nest === "bruin" ? "Bruin" :
                            nest === "wit" ? "Wit" :
                                nest === "grijs" ? "Grijs" :
                                    "Nestloos";

                const header = document.createElement("div");
                header.className = "nest-header";
                header.textContent = niceName;
                jeugdContainer.appendChild(header);

                byNest[nest]
                    .sort((a, b) => a.volgorde - b.volgorde)
                    .forEach(j => jeugdContainer.appendChild(makeMemberRow(j, "jeugd")));
            });

        if (!ledenOnly && leidingContainer) {
            leiding.forEach(l => leidingContainer.appendChild(makeMemberRow(l, "leiding")));
        }
        return;
    }

    // Overige speltakken: simpele lijst
    jeugdContainer.innerHTML = "";
    if (leidingContainer) leidingContainer.innerHTML = "";

    jeugd.forEach(j => jeugdContainer.appendChild(makeMemberRow(j, "jeugd")));

    if (!ledenOnly && leidingContainer) {
        leiding.forEach(l => leidingContainer.appendChild(makeMemberRow(l, "leiding")));
    }
}

function makeMemberRow(obj, type) {
    const li =
        document.createElement("li");

    li.classList.add("draggable");

    li.draggable = true;

    li.dataset.id =
        obj.id;

    li.dataset.type =
        type;


    if (obj.hidden) {
        li.classList.add(
            "lid-verborgen"
        );
    }


    /*
     * Alleen de naam wordt zichtbaar.
     * De volledige rij opent de ledenmodal.
     */

    li.innerHTML = `
        <button
            type="button"
            class="member-row-button"
            aria-label="${escapeHtml(obj.naam)} openen"
            title="${
                obj.hidden
                    ? `${escapeHtml(obj.naam)} — verborgen`
                    : escapeHtml(obj.naam)
            }"
        >
            <span class="member-row-name">
                ${escapeHtml(obj.naam)}
            </span>
        </button>
    `;


    const memberButton =
        li.querySelector(
            ".member-row-button"
        );


    memberButton?.addEventListener(
        "click",
        event => {
            event.stopPropagation();

            openEditMember(
                obj,
                type
            );
        }
    );


    /* ================================================================
       DRAG & DROP
    ================================================================ */

    function onDragStart(event) {
        event.dataTransfer.effectAllowed =
            "move";

        event.dataTransfer.setData(
            "text/plain",
            li.dataset.id
        );
    }


    function onDragOver(event) {
        event.preventDefault();

        li.classList.add(
            "drag-over"
        );
    }


    function onDragLeave() {
        li.classList.remove(
            "drag-over"
        );
    }


    function onDrop(event) {
        event.preventDefault();

        li.classList.remove(
            "drag-over"
        );


        const draggedId =
            event.dataTransfer.getData(
                "text/plain"
            );

        const targetId =
            li.dataset.id;


        if (
            draggedId === targetId
        ) {
            return;
        }


        const list =
            type === "jeugd"
                ? jeugd
                : leiding;


        const dragged =
            list.find(
                member =>
                    member.id === draggedId
            );

        const target =
            list.find(
                member =>
                    member.id === targetId
            );


        if (
            !dragged ||
            !target
        ) {
            renderLedenbeheer();

            return;
        }


        const oldNest =
            dragged.Nest || "";

        const newNest =
            target.Nest || "";


        /*
         * Bij Welpen bevestigen wanneer een lid
         * naar een ander nest wordt verplaatst.
         */

        if (
            speltak === "welpen" &&
            type === "jeugd" &&
            oldNest !== newNest
        ) {
            const oldLabel =
                oldNest || "Nestloos";

            const newLabel =
                newNest || "Nestloos";


            const icons = {
                zwart: "⚫",
                bruin: "🟤",
                wit: "⚪",
                grijs: "⚫"
            };


            const iconOld =
                icons[oldNest] || "";

            const iconNew =
                icons[newNest] || "";


            const confirmed =
                confirm(
                    `${dragged.naam} verplaatsen van ` +
                    `${iconOld} ${oldLabel} naar ` +
                    `${iconNew} ${newLabel}?`
                );


            if (!confirmed) {
                renderLedenbeheer();

                return;
            }


            dragged.Nest =
                newNest;

            dragged.NestLeider =
                false;
        }


        /*
         * Lokale volgorde aanpassen.
         */

        const fromIndex =
            list.indexOf(dragged);

        const toIndex =
            list.indexOf(target);


        list.splice(
            fromIndex,
            1
        );

        list.splice(
            toIndex,
            0,
            dragged
        );


        /*
         * Nieuwe volgorde opslaan.
         */

        const updates = {};


        list.forEach(
            (member, index) => {
                const path =
                    type === "jeugd"
                        ? "jeugdleden"
                        : "leiding";


                updates[
                    `${speltak}/${path}/${member.id}/volgorde`
                ] =
                    index + 1;


                if (
                    type === "jeugd"
                ) {
                    updates[
                        `${speltak}/jeugdleden/${member.id}/Nest`
                    ] =
                        member.Nest || "";


                    updates[
                        `${PUBLIC_ROOT}/jeugdleden/${member.id}/volgorde`
                    ] =
                        index + 1;


                    updates[
                        `${PUBLIC_ROOT}/jeugdleden/${member.id}/Nest`
                    ] =
                        member.Nest || "";
                }
            }
        );


        update(
            ref(db),
            updates
        ).then(
            loadEverything
        );
    }


    li.addEventListener(
        "dragstart",
        onDragStart
    );

    li.addEventListener(
        "dragover",
        onDragOver
    );

    li.addEventListener(
        "drop",
        onDrop
    );

    li.addEventListener(
        "dragleave",
        onDragLeave
    );


    return li;
}

function handleMemberAction(obj, type, act) {
    if (!isLeiding()) {
        alert("Alleen leiding kan leden beheren.");
        return;
    }

    const path = type === "jeugd" ? "jeugdleden" : "leiding";
    const list = type === "jeugd" ? jeugd : leiding;
    const basePath = `${speltak}/${path}/${obj.id}`;
    const baseRef = ref(db, basePath);

    // Bewerken van lid
    if (act === "edit") {
        if (!isLeiding()) return;

        openEditMember(obj, type);
        return;
    }

    // Verwijderen
    if (act === "del") {
        if (confirm(`Verwijder ${obj.naam}?`)) {
            const delUpdates = { [basePath]: null };
            if (type === "jeugd") {
                delUpdates[`${PUBLIC_ROOT}/jeugdleden/${obj.id}`] = null;
            }
            update(ref(db), delUpdates)
                .then(loadEverything)
                .catch(error => {
                    console.error("Verwijderen lid mislukt:", error);
                    alert("Verwijderen is mislukt. Probeer het opnieuw.");
                });
        }
        return;
    }

    // Verborgen / zichtbaar wisselen
    if (act === "toggle") {
        const hideUpdates = {
            [`${basePath}/hidden`]: !obj.hidden
        };
        if (type === "jeugd") {
            hideUpdates[`${PUBLIC_ROOT}/jeugdleden/${obj.id}/hidden`] = !obj.hidden;
        }
        update(ref(db), hideUpdates)
            .then(loadEverything)
            .catch(error => {
                console.error("Zichtbaarheid wijzigen mislukt:", error);
                alert("Wijzigen is mislukt. Probeer het opnieuw.");
            });
        return;
    }

}

/* ======================================================================
   LEDENMODAL — BEHEERSTATUS BIJWERKEN
====================================================================== */

function updateMemberManagementActions(
    member = editingMemberObject
) {
    const isEditing =
        !!editingMemberId &&
        !!member;


    memberManagementActions
        ?.classList
        .toggle(
            "hidden",
            !isEditing
        );


    if (!isEditing) {
        return;
    }


    const isHidden =
        !!member.hidden;


    if (toggleMemberVisibilityText) {
        toggleMemberVisibilityText.textContent =
            isHidden
                ? "Lid tonen"
                : "Lid verbergen";
    }


    if (toggleMemberVisibilityIcon) {
        toggleMemberVisibilityIcon.textContent =
            isHidden
                ? "◉"
                : "◌";
    }


    toggleMemberVisibilityButton
        ?.classList
        .toggle(
            "is-show-action",
            isHidden
        );


    toggleMemberVisibilityButton
        ?.setAttribute(
            "aria-label",
            isHidden
                ? `${member.naam} tonen`
                : `${member.naam} verbergen`
        );
}

function openEditMember(obj, type) {
    if (!isLeiding()) return;

   
// Titel aanpassen
const title =
    memberModalTitle ||
    memberModal.querySelector("h3");

if (title) {
    title.textContent =
        "Lid bewerken";
}


// Type vastzetten tijdens bewerken
memberType.value = type;
memberType.disabled = true;

memberName.value = obj.naam || "";

editingMemberId =
    obj.id;

editingMemberType =
    type;

editingMemberObject =
    obj;

/*
 * Tijdens bewerken maken we niet automatisch
 * een nieuw record in de andere planning.
 */

roverAutomaticStamNotice
    ?.classList
    .add("hidden");


if (memberIsRover) {
    const isAlreadyLinked =
        !!obj.linkedRoverMemberId;

    memberIsRover.checked =
        isAlreadyLinked;

    /*
     * Een bestaande koppeling mag niet per ongeluk
     * door het vinkje worden verwijderd.
     */

    memberIsRover.disabled =
        isAlreadyLinked;
}

/*
 * Het Stam-vinkje blijft bij een bestaand Stamlid
 * zichtbaar als informatie over de koppeling.
 *
 * De daadwerkelijke logica voor een bestaand,
 * nog niet gekoppeld Stamlid voegen we later toe.
 */

if (stamRoverOption) {
    stamRoverOption.classList.toggle(
        "hidden",
        speltak !== "stam"
    );
}



if (
    speltak === "rovers" &&
    type === "jeugd"
) {
    if (obj.linkedStamMemberId) {
        showMemberModalLinkStatus(
            "Dit Roverlid is gekoppeld aan een lid in de Stamplanning.",
            "linked"
        );
    } else {
        showMemberModalLinkStatus(
            "Dit Roverlid is nog niet gekoppeld aan een Stamlid.",
            "warning"
        );
    }

} else if (
    speltak === "stam" &&
    type === "jeugd"
) {
    if (obj.linkedRoverMemberId) {
        showMemberModalLinkStatus(
            "Dit Stamlid is gekoppeld aan een lid in de Roversplanning.",
            "linked"
        );
    } else {
        showMemberModalLinkStatus(
            "Dit Stamlid is niet gekoppeld aan een Roverlid.",
            "neutral"
        );
    }

} else {
    showMemberModalLinkStatus("");
}
    if (speltak === "welpen" && welpenExtraFields) {

        memberWelpenNaam.value = obj.WelpenNaam || "";

        if (type === "jeugd") {
            memberNest.parentElement.style.display = "block";
            memberNestLeider.parentElement.style.display = "block";

            memberNest.value = (obj.Nest || "").toLowerCase();
            memberNestLeider.checked = !!obj.NestLeider;

        } else {
            // Leiding → wel WelpenNaam, geen nestinfo
            memberNest.parentElement.style.display = "none";
            memberNestLeider.parentElement.style.display = "none";
        }

        welpenExtraFields.classList.remove("hidden");
        welpenExtraFields.style.display = "block";
    }

    // SCOUTS — juiste werking bij bewerken
    if (speltak === "scouts" && scoutsExtraFields) {

        fillScoutsPloegDropdown();

        if (type === "jeugd") {
            memberPloeg.value = obj.Ploeg || "";
            memberPL.checked = !!obj.PL;
            memberAPL.checked = !!obj.APL;

            const heeftPloeg = memberPloeg.value !== "";
            memberPL.disabled = !heeftPloeg;
            memberAPL.disabled = !heeftPloeg;

            scoutsExtraFields.classList.remove("hidden");
            scoutsExtraFields.style.display = "block";

        } else {
            // Leiding heeft geen scout-extra's
            memberPloeg.value = "";
            memberPL.checked = false;
            memberAPL.checked = false;
            memberPL.disabled = true;
            memberAPL.disabled = true;

            scoutsExtraFields.classList.add("hidden");
            scoutsExtraFields.style.display = "none";
        }
    }
/*
 * Tonen/verbergen en verwijderen activeren.
 */

updateMemberManagementActions(
    obj
);

    memberModal.classList.remove("hidden");
}



/* ======================================================================
   OPEN/CLOSE SECTIONS
   ====================================================================== */
function openSection(section) {
    if (!section) return;
    if (!isLeiding()) return alert("Alleen leiding kan deze sectie openen.");

    section.classList.remove("hidden");
    try { section.scrollIntoView({ behavior: "smooth" }); } catch (e) { }
}

openLedenbeheerButton?.addEventListener("click", () => openSection(ledenbeheerSection));

closeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) target.classList.add("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
});

/* ======================================================================
   MODALS — LEDEN
   ====================================================================== */
addMemberButton?.addEventListener("click", () => {
    if (!isLeiding()) return alert("Alleen leiding kan leden toevoegen.");

    editingMemberId = null;
editingMemberType = null;
editingMemberObject = null;


memberManagementActions
    ?.classList
    .add("hidden");

    const title = memberModal.querySelector("h3");
    if (title) title.textContent = "Nieuw lid toevoegen";

    memberType.disabled = false;
    memberType.value = "jeugd";
    memberName.value = "";

    // WELPEN extra velden resetten
    if (speltak === "welpen" && welpenExtraFields) {
        memberWelpenNaam.value = "";
        memberNest.value = "";
        memberNestLeider.checked = false;
    }

    // WELPEN extra velden resetten (alleen als ze bestaan)
    if (welpenExtraFields) {
        welpenExtraFields.classList.add("hidden");
        welpenExtraFields.style.display = "none";
    }

    // SCOUTS extra velden resetten
    if (scoutsExtraFields) {
        scoutsExtraFields.classList.add("hidden");
        scoutsExtraFields.style.display = "none";
    }

    // SCOUTS extra velden resetten
    if (speltak === "scouts" && scoutsExtraFields) {
        fillScoutsPloegDropdown();
        memberPloeg.value = "";
        memberPL.checked = false;
        memberAPL.checked = false;
        memberPL.disabled = true;
        memberAPL.disabled = true;
    }
    // juiste extra velden tonen obv type + speltak
    toggleWelpenExtraFields();
    toggleScoutsExtraFields();
    memberModal.classList.remove("hidden");

    /*
 * Rover/Stam-koppelvelden resetten.
 */

showMemberModalLinkStatus("");


if (memberIsRover) {
    memberIsRover.checked = false;
    memberIsRover.disabled = false;
}




/*
 * Op Rovers is de automatische Stam-melding
 * bij een nieuw lid altijd zichtbaar.
 */

if (roverAutomaticStamNotice) {
    roverAutomaticStamNotice.classList.toggle(
        "hidden",
        speltak !== "rovers"
    );
}


/*
 * Het Stam-vinkje is alleen relevant
 * bij een nieuw Stamlid.
 */

if (stamRoverOption) {
    stamRoverOption.classList.toggle(
        "hidden",
        speltak !== "stam"
    );
}
});

cancelMember?.addEventListener("click", () => {
    memberModal.classList.add(
        "hidden"
    );

    editingMemberId = null;
    editingMemberType = null;

    memberType.disabled = false;


   if (memberIsRover) {
    memberIsRover.checked = false;
    memberIsRover.disabled = false;
}


  

    showMemberModalLinkStatus("");

editingMemberObject = null;

memberManagementActions
    ?.classList
    .add("hidden");
});

saveMember?.addEventListener("click", async () => {
    if (!isLeiding()) return;

    const naam = memberName.value.trim();
    if (!naam) {
        alert("Naam vereist");
        return;
    }

    const type = memberType.value === "leiding" ? "leiding" : "jeugd";
    const path = type === "jeugd" ? "jeugdleden" : "leiding";
    const isWelpen = speltak === "welpen";
    const isScouts = speltak === "scouts";

    let updateObj = { naam };

    if (isWelpen) {
        const WelpNaam = (memberWelpenNaam?.value || "").trim();
        let Nest = "";
        let NestLeider = false;

        if (type === "jeugd") {
            Nest = (memberNest?.value || "").toLowerCase();
            NestLeider = memberNestLeider.checked && !!Nest;
        }

        updateObj.WelpenNaam = WelpNaam;
        updateObj.Nest = type === "jeugd" ? Nest : "";
        updateObj.NestLeider = type === "jeugd" ? NestLeider : false;
    }

    if (isScouts) {
        let Ploeg = "";
        let PL = false;
        let APL = false;

        if (type === "jeugd") {
            Ploeg = (memberPloeg?.value || "").toLowerCase();
            PL = memberPL.checked;
            APL = memberAPL.checked;
        }

        updateObj.Ploeg = Ploeg;
        updateObj.PL = PL;
        updateObj.APL = APL;
    }

    try {
        // Unieke NestLeider per Nest afdwingen
        if (isWelpen && type === "jeugd" && updateObj.Nest && updateObj.NestLeider) {
            const conflict = jeugd.find(j =>
                j.Nest === updateObj.Nest &&
                j.NestLeider &&
                j.id !== editingMemberId
            );

            if (conflict) {
                const overschrijf = confirm(
                    `Er is al een nestleider (${conflict.naam}) in Nest ${updateObj.Nest}. Overschrijven?`
                );
                if (!overschrijf) return;

                await update(ref(db, `${speltak}/jeugdleden/${conflict.id}`), {
                    NestLeider: false
                });
            }
        }

        // SCOUTS — Uniciteit PL + APL per ploeg
        if (isScouts && type === "jeugd" && updateObj.Ploeg) {

            // Check PL
            if (updateObj.PL) {
                const conflictPL = jeugd.find(j =>
                    j.Ploeg === updateObj.Ploeg &&
                    j.PL &&
                    j.id !== editingMemberId
                );

                if (conflictPL) {
                    const ok = confirm(
                        `Er is al een PL (${conflictPL.naam}) in ploeg ${updateObj.Ploeg}. Overschrijven?`
                    );
                    if (!ok) return;

                    await update(ref(db, `${speltak}/jeugdleden/${conflictPL.id}`), { PL: false });
                }
            }
            // Check APL
            if (updateObj.APL) {
                const conflictAPL = jeugd.find(j =>
                    j.Ploeg === updateObj.Ploeg &&
                    j.APL &&
                    j.id !== editingMemberId
                );

                if (conflictAPL) {
                    const ok = confirm(
                        `Er is al een APL (${conflictAPL.naam}) in ploeg ${updateObj.Ploeg}. Overschrijven?`
                    );
                    if (!ok) return;

                    await update(ref(db, `${speltak}/jeugdleden/${conflictAPL.id}`), { APL: false });
                }
            }
        }

/* ================================================================
   BESTAAND LID BEWERKEN
================================================================ */

if (editingMemberId) {
    const existingMember =
        type === "jeugd"
            ? jeugd.find(
                member =>
                    member.id ===
                    editingMemberId
            )
            : leiding.find(
                member =>
                    member.id ===
                    editingMemberId
            );


    /*
     * Het huidige record bijwerken; jeugdleden in dezelfde
     * atomische update ook naar public spiegelen.
     */

    const memberUpdates = {};
    const memberRoots = type === "jeugd"
        ? [`${speltak}/${path}`, `${PUBLIC_ROOT}/jeugdleden`]
        : [`${speltak}/${path}`];

    for (const root of memberRoots) {
        for (const [key, value] of Object.entries(updateObj)) {
            memberUpdates[`${root}/${editingMemberId}/${key}`] = value;
        }
    }

    await update(ref(db), memberUpdates);


    /*
     * Bij een gekoppeld Rover- of Stamlid
     * de naam in de andere planning synchroniseren.
     */

    if (
        type === "jeugd" &&
        supportsRoverStamLinks() &&
        existingMember
    ) {
        await syncLinkedMemberName(
            speltak,
            existingMember,
            naam
        );
    }


    /*
     * Bestaand, nog niet gekoppeld Stamlid:
     * bij aanvinken alsnog Rover aanmaken.
     */

    if (
        speltak === "stam" &&
        type === "jeugd" &&
        memberIsRover?.checked &&
        !existingMember
            ?.linkedRoverMemberId
    ) {
        await createRoverForExistingStamMember(
            editingMemberId,
            naam
        );
    }


/* ================================================================
   NIEUW LID AANMAKEN
================================================================ */

} else if (
    speltak === "rovers" &&
    type === "jeugd"
) {
    /*
     * Een nieuw Roverlid is automatisch
     * ook een gekoppeld Stamlid.
     */

    await createLinkedRoverAndStamMembers(
        naam,
        {
            roverExtraData:
                updateObj,

            stamExtraData: {}
        }
    );


} else if (
    speltak === "stam" &&
    type === "jeugd" &&
    memberIsRover?.checked
) {
    /*
     * Nieuw Stamlid waarbij expliciet
     * 'Dit lid is ook Rover' is aangevinkt.
     */

    await createLinkedRoverAndStamMembers(
        naam,
        {
            roverExtraData: {},

            stamExtraData:
                updateObj
        }
    );


} else {
    /*
     * Alle andere gevallen blijven werken
     * volgens de bestaande algemene logica.
     */

    const newRef =
        push(
            ref(
                db,
                `${speltak}/${path}`
            )
        );


    const base = {
        hidden: false,
        volgorde: 999,
        ...updateObj
    };


    const newMemberUpdates = {
        [`${speltak}/${path}/${newRef.key}`]: base
    };

    if (type === "jeugd") {
        newMemberUpdates[`${PUBLIC_ROOT}/jeugdleden/${newRef.key}`] = base;
    }

    await update(ref(db), newMemberUpdates);
}

memberModal.classList.add(
    "hidden"
);

editingMemberId = null;
editingMemberType = null;
editingMemberObject = null;

memberType.disabled =
    false;

memberManagementActions
    ?.classList
    .add("hidden");

        await loadEverything();
    } catch (err) {
        console.error(err);
        alert("Opslaan mislukt, probeer het opnieuw.");
    }
});

function openNewOpkomstModal() {
    if (!isLeiding()) return;

    editingOpkomstId = null;
    resetOpkomstFields();

    if (opModalTitle) {
        opModalTitle.textContent = "Nieuwe opkomst";
    }

    opModal.classList.remove("hidden");
}

/* ======================================================================
   GEDEELDE STAMOPKOMST — DOORSTUREN NAAR STAMPLANNING
====================================================================== */

async function openSharedStamOpkomstNotice(
    opkomst
) {
    const datumTekst =
        opkomst?.datum
            ? formatDateDisplay(
                opkomst.datum
            )
            : "deze opkomst";


    const keuze =
        await openMemberActionChoice({
            title:
                "Stamopkomst",

            description:
                `De Stamopkomst van ${datumTekst} is alleen bewerkbaar via de Stam-jaarplanning.`,

            options: [
                {
                    value:
                        "open-stam",

                    title:
                        "Naar de Stam-jaarplanning",

                    primary:
                        true
                }
            ]
        });


    if (
        keuze !== "open-stam"
    ) {
        return;
    }


    /*
     * De opkomst-ID wordt als hash meegestuurd.
     * De bestaande scrollToOpkomstFromHash()-logica
     * kan de juiste rij dan direct opzoeken.
     */

    window.location.href =
        `stam.html#opkomst-${encodeURIComponent(
            opkomst.id
        )}`;
}

function openEditOpkomstModal(opkomst) {
    if (!isLeiding() || !isEdit()) return;

    editingOpkomstId = opkomst.id;

    if (opModalTitle) {
        opModalTitle.textContent = "Opkomst bewerken";
    }

    opDatum.value = opkomst.datum || "";
    opStart.value = opkomst.starttijd || "";
    opEind.value = opkomst.eindtijd || "";
    opThema.value = opkomst.thema || "";
    opProcor.value = opkomst.procor || "";

    if (opBuddy) {
        opBuddy.value = opkomst.buddy || "";
    }

    opType.value = opkomst.typeOpkomst || "normaal";
    opLocatie.value = opkomst.locatie || "";
    opMateriaal.value = opkomst.materiaal || "";
    opBijzonderheden.value = opkomst.bijzonderheden || "";
    if (opNotities) {
        opNotities.value =
            opkomst.notities || "";
    }
    opKijkers.value = Number(opkomst.kijkers || 0);
    opExtraAantal.value = Number(opkomst.extraAantal || 0);
    opExtraNamen.value = opkomst.extraNamen || "";

    if (opBert) {
        opBert.value = opkomst.bert_met || "";
    }

    const isKamp = opType.value === "kamp";

    if (opEindDatumWrapper) {
        opEindDatumWrapper.classList.toggle("hidden", !isKamp);
    }

   if (opEindDatum) {
    if (isKamp) {
        const begindatum =
            opDatum?.value ||
            opkomst.datum ||
            "";

        opEindDatum.min = begindatum;

        opEindDatum.value =
            opkomst.einddatum ||
            begindatum;
    } else {
        opEindDatum.value = "";
        opEindDatum.removeAttribute("min");
    }
}

    opModal.classList.remove("hidden");
}
/* ======================================================================
   MODALS — OPKOMST
   ====================================================================== */
cancelOpkomst?.addEventListener("click", () => {
    editingOpkomstId = null;
    opModal.classList.add("hidden");
});

fab?.addEventListener("click", openNewOpkomstModal);

saveOpkomst?.addEventListener("click", async () => {
    if (!isLeiding()) return;

    if (!opDatum.value) {
        alert("Datum is verplicht.");
        return;
    }
    if (
    opType.value === "kamp" &&
    opEindDatum?.value &&
    opEindDatum.value < opDatum.value
) {
    await toonMelding(
        "Ongeldige einddatum",
        "De einddatum van een kamp kan niet vóór de begindatum liggen."
    );
    return;
}

    const bestaandeOpkomst = editingOpkomstId
        ? opkomsten.find(o => o.id === editingOpkomstId)
        : null;

    const opkomstId = editingOpkomstId ||
        push(ref(db, `${speltak}/opkomsten`)).key;

    const aanwezigheid = {
        ...(bestaandeOpkomst?.aanwezigheid || {})
    };

    // Bij een nieuwe opkomst de aanwezigheid initialiseren.
    if (!bestaandeOpkomst) {
        jeugd.forEach(j => {
            aanwezigheid[j.id] =
                opType.value === "geen" ? "afwezig" : "onbekend";
        });

        leiding.forEach(l => {
            aanwezigheid[`leiding-${l.id}`] =
                opType.value === "geen" ? "afwezig" : "onbekend";
        });
    }

    // Wanneer een bestaande opkomst wordt veranderd in 'geen opkomst',
    // iedereen automatisch op afwezig zetten.
    if (opType.value === "geen") {
        jeugd.forEach(j => {
            aanwezigheid[j.id] = "afwezig";
        });

        leiding.forEach(l => {
            aanwezigheid[`leiding-${l.id}`] = "afwezig";
        });
    }

    const opkomstObj = {
        id: opkomstId,
        datum: isoFromInput(opDatum.value),
        einddatum: opType.value === "kamp"
            ? (opEindDatum?.value || "")
            : "",
        thema: opThema.value || "",
        procor: opProcor.value || "",
        bijzonderheden: opBijzonderheden.value || "",
        notities: opNotities?.value || "",
        typeOpkomst: opType.value || "normaal",
        starttijd: opStart.value || "",
        eindtijd: opEind.value || "",
        locatie: opLocatie.value || "",
        materiaal: opMateriaal.value || "",
        buddy: opBuddy?.value || "",
        kijkers: Number(opKijkers.value || 0),
        extraAantal: Number(opExtraAantal.value || 0),
        extraNamen: opExtraNamen.value || "",
        aanwezigheid
    };

    if (config.showBert) {
        opkomstObj.bert_met = opBert?.value || "";
    }

    const publicAanwezigheid = {};

    jeugd.forEach(j => {
        publicAanwezigheid[j.id] =
            aanwezigheid[j.id] || "onbekend";
    });

    const publicObj = {
        datum: opkomstObj.datum,
        einddatum: opkomstObj.einddatum,
        starttijd: opkomstObj.starttijd,
        eindtijd: opkomstObj.eindtijd,
        thema: opkomstObj.thema,
        bijzonderheden: opkomstObj.bijzonderheden,
        typeOpkomst: opkomstObj.typeOpkomst,
        buddy: opkomstObj.buddy,
        bert_met: opkomstObj.bert_met || "",
        aanwezigheid: publicAanwezigheid
    };

    saveOpkomst.disabled = true;
    saveOpkomst.textContent = "Opslaan…";

    try {
        // Eén atomische update: privé en publiek altijd gelijk.
        await update(ref(db), {
            [`${speltak}/opkomsten/${opkomstId}`]: opkomstObj,
            [`${PUBLIC_ROOT}/opkomsten/${opkomstId}`]: publicObj
        });

        editingOpkomstId = null;
        opModal.classList.add("hidden");

        await loadEverything();

        const row = document.querySelector(
            `tr[data-id="${opkomstId}"]`
        );

        if (row) {
            row.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            row.classList.add("row-highlight");

            setTimeout(() => {
                row.classList.remove("row-highlight");
            }, 2000);
        }
    } catch (err) {
        console.error(err);
        alert("Opslaan mislukt, probeer het opnieuw.");
    } finally {
        saveOpkomst.disabled = false;
        saveOpkomst.textContent = "Opslaan";
    }
});

async function saveRow(tr) {
    const opkomstId = tr.dataset.id;
    if (!opkomstId) return;

    // 1. Verzamel alle ingevulde velden uit de rij
    const updatedData = {};
    const inputs = tr.querySelectorAll("[data-field]");

    inputs.forEach(input => {
        const fieldName = input.dataset.field;
        updatedData[fieldName] = input.value.trim();
    });

    // Einddatum alleen bewaren als type opkomst 'kamp' is
    if (updatedData.typeOpkomst !== "kamp") {
        updatedData.einddatum = null;
    }

    // 2. Schrijf de data weg naar Firebase
    try {
        // Privé + publiek (alleen publieke velden) in één atomische update.
        const rowUpdates = {};
        for (const [key, value] of Object.entries(updatedData)) {
            rowUpdates[`${speltak}/opkomsten/${opkomstId}/${key}`] = value;
            if (isPublicOpkomstField(key)) {
                rowUpdates[`${PUBLIC_ROOT}/opkomsten/${opkomstId}/${key}`] = value;
            }
        }
        if (Object.keys(rowUpdates).length > 0) {
            await update(ref(db), rowUpdates);
        }
    } catch (error) {
        console.error(`Fout bij opslaan van opkomst ${opkomstId}:`, error);
        // Voorheen ging dit stil mis; nu ziet de leiding het.
        await toonMelding(
            "Opslaan mislukt",
            "Een opkomst kon niet worden opgeslagen. Controleer je verbinding en probeer het opnieuw."
        );
    }
}

confirmDeleteOpkomst?.addEventListener("click", () => {
    if (!isLeiding() || !opkomstToDelete) return;

    const o = opkomstToDelete;

    closeDeleteOpkomstModal();

    // Als er al een pending delete is: eerst afronden
    if (pendingDeleteOpkomst?.timeout) {
        clearTimeout(pendingDeleteOpkomst.timeout);
        pendingDeleteOpkomst = null;
        hideUndoBanner();
    }

    // Data veiligstellen voor ongedaan maken
    const snapshot = {
        ...o,
        aanwezigheid: {
            ...(o.aanwezigheid || {})
        }
    };

    // Direct uit de lokale tabel verwijderen
    opkomsten = opkomsten.filter(item => item.id !== o.id);
    renderTable();

    // Pas na de undo-periode definitief verwijderen
    const timeout = setTimeout(async () => {
        try {
            await update(ref(db), {
                [`${speltak}/opkomsten/${o.id}`]: null,
                [`${PUBLIC_ROOT}/opkomsten/${o.id}`]: null
            });

            pendingDeleteOpkomst = null;
            hideUndoBanner();
        } catch (error) {
            console.error("Verwijderen mislukt:", error);

            // Bij een fout de opkomst lokaal terugzetten
            opkomsten.push(snapshot);
            opkomsten = sortOpkomsten(opkomsten);
            renderTable();

            alert("Verwijderen is mislukt. De opkomst is teruggezet.");
        }
    }, 7000);

    pendingDeleteOpkomst = {
        id: o.id,
        data: snapshot,
        timeout
    };

    showUndoBanner();
});

cancelDeleteOpkomst?.addEventListener(
    "click",
    closeDeleteOpkomstModal
);

deleteOpkomstModal?.addEventListener("click", event => {
    if (event.target === deleteOpkomstModal) {
        closeDeleteOpkomstModal();
    }
});

document.addEventListener("keydown", event => {
    if (
        event.key === "Escape" &&
        deleteOpkomstModal &&
        !deleteOpkomstModal.classList.contains("hidden")
    ) {
        closeDeleteOpkomstModal();
    }
});
/* ======================================================================
   PRINT / FILTERS
   ====================================================================== */


filterAll?.addEventListener("click", () => {
    currentFilter = "all";
    filterAll.classList.add("active");
    filterFuture.classList.remove("active");
    filterPast.classList.remove("active");
    renderTable();
});

filterFuture?.addEventListener("click", () => {
    currentFilter = "future";
    filterFuture.classList.add("active");
    filterAll.classList.remove("active");
    filterPast.classList.remove("active");
    renderTable();
});

filterPast?.addEventListener("click", () => {
    currentFilter = "past";
    filterPast.classList.add("active");
    filterAll.classList.remove("active");
    filterFuture.classList.remove("active");
    renderTable();
});


editModeButton?.addEventListener("click", () => {
    if (!isLeiding()) {
        alert("Log in als leiding om te bewerken.");
        return;
    }

    editMode = !editMode;

    editModeButton.textContent = editMode
        ? "💾 Wijzigen opslaan"
        : "✏️ Opkomsten bewerken";

    setMode("leiding");
});

function scrollToOpkomstFromHash() {
    const params = new URLSearchParams(window.location.hash.replace("#", ""));
    const targetDate = params.get("opkomst");
    if (!targetDate) return;

    const row = document.querySelector(
        `tr[data-opkomst-datum="${targetDate}"]`
    );

    if (!row) return;

    // Scroll naar rij
    row.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    // Highlight (hergebruikt bestaande CSS)
    row.classList.add("row-highlight");

    // Highlight na animatie weer verwijderen
    setTimeout(() => {
        row.classList.remove("row-highlight");
    }, 2000);
    // Hash opruimen zodat we niet opnieuw gaan scrollen bij latere renders
    try {
        history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch (e) { }

}


// =====================
// INFO-EDITOR SELECTIE
// =====================
let infoSelection = null;

function storeInfoSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    infoSelection = sel.getRangeAt(0);
}

function restoreInfoSelection() {
    if (!infoSelection) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(infoSelection);
}

// selectie opslaan als je in de editor klikt / typt
infoEdit?.addEventListener("mouseup", storeInfoSelection);
infoEdit?.addEventListener("keyup", storeInfoSelection);
infoEdit?.addEventListener("blur", storeInfoSelection);

/* ======================================================================
   INFO EDIT — Toolbar
   ====================================================================== */
infoEditButton?.addEventListener("click", toggleInfoEdit);

toolbarButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const cmd = btn.dataset.cmd;
        if (!cmd || !infoEdit) return;

        // focus + selectie herstellen in de editor
        infoEdit.focus();
        restoreInfoSelection();

        document.execCommand(cmd, false, null);
    });
});

colorPicker?.addEventListener("change", () => {
    if (!infoEdit) return;

    // focus + selectie herstellen in de editor
    infoEdit.focus();
    restoreInfoSelection();

    document.execCommand("foreColor", false, colorPicker.value);
});

// Plaats dit eenmalig in je initialisatie-code
document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'filterSeizoen') {
        currentSeizoenFilter = e.target.value;
        renderTable(); // Nu wordt deze maar één keer getriggerd per wijziging
    }
});

function renderMeldingen(meldingen) {
    console.log("Meldingen:", meldingen);
    // Voeg hier eventueel code toe om meldingen in een specifieke div te tonen
    // Bijv: document.getElementById('meldingenContainer').innerText = meldingen;
}

async function vraagBevestiging(titel, bericht) {
    const dialog = document.getElementById("waarschuwingPopup");
    document.getElementById("popupTitel").innerText = titel;
    document.getElementById("popupTekst").innerText = bericht;

    dialog.showModal();

    // Wacht tot de gebruiker op een knop klikt die een 'value' teruggeeft
    const returnValue = await new Promise(resolve => {
        // Zorg dat je knoppen in je HTML dit gedrag triggeren
        dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
    });

    return returnValue === "confirm";
}

/* ======================================================================
   DRAG TO SCROLL — Functionaliteit voor table-wrapper
   ====================================================================== */
function initDragToScroll() {
    if (!tableWrapper) return;

    let isDown = false;
    let startX;
    let scrollLeft;

    tableWrapper.addEventListener("mousedown", (e) => {
        // Zorg dat je nog wel op knoppen, inputs of select-velden kunt klikken zonder direct te slepen
        if (e.target.closest("input, select, button, textarea, label")) return;

        isDown = true;
        tableWrapper.classList.add("is-dragging");
        startX = e.pageX - tableWrapper.offsetLeft;
        scrollLeft = tableWrapper.scrollLeft;
    });

    tableWrapper.addEventListener("mouseleave", () => {
        isDown = false;
        tableWrapper.classList.remove("is-dragging");
    });

    tableWrapper.addEventListener("mouseup", () => {
        isDown = false;
        tableWrapper.classList.remove("is-dragging");
    });

    tableWrapper.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - tableWrapper.offsetLeft;
        const walk = (x - startX); // Snelheid van het scrollen (eventueel te vermenigvuldigen met een factor, bijv. * 1.5)
        tableWrapper.scrollLeft = scrollLeft - walk;
    });
}

// Direct aanroepen bij het laden van het script
initDragToScroll();