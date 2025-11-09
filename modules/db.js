const DB_NAME = "OfflineQRTickets";
const DB_VERSION = 1;
const STORE_NAME = "tickets";

let dbInstance = null;

function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log("[DB] Database opened successfully");
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        objectStore.createIndex("used", "used", { unique: false });
        objectStore.createIndex("createdAt", "createdAt", { unique: false });
        console.log("[DB] Database created/upgraded");
      }
    };
  });
}

export async function saveTickets(tickets) {
  try {
    const database = await initDB();
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    store.clear();

    for (const ticket of tickets) {
      store.add(ticket);
    }

    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log(`[DB] Saved ${tickets.length} tickets`);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (e) {
    console.error("[DB] Failed to save tickets:", e);
    try {
      localStorage.setItem("tickets", JSON.stringify(tickets));
      console.log("[DB] Fallback: Saved to localStorage");
    } catch (err) {
      alert("Failed to save tickets. Check browser storage permissions.");
    }
  }
}

export async function loadTickets() {
  try {
    const database = await initDB();
    const transaction = database.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const fetched = request.result || [];
        const normalized = fetched.map((ticket) => ({
          id: ticket.id,
          used: Boolean(ticket.used),
          createdAt: ticket.createdAt || new Date().toISOString(),
          usedAt: ticket.usedAt || null,
          syncStatus: ticket.syncStatus || "local",
          lastSyncedAt: ticket.lastSyncedAt || null,
          pendingAction: ticket.pendingAction || null,
          metadata: ticket.metadata || {},
          source: ticket.source || "local",
        }));
        console.log(`[DB] Loaded ${normalized.length} tickets`);
        resolve(normalized);
      };

      request.onerror = () => {
        console.error("[DB] Failed to load tickets:", request.error);
        try {
          const fallback = JSON.parse(localStorage.getItem("tickets") || "[]");
          console.log("[DB] Fallback: Loaded from localStorage");
          resolve(fallback);
        } catch (err) {
          resolve([]);
        }
      };
    });
  } catch (e) {
    console.error("[DB] Database error:", e);
    try {
      const fallback = JSON.parse(localStorage.getItem("tickets") || "[]");
      console.log("[DB] Fallback: Loaded from localStorage");
      return fallback;
    } catch (err) {
      return [];
    }
  }
}

export async function migrateFromLocalStorage() {
  try {
    const localData = localStorage.getItem("tickets");
    if (localData) {
      const tickets = JSON.parse(localData);
      if (tickets.length > 0) {
        await saveTickets(tickets);
        localStorage.removeItem("tickets");
        console.log("[DB] Migrated tickets from localStorage");
      }
    }
  } catch (e) {
    console.warn("[DB] Migration skipped:", e);
  }
}

export function createTicketIdGenerator(initialCount = 0) {
  let counter = initialCount;
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function setBaseline(value) {
    counter = Math.max(counter, value);
  }

  function next() {
    counter += 1;
    const nextNum = String(counter).padStart(2, "0");
    let fancyCode = "";
    for (let i = 0; i < 4; i++) {
      fancyCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `LHG-TK${nextNum}-${fancyCode}`;
  }

  return { next, setBaseline };
}


