// mail-config.js
// 1 centrale plek voor alle mailboxen

window.ovnMail = {
  domain: "ovnscouting.nl",

  // mailbox per speltak (pas aan als jullie naming anders is)
  speltak: {
    bevers: "bevers@ovnscouting.nl",
    welpen: "welpen@ovnscouting.nl",
    scouts: "scouts@ovnscouting.nl",
    explorers: "explorers@ovnscouting.nl",
    rovers: "rovers@ovnscouting.nl",
    stam: "stam@ovnscouting.nl",
  },

  // algemene mailboxen
  algemeen: {
    bestuur: "bestuur@ovnscouting.nl",
    admin: "admin@ovnscouting.nl",
    ict: "ict@ovnscouting.nl",
  }
};

// helpers (optioneel, maar handig)
window.getSpeltakMailbox = function (speltak) {
  const key = String(speltak || "").toLowerCase();
  return window.ovnMail?.speltak?.[key] || window.ovnMail?.algemeen?.ict || "";
};
