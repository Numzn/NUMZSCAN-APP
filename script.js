/* script.js
   Main app logic: tickets storage, generation, scanning, dashboard, import/export.
   Keep functions simple and commented for beginners.
*/

// ---------- Utilities ----------
let ticketCounter = 0; // Track ticket number across generation batches

async function uid() {
  // Generate unique fancy ticket ID: LHG-TK01-XXXX format
  // Get sequential number from existing tickets + current batch
  const currentTickets = await loadTickets();
  ticketCounter = Math.max(ticketCounter, currentTickets.length);
  ticketCounter++;
  const nextNum = String(ticketCounter).padStart(2, '0');
  
  // Generate fancy unique code (4 alphanumeric characters)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding I, O, 0, 1 for clarity
  let fancyCode = '';
  for (let i = 0; i < 4; i++) {
    fancyCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return "LHG-TK" + nextNum + "-" + fancyCode;
}

// ---------- IndexedDB Database (Simple) ----------
const DB_NAME = "OfflineQRTickets";
const DB_VERSION = 1;
const STORE_NAME = "tickets";

// Initialize database
let db = null;

function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log("[DB] Database opened successfully");
      resolve(db);
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

// Save tickets to IndexedDB
async function saveTickets(tickets) {
  try {
    const database = await initDB();
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // Clear existing tickets
    store.clear();

    // Add all tickets
    for (const ticket of tickets) {
      store.add(ticket);
    }

    // Wait for transaction to complete
    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log(`[DB] Saved ${tickets.length} tickets`);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (e) {
    console.error("[DB] Failed to save tickets:", e);
    // Fallback to localStorage if IndexedDB fails
    try {
      localStorage.setItem("tickets", JSON.stringify(tickets));
      console.log("[DB] Fallback: Saved to localStorage");
    } catch (err) {
      alert("Failed to save tickets. Check browser storage permissions.");
    }
  }
}

// Load tickets from IndexedDB
async function loadTickets() {
  try {
    const database = await initDB();
    const transaction = database.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const tickets = request.result || [];
        console.log(`[DB] Loaded ${tickets.length} tickets`);
        resolve(tickets);
      };

      request.onerror = () => {
        console.error("[DB] Failed to load tickets:", request.error);
        // Fallback to localStorage
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
    // Fallback to localStorage
    try {
      const fallback = JSON.parse(localStorage.getItem("tickets") || "[]");
      console.log("[DB] Fallback: Loaded from localStorage");
      return fallback;
    } catch (err) {
      return [];
    }
  }
}

// Migrate from localStorage to IndexedDB on first load
async function migrateFromLocalStorage() {
  try {
    const localData = localStorage.getItem("tickets");
    if (localData) {
      const tickets = JSON.parse(localData);
      if (tickets.length > 0) {
        await saveTickets(tickets);
        localStorage.removeItem("tickets"); // Remove after migration
        console.log("[DB] Migrated tickets from localStorage");
      }
    }
  } catch (e) {
    console.warn("[DB] Migration skipped:", e);
  }
}

// ---------- DOM refs ----------
const generateBtn = document.getElementById("generateBtn");
const downloadSheetBtn = document.getElementById("downloadSheetBtn");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const exportSettingsBtn = document.getElementById("exportSettingsBtn");
const exportJSONSettingsBtn = document.getElementById("exportJSONSettingsBtn");
const importSettingsBtn = document.getElementById("importSettingsBtn");
const importSettingsFile = document.getElementById("importSettingsFile");
const qrcodesEl = document.getElementById("qrcodes");
const ticketCountInput = document.getElementById("ticketCount");

const startScannerBtn = document.getElementById("startScannerBtn");
const stopScannerBtn = document.getElementById("stopScannerBtn");
const readerEl = document.getElementById("reader");
const scanResultEl = document.getElementById("scanResult");

const scanFeedbackEl = document.getElementById("scanFeedback");
const feedbackIconEl = document.getElementById("feedbackIcon");
const feedbackTitleEl = document.getElementById("feedbackTitle");
const feedbackCodeEl = document.getElementById("feedbackCode");
const feedbackMessageEl = document.getElementById("feedbackMessage");

const totalTicketsEl = document.getElementById("totalTickets");
const usedTicketsEl = document.getElementById("usedTickets");
const unusedTicketsEl = document.getElementById("unusedTickets");
const resetBtn = document.getElementById("resetBtn");

// ---------- App state ----------
let html5QrScanner = null;
let tickets = []; // array of { id, used, createdAt, notes } - loaded async
let ticketMap = null; // Cache for fast ticket lookup during scanning
let dbReady = false; // Track if database is initialized

// Initialize app - load tickets from database
async function initApp() {
  try {
    await migrateFromLocalStorage();
    tickets = await loadTickets();
    await initializeCounter();
    rebuildTicketMap();
    renderGrid();
    await updateDashboard();
    dbReady = true;
    console.log("[DB] App initialized with", tickets.length, "tickets");
  } catch (e) {
    console.error("[DB] Failed to initialize app:", e);
    tickets = [];
    renderGrid();
    await updateDashboard();
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Build ticket map for fast O(1) lookups
function rebuildTicketMap() {
  ticketMap = new Map(tickets.map(t => [t.id, t]));
}

// ---------- Render QR grid ----------
function renderGrid() {
  qrcodesEl.innerHTML = "";
  
  // Update ticket count badge
  const ticketCountBadge = document.getElementById("ticketCountBadge");
  if (ticketCountBadge) {
    const count = tickets.length;
    ticketCountBadge.textContent = count === 1 ? "1 ticket" : `${count} tickets`;
  }
  
  if (tickets.length === 0) {
    qrcodesEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div>No tickets generated yet</div>
        <div style="font-size:0.85rem; margin-top:8px; color:#999;">Click "Generate Tickets" to create your first batch</div>
      </div>
    `;
    return;
  }
  
  // Check if QRCode library is available
  if (typeof QRCode === 'undefined') {
    qrcodesEl.innerHTML = "<div style=\"color:#666\">Loading QR library... Please wait.</div>";
    // Retry after a short delay (max 10 retries = 1 second)
    let retryCount = 0;
    const maxRetries = 10;
    const checkQRCode = () => {
      retryCount++;
      if (typeof QRCode !== 'undefined') {
        renderGrid(); // Retry rendering
      } else if (retryCount < maxRetries) {
        setTimeout(checkQRCode, 100);
      } else {
        qrcodesEl.innerHTML = "<div style=\"color:#dc3545\">QR library failed to load. Please refresh the page.</div>";
      }
    };
    setTimeout(checkQRCode, 100);
    return;
  }
  
  tickets.forEach(t => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `<div id="qr-${t.id}"></div><div style="margin-top:6px">${t.id}</div>`;
    qrcodesEl.appendChild(item);
    // Generate QR into element (use QRCode.js)
    try {
      const qrElement = document.getElementById("qr-" + t.id);
      if (!qrElement) {
        console.error("QR element not found:", "qr-" + t.id);
        return;
      }
      if (typeof QRCode === 'undefined') {
        console.error("QRCode is undefined when trying to create QR");
        qrElement.innerHTML = "<small>QR lib missing</small>";
        return;
      }
      new QRCode(qrElement, { text: t.id, width: 100, height: 100, margin: 1 });
    } catch (e) {
      // library may not be loaded
      console.error("QRCode creation failed:", e);
      const placeholder = document.getElementById("qr-" + t.id);
      if (placeholder) placeholder.innerHTML = "<small>QR error: " + e.message + "</small>";
    }
  });
}

// ---------- Dashboard ----------
async function updateDashboard() {
  tickets = await loadTickets();
  rebuildTicketMap(); // Rebuild map when tickets change
  const total = tickets.length;
  const used = tickets.filter(t => t.used).length;
  totalTicketsEl.textContent = total;
  usedTicketsEl.textContent = used;
  unusedTicketsEl.textContent = total - used;
  renderGrid();
}

// ---------- Generate tickets ----------
generateBtn.addEventListener("click", async () => {
  const count = parseInt(ticketCountInput.value) || 0;
  if (count < 1) return alert("Enter a valid amount");
  const newTickets = [];
  for (let i = 0; i < count; i++) {
    const id = await uid();
    newTickets.push({ id, used: false, createdAt: new Date().toISOString() });
  }
  tickets.push(...newTickets);
  await saveTickets(tickets);
  rebuildTicketMap();
  await updateDashboard();
  alert(count + " tickets generated. You can print the page or download CSV.");
});

// ---------- Export CSV/JSON ----------
exportBtn.addEventListener("click", async () => {
  const currentTickets = await loadTickets();
  const rows = [["id","used","createdAt","usedAt"]];
  currentTickets.forEach(t => rows.push([
    t.id, 
    t.used ? "1" : "0", 
    t.createdAt || "", 
    t.usedAt || ""
  ]));
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tickets-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Export JSON for syncing (includes all data)
async function exportJSON() {
  const currentTickets = await loadTickets();
  const data = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    ticketCount: currentTickets.length,
    tickets: currentTickets
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tickets-sync-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return data;
}

// ---------- Import JSON (backup restore / sync) ----------
importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = async evt => {
    try {
      const data = JSON.parse(evt.target.result);
      
      // Handle new format with metadata
      let imported = [];
      if (data.tickets && Array.isArray(data.tickets)) {
        imported = data.tickets;
      } else if (Array.isArray(data)) {
        // Old format - just array
        imported = data;
      } else {
        throw new Error("Invalid format - expected tickets array");
      }
      
      // Validation
      if (imported.length === 0) throw new Error("No tickets in file");
      const ok = imported.every(i => i.id);
      if (!ok) throw new Error("Invalid ticket objects - missing IDs");
      
      // Ask user: Replace or Merge?
      const action = confirm(
        `Import ${imported.length} tickets.\n\n` +
        `Click OK to MERGE (keep existing + add new)\n` +
        `Click Cancel to REPLACE (delete all existing)`
      );
      
      if (action) {
        // MERGE: Keep existing, add new, update existing
        const currentTickets = await loadTickets();
        const existingMap = new Map(currentTickets.map(t => [t.id, t]));
        
        // Merge logic: keep existing used status, add new tickets
        imported.forEach(ticket => {
          const existing = existingMap.get(ticket.id);
          if (existing) {
            // Ticket exists - keep the one with used=true if either is used
            if (ticket.used || existing.used) {
              existing.used = true;
              existing.usedAt = ticket.usedAt || existing.usedAt;
            }
          } else {
            // New ticket - add it
            existingMap.set(ticket.id, ticket);
          }
        });
        
        tickets = Array.from(existingMap.values());
        await saveTickets(tickets);
        rebuildTicketMap();
        await updateDashboard();
        alert(`Merged successfully!\nTotal tickets: ${tickets.length}`);
      } else {
        // REPLACE: Clear and import
        tickets = imported;
        await saveTickets(tickets);
        rebuildTicketMap();
        await updateDashboard();
        alert(`Replaced successfully!\nTotal tickets: ${tickets.length}`);
      }
    } catch (err) {
      alert("Failed to import: " + err.message);
    }
  };
  reader.readAsText(f);
});

// ---------- Download Printable Sheet ----------
downloadSheetBtn.addEventListener("click", async () => {
  if (tickets.length === 0) {
    alert("No tickets to print. Generate some tickets first.");
    return;
  }
  
  // Show loading message
  downloadSheetBtn.disabled = true;
  downloadSheetBtn.textContent = "Preparing print sheet...";
  
  try {
    // First try to extract QR codes from existing visible elements
    const qrDataUrls = [];
    let extractedCount = 0;
    
    // Try extracting from existing QR codes on page first (much faster)
    for (const ticket of tickets) {
      const qrElement = document.getElementById("qr-" + ticket.id);
      let extracted = false;
      
      if (qrElement) {
        // Try canvas first (most reliable)
        const canvas = qrElement.querySelector("canvas");
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          try {
            const dataUrl = canvas.toDataURL("image/png");
            if (dataUrl && dataUrl.length > 100) { // Valid data URL
              qrDataUrls.push({ id: ticket.id, qr: dataUrl });
              extracted = true;
            }
          } catch (e) {
            console.warn("Canvas extraction failed:", e);
          }
        }
        
        // Try img element
        if (!extracted) {
          const img = qrElement.querySelector("img");
          if (img && img.src) {
            if (img.src.startsWith("data:image")) {
              qrDataUrls.push({ id: ticket.id, qr: img.src });
              extracted = true;
            } else if (img.complete) {
              // Try to convert img to canvas
              try {
                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = img.width || 200;
                tempCanvas.height = img.height || 200;
                const ctx = tempCanvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                const dataUrl = tempCanvas.toDataURL("image/png");
                qrDataUrls.push({ id: ticket.id, qr: dataUrl });
                extracted = true;
              } catch (e) {
                console.warn("Img to canvas conversion failed:", e);
              }
            }
          }
        }
        
        // Try SVG
        if (!extracted) {
          const svg = qrElement.querySelector("svg");
          if (svg) {
            try {
              const svgData = new XMLSerializer().serializeToString(svg);
              const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
              qrDataUrls.push({ id: ticket.id, qr: dataUrl });
              extracted = true;
            } catch (e) {
              console.warn("SVG extraction failed:", e);
            }
          }
        }
      }
      
      // If extraction failed, generate new QR code
      if (!extracted) {
        const dataUrl = await generateDataURLForQR(ticket.id);
        qrDataUrls.push({ id: ticket.id, qr: dataUrl });
      }
      
      // Update progress
      if (qrDataUrls.length % 10 === 0) {
        downloadSheetBtn.textContent = `Processing... ${qrDataUrls.length}/${tickets.length}`;
      }
    }
    
    // Verify we have valid QR codes
    const validQRCodes = qrDataUrls.filter(t => t.qr && (t.qr.startsWith("data:image") || t.qr.startsWith("data:image/svg")));
    if (validQRCodes.length === 0) {
      alert("Failed to generate QR codes. Please ensure the QR library is loaded and refresh the page.");
      downloadSheetBtn.disabled = false;
      downloadSheetBtn.innerHTML = '<span>📄</span> Print Sheet';
      return;
    }
    
    // Create printable HTML page
    const popup = window.open("", "_blank");
    if (!popup) {
      alert("Popup blocked. Please allow popups to print tickets.");
      downloadSheetBtn.disabled = false;
      downloadSheetBtn.innerHTML = '<span>📄</span> Print Sheet';
      return;
    }
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket Sheet - ${tickets.length} Tickets</title>
  <style>
    @media print {
      @page { margin: 10mm; size: A4; }
      body { margin: 0; }
      .print-header { display: none; }
    }
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      padding: 0;
      background: white;
    }
    .ticket-sheet {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 20px;
      padding: 20px;
    }
    .ticket-item {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      background: white;
      page-break-inside: avoid;
    }
    .ticket-qr {
      margin-bottom: 12px;
      min-height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ticket-qr img {
      width: 140px;
      height: 140px;
      display: block;
      margin: 0 auto;
      image-rendering: crisp-edges;
    }
    .ticket-id {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #333;
      word-break: break-all;
      font-weight: 500;
      margin-top: 8px;
    }
    .print-header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #eee;
    }
    .print-header h1 {
      margin: 0 0 8px 0;
      font-size: 24px;
      color: #222;
    }
    .print-header p {
      margin: 0;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="print-header">
    <h1>Ticket Sheet</h1>
    <p>Total: ${tickets.length} tickets | Generated: ${new Date().toLocaleDateString()}</p>
  </div>
  <div class="ticket-sheet">
    ${qrDataUrls.map(t => `
      <div class="ticket-item">
        <div class="ticket-qr">
          <img src="${t.qr}" alt="QR Code for ${t.id}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding:20px; color:#999;\\'>QR Code Error</div>';" />
        </div>
        <div class="ticket-id">${t.id}</div>
      </div>
    `).join('')}
  </div>
  <script>
    window.onload = function() {
      // Wait for all images to load
      const images = document.querySelectorAll('img');
      let loaded = 0;
      const total = images.length;
      
      if (total === 0) {
        setTimeout(() => window.print(), 500);
        return;
      }
      
      images.forEach(img => {
        if (img.complete) {
          loaded++;
          if (loaded === total) {
            setTimeout(() => window.print(), 500);
          }
        } else {
          img.onload = img.onerror = function() {
            loaded++;
            if (loaded === total) {
              setTimeout(() => window.print(), 500);
            }
          };
        }
      });
    };
  </script>
</body>
</html>`;
    
    popup.document.write(html);
    popup.document.close();
    
    // Reset button
    downloadSheetBtn.disabled = false;
    downloadSheetBtn.innerHTML = '<span>📄</span> Print Sheet';
    
  } catch (error) {
    console.error("Print generation error:", error);
    alert("Failed to generate print sheet: " + error.message);
    downloadSheetBtn.disabled = false;
    downloadSheetBtn.innerHTML = '<span>📄</span> Print Sheet';
  }
});

// Helper to generate QR as data URL using canvas approach
function generateDataURLForQR(text) {
  return new Promise((resolve) => {
    // If QRCode library supports toDataURL, use it. Otherwise create a canvas QR via temporary element.
    try {
      if (typeof QRCode === 'undefined') {
        resolve("data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#eee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#666">${text}</text></svg>`));
        return;
      }
      
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.left = "-9999px";
      el.style.width = "200px";
      el.style.height = "200px";
      el.style.visibility = "hidden";
      document.body.appendChild(el);
      
      new QRCode(el, { 
        text, 
        width: 200, 
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
      
      // Wait for QR code to render and check multiple times
      let attempts = 0;
      const maxAttempts = 15;
      
      const checkQR = setInterval(() => {
        attempts++;
        
        try {
          // Try canvas first (most reliable for data URL)
          const canvas = el.querySelector("canvas");
          if (canvas) {
            try {
              const dataUrl = canvas.toDataURL("image/png");
              clearInterval(checkQR);
              document.body.removeChild(el);
              resolve(dataUrl);
              return;
            } catch (e) {
              console.warn("Canvas toDataURL error:", e);
            }
          }
          
          // Try img element
          const img = el.querySelector("img");
          if (img) {
            // Wait for img to load
            if (img.complete && img.src) {
              if (img.src.startsWith("data:")) {
                clearInterval(checkQR);
                document.body.removeChild(el);
                resolve(img.src);
                return;
              }
            } else {
              img.onload = function() {
                if (img.src && img.src.startsWith("data:")) {
                  clearInterval(checkQR);
                  if (el.parentNode) document.body.removeChild(el);
                  resolve(img.src);
                }
              };
            }
          }
          
          // Try SVG
          const svg = el.querySelector("svg");
          if (svg) {
            try {
              const svgData = new XMLSerializer().serializeToString(svg);
              const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
              clearInterval(checkQR);
              document.body.removeChild(el);
              resolve(dataUrl);
              return;
            } catch (e) {
              console.warn("SVG conversion error:", e);
            }
          }
          
          // If max attempts, give up and use fallback
          if (attempts >= maxAttempts) {
            clearInterval(checkQR);
            if (el.parentNode) document.body.removeChild(el);
            // Fallback to SVG placeholder
            resolve("data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#eee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#666">${text}</text></svg>`));
          }
        } catch (err) {
          console.error("Error checking QR:", err);
          if (attempts >= maxAttempts) {
            clearInterval(checkQR);
            if (el.parentNode) document.body.removeChild(el);
            resolve("data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#eee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#666">${text}</text></svg>`));
          }
        }
      }, 200); // Check every 200ms
    } catch (e) {
      console.error("QR generation failed:", e);
      // Fallback to placeholder
      resolve("data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#eee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#666">${text}</text></svg>`));
    }
  });
}

// ---------- Scanner (html5-qrcode) ----------
startScannerBtn.addEventListener("click", async () => {
  if (html5QrScanner) return;
  if (typeof Html5Qrcode === "undefined") {
    alert("Scanner library missing. Ensure html5-qrcode.min.js is in the project.");
    return;
  }
  // Optimized config for maximum speed
  const config = { 
    fps: 30, // Higher FPS for faster scanning
    qrbox: { width: 300, height: 300 }, // Larger scan area = faster detection
    aspectRatio: 1.0, // Square aspect ratio for better performance
    disableFlip: true, // Disable flip detection for speed
    videoConstraints: {
      facingMode: "environment",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };
  html5QrScanner = new Html5Qrcode("reader");
  startScannerBtn.disabled = true;
  stopScannerBtn.disabled = false;
  try {
    await html5QrScanner.start(
      { facingMode: "environment" }, 
      config,
      qrCodeMessage => {
        // on success - process immediately
        handleScannedCode(qrCodeMessage);
      },
      errorMessage => {
        // ignore decode errors - don't log to avoid performance hit
      },
      {
        verbose: false // Disable verbose logging for performance
      }
    );
  } catch (err) {
    alert("Could not start camera: " + err.message);
    startScannerBtn.disabled = false;
    stopScannerBtn.disabled = true;
  }
});
stopScannerBtn.addEventListener("click", async () => {
  if (!html5QrScanner) return;
  await html5QrScanner.stop();
  html5QrScanner.clear();
  html5QrScanner = null;
  startScannerBtn.disabled = false;
  stopScannerBtn.disabled = true;
  readerEl.innerHTML = "";
});

// Handle scanned code with optimized debounce
let lastScannedCode = null;
let lastScanTime = 0;
let scanProcessing = false; // Prevent concurrent processing

function handleScannedCode(code) {
  const now = Date.now();
  
  // Fast debounce: ignore same code scanned within 500ms (reduced from 2000ms)
  if (code === lastScannedCode && now - lastScanTime < 500) {
    return;
  }
  
  // Prevent concurrent processing
  if (scanProcessing) {
    return;
  }
  
  scanProcessing = true;
  lastScannedCode = code;
  lastScanTime = now;
  
  // Use cached Map for O(1) lookup - much faster than array.find()
  if (!ticketMap) rebuildTicketMap();
  const existing = ticketMap.get(code);
  
  if (!existing) {
    showScanFeedback("error", "Unknown Ticket", code, "This ticket is not in the system.");
    scanProcessing = false;
    return;
  }
  
  if (existing.used) {
    showScanFeedback("warning", "Already Used", code, "This ticket was already scanned.");
    scanProcessing = false;
    return;
  }
  
  // Mark as used immediately
  existing.used = true;
  existing.usedAt = new Date().toISOString();
  
  // Show success feedback
  showScanFeedback("success", "Ticket Accepted", code, "Entry granted. Welcome!");
  
  // Update map immediately for next scan
  ticketMap.set(code, existing);
  
  // Save and update dashboard (async to not block UI)
  setTimeout(async () => {
    await saveTickets(tickets);
    await updateDashboard();
    scanProcessing = false;
  }, 0);
}

// Show professional scan feedback modal
function showScanFeedback(type, title, code, message) {
  // Set icon based on type
  feedbackIconEl.className = "feedback-icon " + type;
  if (type === "success") {
    feedbackIconEl.textContent = "✓";
  } else if (type === "warning") {
    feedbackIconEl.textContent = "⚠";
  } else {
    feedbackIconEl.textContent = "✕";
  }
  
  // Set content
  feedbackTitleEl.textContent = title;
  feedbackCodeEl.textContent = code;
  feedbackMessageEl.textContent = message;
  
  // Show modal
  scanFeedbackEl.classList.remove("hidden");
  
  // Auto-hide after 2.5 seconds for success, 3 seconds for others
  const hideDelay = type === "success" ? 2500 : 3000;
  setTimeout(() => {
    scanFeedbackEl.classList.add("hidden");
  }, hideDelay);
  
  // Also update small result text
  const colors = {
    success: "#27ae60",
    warning: "#f39c12",
    error: "#c0392b"
  };
  scanResultEl.innerHTML = `<span style="color:${colors[type]}">${title}: ${code}</span>`;
}

// ---------- Reset ----------
resetBtn.addEventListener("click", async () => {
  if (!confirm("Erase all tickets and reset dashboard? This cannot be undone.")) return;
  tickets = [];
  ticketCounter = 0; // Reset counter when resetting tickets
  await saveTickets(tickets);
  rebuildTicketMap();
  await updateDashboard();
  alert("Reset complete.");
});

// Initialize counter and ticket map based on existing tickets
async function initializeCounter() {
  const currentTickets = await loadTickets();
  ticketCounter = currentTickets.length;
}

// ---------- Tab Navigation ----------
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const targetTab = btn.getAttribute("data-tab");
    
    // Remove active class from all tabs and buttons
    tabButtons.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));
    
    // Add active class to clicked tab
    btn.classList.add("active");
    document.getElementById(targetTab).classList.add("active");
    
    // If switching to scanner tab, try to restart camera if it was running
    if (targetTab === "scanner" && html5QrScanner) {
      // Camera already running, just show the tab
    }
  });
});

// Export JSON button
if (exportJSONBtn) {
  exportJSONBtn.addEventListener("click", async () => {
    await exportJSON();
    alert("JSON exported! Share this file with other devices to sync tickets.");
  });
}

// Settings buttons
if (exportJSONSettingsBtn) {
  exportJSONSettingsBtn.addEventListener("click", async () => {
    await exportJSON();
    alert("JSON exported! Share this file with other devices to sync tickets.");
  });
}

exportSettingsBtn.addEventListener("click", () => {
  exportBtn.click(); // Use same export function
});

importSettingsBtn.addEventListener("click", () => {
  importSettingsFile.click();
});

importSettingsFile.addEventListener("change", (e) => {
  importFile.files = e.target.files; // Share the file
  importFile.dispatchEvent(new Event("change")); // Trigger import
  e.target.value = ""; // Reset
});

// Old initialization code removed - now handled by initApp() above
