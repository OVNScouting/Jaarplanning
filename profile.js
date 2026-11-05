/* ======================================================================
   PROFILE.JS — PROFIELBEHEER
   ====================================================================== */

(() => {
  "use strict";

 let database = null;
let auth = null;
let forcedPasswordChange = false;

const $ = id =>
  document.getElementById(id);

const profileLoading =
  $("profileLoading");

const profileContent =
  $("profileContent");

const profileLoadError =
  $("profileLoadError");

const profName =
  $("profName");

const profEmail =
  $("profEmail");

const profRoles =
  $("profRoles");

const pwWarning =
  $("pwWarning");

const openPasswordChangeBtn =
  $("openPasswordChangeBtn");

const pwUpdateModal =
  $("pwUpdateModal");

const closePasswordChangeModal =
  $("closePasswordChangeModal");

const cancelPasswordChangeBtn =
  $("cancelPasswordChangeBtn");

const passwordUpdateForm =
  $("passwordUpdateForm");

const currentPasswordGroup =
  $("currentPasswordGroup");

const currentPassword =
  $("currentPassword");

const newPassword =
  $("newPassword");

const confirmPassword =
  $("confirmPassword");

const passwordFormMessage =
  $("passwordFormMessage");

const btnUpdatePassword =
  $("btnUpdatePassword");

const pwUpdateTitle =
  $("pwUpdateTitle");

const pwUpdateDescription =
  $("pwUpdateDescription");

const passwordChangedModal =
  $("passwordChangedModal");

const passwordChangedOkBtn =
  $("passwordChangedOkBtn");

const btnLogout =
  $("btnLogout");


function openModal(modal) {
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}


function closeModal(modal) {
  if (!modal) return;

  modal.classList.add("hidden");

  if (!document.querySelector(
    ".modal:not(.hidden)"
  )) {
    document.body.classList.remove(
      "modal-open"
    );
  }
}


function setPasswordMessage(
  message = "",
  type = "error"
) {
  if (!passwordFormMessage) return;

  passwordFormMessage.textContent =
    message;

  passwordFormMessage.classList.toggle(
    "hidden",
    !message
  );

  passwordFormMessage.classList.toggle(
    "auth-inline-message-error",
    type === "error"
  );

  passwordFormMessage.classList.toggle(
    "auth-inline-message-success",
    type === "success"
  );
}


function setPasswordBusy(busy) {
  btnUpdatePassword.disabled = busy;

  btnUpdatePassword.textContent = busy
    ? "Wachtwoord opslaan…"
    : "Wachtwoord opslaan";
}


function resetPasswordForm() {
  passwordUpdateForm?.reset();

  setPasswordMessage();

  window.OVNPasswordUI?.initialise(
    pwUpdateModal
  );
}


function configurePasswordModal(isForced) {
  forcedPasswordChange = isForced;

  resetPasswordForm();

  currentPasswordGroup?.classList.toggle(
    "hidden",
    isForced
  );

  closePasswordChangeModal?.classList.toggle(
    "hidden",
    isForced
  );

  cancelPasswordChangeBtn?.classList.toggle(
    "hidden",
    isForced
  );

  pwUpdateTitle.textContent = isForced
    ? "Kies een eigen wachtwoord"
    : "Wachtwoord wijzigen";

  pwUpdateDescription.textContent = isForced
    ? "Je gebruikt een tijdelijk wachtwoord. Kies een eigen wachtwoord voordat je verdergaat."
    : "Bevestig eerst je huidige wachtwoord en kies daarna een nieuw, uniek wachtwoord.";

  btnUpdatePassword.textContent = isForced
    ? "Wachtwoord opslaan en activeren"
    : "Wachtwoord opslaan";
}
  function setPasswordBusy(isBusy) {
    if (!btnUpdatePassword) return;

    btnUpdatePassword.disabled = isBusy;
    btnUpdatePassword.textContent = isBusy
      ? "Wachtwoord opslaan…"
      : "Wachtwoord opslaan en activeren";
  }


  /* ====================================================================
     PROFIEL TONEN
     ==================================================================== */

  function showProfileContent() {
    profileLoading?.classList.add("hidden");
    profileLoadError?.classList.add("hidden");
    profileContent?.classList.remove("hidden");
  }

  function showProfileError() {
    profileLoading?.classList.add("hidden");
    profileContent?.classList.add("hidden");
    profileLoadError?.classList.remove("hidden");
  }

  function createRoleBadge(label, type) {
    const badge = document.createElement("span");

    badge.className =
      `profile-role-badge profile-role-${type}`;

    badge.textContent = label;

    return badge;
  }

  function showEmptyRoles(message) {
    if (!profRoles) return;

    profRoles.innerHTML = "";

    const empty = document.createElement("span");
    empty.className = "profile-role-empty";
    empty.textContent = message;

    profRoles.appendChild(empty);
  }

  function renderRoles(roles = {}) {
    if (!profRoles) return;

    profRoles.innerHTML = "";

    const badges = [];

    if (roles.admin) {
      badges.push({
        label: "Admin",
        type: "admin"
      });
    }

    if (roles.bestuur) {
      badges.push({
        label: "Bestuur",
        type: "bestuur"
      });
    }

    const speltakken = roles.speltakken;

    if (Array.isArray(speltakken)) {
      speltakken.forEach(speltak => {
        badges.push({
          label:
            speltak.charAt(0).toUpperCase() +
            speltak.slice(1),
          type: "speltak"
        });
      });
    } else if (
      speltakken &&
      typeof speltakken === "object"
    ) {
      Object.entries(speltakken).forEach(
        ([speltak, isActive]) => {
          if (!isActive) return;

          badges.push({
            label:
              speltak.charAt(0).toUpperCase() +
              speltak.slice(1),
            type: "speltak"
          });
        }
      );
    }

    if (badges.length === 0) {
      showEmptyRoles(
        "Geen speltakken of rollen toegewezen."
      );
      return;
    }

    badges.forEach(({ label, type }) => {
      profRoles.appendChild(
        createRoleBadge(label, type)
      );
    });
  }

  async function loadUserProfile(uid) {
    try {
      const userRef =
        window._firebase.ref(
          database,
          `users/${uid}`
        );

      const snapshot =
        await window._firebase.get(userRef);

      if (!snapshot.exists()) {
        const fallback =
          window.getAuthSession?.() || {};

        profName.textContent =
          fallback.name || "Nieuwe gebruiker";

        profEmail.textContent =
          fallback.email ||
          "Geen e-mailadres bekend";

        showEmptyRoles(
          "Het profiel wordt nog door de beheerder aangemaakt."
        );

        showProfileContent();
        return;
      }

      const data = snapshot.val() || {};

      profName.textContent =
        data.fullName || "Geen naam ingesteld";

      profEmail.textContent =
        data.email || "Geen e-mailadres bekend";

      renderRoles(data.roles || {});
      showProfileContent();

    } catch (error) {
      console.error(
        "Fout bij laden profiel:",
        error
      );

      showProfileError();
    }
  }


 /* ====================================================================
   AUTH INITIALISATIE
   ==================================================================== */

document.addEventListener(
  "auth-changed",
  async event => {
    if (!event.detail?.loggedIn) {
      window.location.href =
        "index.html";

      return;
    }

    const session =
      window.getAuthSession?.();

    if (!session?.id) {
      window.location.href =
        "index.html";

      return;
    }

    const app =
      window._firebase.getApps().length
        ? window._firebase.getApp()
        : window._firebase.initializeApp(
            window.firebaseConfig
          );

    auth =
      window._firebase.getAuth(app);

    database =
      window._firebase.getDatabase(app);

    /*
     * Alleen een verplichte wijziging (zonder huidig wachtwoord)
     * als dat echt nodig is: het account heeft mustChangePassword
     * in de database, of er is net met het oude standaard-
     * wachtwoord ingelogd. Alleen de URL-parameter is niet genoeg;
     * anders kon iedereen met toegang tot een open sessie het
     * wachtwoord wijzigen zonder het huidige te kennen.
     */
    const forcePasswordChange =
      new URLSearchParams(
        window.location.search
      ).get("force_pw_change") === "true" &&
      (
        session.mustChangePassword === true ||
        window.hasPendingForcedPasswordChange?.() === true
      );

    if (forcePasswordChange) {
      pwWarning?.classList.remove("hidden");

      configurePasswordModal(true);
      openModal(pwUpdateModal);

      window.setTimeout(
        () => newPassword?.focus(),
        100
      );
    }

    await loadUserProfile(session.id);
  }
);


/* ====================================================================
   WACHTWOORDMODAL OPENEN EN SLUITEN
   ==================================================================== */

openPasswordChangeBtn?.addEventListener(
  "click",
  () => {
    configurePasswordModal(false);
    openModal(pwUpdateModal);

    window.setTimeout(
      () => currentPassword?.focus(),
      100
    );
  }
);


closePasswordChangeModal?.addEventListener(
  "click",
  () => {
    if (forcedPasswordChange) return;

    closeModal(pwUpdateModal);
    resetPasswordForm();
  }
);


cancelPasswordChangeBtn?.addEventListener(
  "click",
  () => {
    if (forcedPasswordChange) return;

    closeModal(pwUpdateModal);
    resetPasswordForm();
  }
);


pwUpdateModal?.addEventListener(
  "click",
  event => {
    if (
      event.target === pwUpdateModal &&
      !forcedPasswordChange
    ) {
      closeModal(pwUpdateModal);
      resetPasswordForm();
    }
  }
);


/* ====================================================================
   WACHTWOORD WIJZIGEN
   ==================================================================== */

passwordUpdateForm?.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    setPasswordMessage();

    const currentValue =
      currentPassword?.value || "";

    const newValue =
      newPassword?.value || "";

    const confirmationValue =
      confirmPassword?.value || "";

    if (
      !forcedPasswordChange &&
      !currentValue
    ) {
      setPasswordMessage(
        "Vul je huidige wachtwoord in."
      );

      currentPassword.focus();
      return;
    }

    if (newValue.length < 8) {
      setPasswordMessage(
        "Het nieuwe wachtwoord moet minimaal 8 tekens bevatten."
      );

      newPassword.focus();
      return;
    }

    if (newValue !== confirmationValue) {
      setPasswordMessage(
        "De twee nieuwe wachtwoorden komen niet overeen."
      );

      confirmPassword.focus();
      return;
    }

    if (
      !forcedPasswordChange &&
      currentValue === newValue
    ) {
      setPasswordMessage(
        "Kies een nieuw wachtwoord dat anders is dan je huidige wachtwoord."
      );

      newPassword.focus();
      return;
    }

    setPasswordBusy(true);

    try {
      const user =
        auth?.currentUser;

      if (!user?.email) {
        throw new Error(
          "Er is geen actieve gebruikerssessie gevonden."
        );
      }

      /*
       * Bij een gewone wijziging verifiëren we
       * eerst opnieuw het huidige wachtwoord.
       */
      if (!forcedPasswordChange) {
        const credential =
          window._firebase
            .EmailAuthProvider
            .credential(
              user.email,
              currentValue
            );

        await window._firebase
          .reauthenticateWithCredential(
            user,
            credential
          );
      }

      await window._firebase
        .updatePassword(
          user,
          newValue
        );

      // Verplichte wijziging is afgerond: vlag opruimen.
      window.clearForcedPasswordChange?.();

      if (forcedPasswordChange && database) {
        try {
          await window._firebase.set(
            window._firebase.ref(
              database,
              `users/${user.uid}/mustChangePassword`
            ),
            null
          );
        } catch (flagError) {
          // Niet fataal: het wachtwoord is wel gewijzigd.
          console.warn(
            "Kon mustChangePassword niet opruimen:",
            flagError
          );
        }

        const session = window.getAuthSession?.();
        if (session) {
          session.mustChangePassword = false;
          try {
            localStorage.setItem(
              "ovn_auth_session",
              JSON.stringify(session)
            );
          } catch {}
        }
      }

      closeModal(pwUpdateModal);

      pwWarning?.classList.add("hidden");

      openModal(passwordChangedModal);

    } catch (error) {
      console.error(
        "Wachtwoord wijzigen mislukt:",
        error
      );

      const messages = {
        "auth/invalid-credential":
          "Het huidige wachtwoord is niet correct.",

        "auth/wrong-password":
          "Het huidige wachtwoord is niet correct.",

        "auth/weak-password":
          "Kies een sterker wachtwoord.",

        "auth/too-many-requests":
          "Er zijn te veel pogingen gedaan. Probeer het later opnieuw.",

        "auth/network-request-failed":
          "De verbinding is mislukt. Controleer je internetverbinding.",

        "auth/requires-recent-login":
          "Log opnieuw in en probeer daarna nogmaals je wachtwoord te wijzigen."
      };

      setPasswordMessage(
        messages[error.code] ||
        error.message ||
        "Het wachtwoord kon niet worden gewijzigd."
      );

    } finally {
      setPasswordBusy(false);
    }
  }
);


/* ====================================================================
   SUCCES EN UITLOGGEN
   ==================================================================== */

passwordChangedOkBtn?.addEventListener(
  "click",
  () => {
    closeModal(passwordChangedModal);
    resetPasswordForm();

    history.replaceState(
      {},
      document.title,
      window.location.pathname
    );

    /*
     * Alleen na een verplichte wijziging
     * terug naar de homepage.
     */
    if (forcedPasswordChange) {
      window.location.href =
        "index.html";
    }
  }
);


btnLogout?.addEventListener(
  "click",
  async () => {
    if (auth) {
      await window._firebase.signOut(auth);
    }

    window.location.href =
      "index.html";
  }
);

})();