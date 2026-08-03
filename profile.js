/* ======================================================================
   PROFILE.JS — PROFIELBEHEER
   ====================================================================== */

(() => {
  "use strict";

  let database = null;

  const profileLoading =
    document.getElementById("profileLoading");

  const profileContent =
    document.getElementById("profileContent");

  const profileLoadError =
    document.getElementById("profileLoadError");

  const profName =
    document.getElementById("profName");

  const profEmail =
    document.getElementById("profEmail");

  const profRoles =
    document.getElementById("profRoles");

  const pwWarning =
    document.getElementById("pwWarning");

  const pwUpdateModal =
    document.getElementById("pwUpdateModal");

  const reauthErrorModal =
    document.getElementById("reauthErrorModal");

  const passwordChangedModal =
    document.getElementById("passwordChangedModal");

  const passwordUpdateForm =
    document.getElementById("passwordUpdateForm");

  const newPassword =
    document.getElementById("newPassword");

  const confirmPassword =
    document.getElementById("confirmPassword");

  const passwordFormMessage =
    document.getElementById("passwordFormMessage");

  const btnUpdatePassword =
    document.getElementById("btnUpdatePassword");

  const btnReauthLogin =
    document.getElementById("btnReauthLogin");

  const passwordChangedOkBtn =
    document.getElementById("passwordChangedOkBtn");


  /* ====================================================================
     MODAL HELPERS
     ==================================================================== */

  function openModal(modal) {
    if (!modal) return;

    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function closeModal(modal) {
    if (!modal) return;

    modal.classList.add("hidden");

    const hasOpenModal =
      document.querySelector(".modal:not(.hidden)");

    if (!hasOpenModal) {
      document.body.classList.remove("modal-open");
    }
  }


  /* ====================================================================
     FEEDBACK
     ==================================================================== */

  function showPasswordMessage(message) {
    if (!passwordFormMessage) return;

    passwordFormMessage.textContent = message;
    passwordFormMessage.classList.remove("hidden");
  }

  function clearPasswordMessage() {
    if (!passwordFormMessage) return;

    passwordFormMessage.textContent = "";
    passwordFormMessage.classList.add("hidden");
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
      const loggedIn =
        Boolean(event.detail?.loggedIn);

      if (!loggedIn) {
        window.location.href = "index.html";
        return;
      }

      const session =
        window.getAuthSession?.();

      if (!session?.id) {
        window.location.href = "index.html";
        return;
      }

      const app =
        window._firebase.getApps().length
          ? window._firebase.getApp()
          : window._firebase.initializeApp(
              window.firebaseConfig
            );

      database =
        window._firebase.getDatabase(app);

      const urlParams =
        new URLSearchParams(
          window.location.search
        );

      if (
        urlParams.get("force_pw_change") ===
        "true"
      ) {
        pwWarning?.classList.remove("hidden");
        openModal(pwUpdateModal);

        window.setTimeout(() => {
          newPassword?.focus();
        }, 100);
      }

      await loadUserProfile(session.id);
    }
  );


  /* ====================================================================
     WACHTWOORD WIJZIGEN
     ==================================================================== */

  passwordUpdateForm?.addEventListener(
    "submit",
    async event => {
      event.preventDefault();
      clearPasswordMessage();

      const newValue =
        newPassword?.value || "";

      const confirmationValue =
        confirmPassword?.value || "";

      if (newValue.length < 6) {
        showPasswordMessage(
          "Het wachtwoord moet minimaal 6 tekens bevatten."
        );

        newPassword?.focus();
        return;
      }

      if (newValue !== confirmationValue) {
        showPasswordMessage(
          "De twee wachtwoorden komen niet overeen."
        );

        confirmPassword?.focus();
        return;
      }

      setPasswordBusy(true);

      try {
        const app =
          window._firebase.getApps().length
            ? window._firebase.getApp()
            : window._firebase.initializeApp(
                window.firebaseConfig
              );

        const auth =
          window._firebase.getAuth(app);

        const user = auth.currentUser;

        if (!user) {
          throw new Error(
            "Er is geen actieve gebruikerssessie gevonden."
          );
        }

        await window._firebase.updatePassword(
          user,
          newValue
        );

        closeModal(pwUpdateModal);
        openModal(passwordChangedModal);

      } catch (error) {
        console.error(
          "Wachtwoord wijzigen mislukt:",
          error
        );

        if (
          error.code ===
          "auth/requires-recent-login"
        ) {
          closeModal(pwUpdateModal);
          openModal(reauthErrorModal);
          return;
        }

        if (
          error.code ===
          "auth/weak-password"
        ) {
          showPasswordMessage(
            "Dit wachtwoord is onvoldoende sterk. Kies een langer wachtwoord."
          );
          return;
        }

        showPasswordMessage(
          error.message ||
          "Het wachtwoord kon niet worden gewijzigd."
        );

      } finally {
        setPasswordBusy(false);
      }
    }
  );


  /* ====================================================================
     MODALACTIES
     ==================================================================== */

  btnReauthLogin?.addEventListener(
    "click",
    async () => {
      btnReauthLogin.disabled = true;
      btnReauthLogin.textContent =
        "Uitloggen…";

      try {
        const app =
          window._firebase.getApps().length
            ? window._firebase.getApp()
            : window._firebase.initializeApp(
                window.firebaseConfig
              );

        const auth =
          window._firebase.getAuth(app);

        await window._firebase.signOut(auth);

      } catch (error) {
        console.error(
          "Uitloggen voor herauthenticatie mislukt:",
          error
        );
      } finally {
        window.location.href =
          "index.html?trigger_login=true";
      }
    }
  );

  passwordChangedOkBtn?.addEventListener(
    "click",
    () => {
      closeModal(passwordChangedModal);

      pwWarning?.classList.add("hidden");

      if (newPassword) {
        newPassword.value = "";
      }

      if (confirmPassword) {
        confirmPassword.value = "";
      }

      const cleanUrl =
        `${window.location.pathname}`;

      window.history.replaceState(
        {},
        document.title,
        cleanUrl
      );

      window.location.href = "index.html";
    }
  );
})();