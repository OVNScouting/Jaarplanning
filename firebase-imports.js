import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
  getDatabase, 
  ref, 
  get, 
  set, 
  update, 
  push, 
  remove 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Firebase Authentication (FASE 0: alleen beschikbaar maken, nog niet gebruiken)
import { 
  getAuth 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";


export {
  initializeApp,
  getDatabase,
  ref,
  get,
  set,
  update,
  push,
  remove,
  getAuth // FASE 0: nog niet actief gebruikt
};

