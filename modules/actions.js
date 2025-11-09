import { ensureTicketShape, rebuildTicketMap, sortTickets, normalizeTickets } from "./tickets.js";
import { yieldToMainThread } from "./utils.js";

export function setupActions(context) {
  const {
    dom,
    ui,
    state,
    onTicketsChanged,
    ticketBaseUrl,
    useUrlInQr,
    generateId,
    supabase,
    eventId,
    appVersion,
  } = context;

  if (dom.generateBtn) {
    dom.generateBtn.addEventListener("click", () => handleGenerateTickets());
  }
  if (dom.exportBtn) {
    dom.exportBtn.addEventListener("click", () => exportCSV());
  }
  if (dom.exportJSONBtn) {
    dom.exportJSONBtn.addEventListener("click", () => exportJSON());
  }
  if (dom.exportJSONSettingsBtn) {
    dom.exportJSONSettingsBtn.addEventListener("click", () => exportJSON());
  }
  if (dom.exportSettingsBtn && dom.exportBtn) {
    dom.exportSettingsBtn.addEventListener("click", () => dom.exportBtn.click());
  }
  if (dom.importBtn && dom.importFile) {
    dom.importBtn.addEventListener("click", () => dom.importFile.click());
    dom.importFile.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      handleImportFile(file);
      event.target.value = "";
    });
  }
  if (dom.importSettingsBtn && dom.importSettingsFile && dom.importFile) {
    dom.importSettingsBtn.addEventListener("click", () => dom.importSettingsFile.click());
    dom.importSettingsFile.addEventListener("change", (event) => {
      dom.importFile.files = event.target.files;
      dom.importFile.dispatchEvent(new Event("change"));
      event.target.value = "";
    });
  }
  if (dom.downloadSheetBtn) {
    dom.downloadSheetBtn.addEventListener("click", () => downloadPrintableSheet());
  }

  async function handleGenerateTickets() {
    if (state.isGenerating) return;

    if (state.settings?.generationLocked) {
      alert("Ticket generation is currently locked because tickets were imported from CSV. Unlock it from the admin panel before generating new ones.");
      return;
    }

    const count = parseInt(dom.ticketCountInput?.value || "0", 10);
    if (Number.isNaN(count) || count <= 0) {
      alert("Enter how many tickets to generate (1 or more).");
      return;
    }
    if (count > 5000) {
      if (!confirm("Generating a very large number of tickets may slow down the device. Continue?")) {
        return;
      }
    }

    state.isGenerating = true;
    ui.toggleButtonLoading(dom.generateBtn, true, `Generating ${count}…`);
    ui.setGlobalLoading(true, "Generating tickets…");

    try {
      const now = new Date().toISOString();
      const deviceId = supabase.getDeviceId ? supabase.getDeviceId() : "local-device";
      const newTickets = [];
      for (let i = 0; i < count; i++) {
        const id = generateId();
        const ticket = ensureTicketShape({
          id,
          used: false,
          createdAt: now,
          source: "local",
          syncStatus: supabase.isEnabled() ? "pending" : "local",
          pendingAction: supabase.isEnabled() ? "createTicket" : null,
        });
        state.tickets.push(ticket);
        newTickets.push(ticket);

        if (supabase.isEnabled()) {
          supabase.enqueue({
            type: "createTicket",
            payload: {
              id: ticket.id,
              event_id: eventId,
              active: true,
              created_at: ticket.createdAt,
              created_by: deviceId,
              metadata: {
                source: "generator",
              },
            },
          });
        }
      }

      state.ticketIdGenerator.setBaseline(state.tickets.length);
      state.ticketMap = rebuildTicketMap(state.tickets);
      await onTicketsChanged();
      alert(`Generated ${newTickets.length} tickets.`);
    } catch (error) {
      console.error("[Actions] Failed to generate tickets", error);
      alert("Failed to generate tickets. See console for details.");
    } finally {
      ui.toggleButtonLoading(dom.generateBtn, false);
      ui.setGlobalLoading(false);
      state.isGenerating = false;
    }
  }

  function exportCSV() {
    if (!state.tickets.length) {
      alert("No tickets to export.");
      return;
    }

    const lines = ["Ticket ID,Status,Used At"];
    state.tickets.forEach((ticket) => {
      const status = ticket.used ? "used" : "unused";
      const usedAt = ticket.usedAt ? `"${ticket.usedAt}"` : "";
      lines.push(`${ticket.id},${status},${usedAt}`);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    alert("CSV exported! Share this file with other devices to sync tickets.");
  }

  function exportJSON() {
    const payload = {
      generated_at: new Date().toISOString(),
      version: appVersion || "1.0.0",
      tickets: state.tickets,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tickets-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file) {
    try {
      ui.setGlobalLoading(true, "Importing tickets…");
      const text = await file.text();
      const data = JSON.parse(text);

      let importedTickets = [];
      if (data && Array.isArray(data.tickets)) {
        importedTickets = normalizeTickets(data.tickets);
      } else if (Array.isArray(data)) {
        importedTickets = normalizeTickets(data);
      } else {
        throw new Error("Invalid file format");
      }

      if (!importedTickets.length) {
        alert("The file contains no tickets.");
        return;
      }

      const merge = confirm(
        `Import ${importedTickets.length} tickets?\n\nOK = Merge (keep existing)\nCancel = Replace (delete existing)`
      );

      if (merge) {
        const map = new Map(state.tickets.map((ticket) => [ticket.id, ticket]));
        importedTickets.forEach((ticket) => {
          const existing = map.get(ticket.id);
          if (existing) {
            if (ticket.used && !existing.used) {
              existing.used = true;
              existing.usedAt = ticket.usedAt || existing.usedAt;
            }
          } else {
            map.set(ticket.id, ticket);
          }
        });
        state.tickets = sortTickets(Array.from(map.values()));
      } else {
        state.tickets = sortTickets(importedTickets);
      }

      state.ticketMap = rebuildTicketMap(state.tickets);
      state.ticketIdGenerator.setBaseline(state.tickets.length);
      await onTicketsChanged();
      alert(`Import complete! Total tickets: ${state.tickets.length}`);
    } catch (error) {
      console.error("[Actions] Import failed", error);
      alert(`Failed to import tickets: ${error.message}`);
    } finally {
      ui.setGlobalLoading(false);
    }
  }

  async function downloadPrintableSheet() {
    if (!state.tickets.length) {
      alert("No tickets to print. Generate some tickets first.");
      return;
    }

    const button = dom.downloadSheetBtn;
    button.disabled = true;
    button.textContent = "Preparing print sheet…";

    try {
      const qrData = [];
      for (const ticket of state.tickets) {
        const dataUrl = await ensureQRDataUrl(ticket.id);
        qrData.push({ id: ticket.id, qr: dataUrl });
        if (qrData.length % 10 === 0) {
          button.textContent = `Processing… ${qrData.length}/${state.tickets.length}`;
          await yieldToMainThread();
        }
      }

      createPrintablePopup(qrData);
    } catch (error) {
      console.error("[Actions] Failed to create print sheet", error);
      alert(`Failed to generate print sheet: ${error.message}`);
    } finally {
      button.disabled = false;
      button.innerHTML = '<span>📄</span> Print Sheet';
    }
  }

  async function ensureQRDataUrl(id) {
    const element = document.getElementById(`qr-${id}`);
    if (element) {
      const canvas = element.querySelector("canvas");
      if (canvas && canvas.width > 0) {
        try {
          return canvas.toDataURL("image/png");
        } catch (error) {
          console.warn("[Actions] Canvas extraction failed", error);
        }
      }
      const img = element.querySelector("img");
      if (img && img.src?.startsWith("data:image")) {
        return img.src;
      }
    }
    return generateDataURLForQR(id);
  }

  function createPrintablePopup(qrDataUrls) {
    const popup = window.open("", "_blank");
    if (!popup) {
      alert("Popup blocked. Please allow popups to print tickets.");
      return;
    }

    const markup = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket Sheet - ${state.tickets.length} Tickets</title>
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
    <p>Total: ${state.tickets.length} tickets | Generated: ${new Date().toLocaleDateString()}</p>
  </div>
  <div class="ticket-sheet">
    ${qrDataUrls
      .map(
        (item) => `
      <div class="ticket-item">
        <div class="ticket-qr">
          <img src="${item.qr}" alt="QR Code for ${item.id}" />
        </div>
        <div class="ticket-id">${item.id}</div>
      </div>`
      )
      .join("")}
  </div>
  <script>
    window.onload = function() {
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
          if (loaded === total) setTimeout(() => window.print(), 500);
        } else {
          img.onload = img.onerror = function() {
            loaded++;
            if (loaded === total) setTimeout(() => window.print(), 500);
          };
        }
      });
    };
  </script>
</body>
</html>`;

    popup.document.write(markup);
    popup.document.close();
  }

  function generateDataURLForQR(text) {
    return new Promise((resolve) => {
      try {
        if (typeof QRCode === "undefined") {
          resolve(
            "data:image/svg+xml;utf8," +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#eee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#666">${text}</text></svg>`
              )
          );
          return;
        }

        const el = document.createElement("div");
        el.style.position = "absolute";
        el.style.left = "-9999px";
        el.style.width = "200px";
        el.style.height = "200px";
        el.style.visibility = "hidden";
        document.body.appendChild(el);

        const qrText = useUrlInQr ? `${ticketBaseUrl}${text}` : text;
        new QRCode(el, {
          text: qrText,
          width: 200,
          height: 200,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H,
        });

        let attempts = 0;
        const maxAttempts = 15;
        const interval = setInterval(() => {
          attempts += 1;
          try {
            const canvas = el.querySelector("canvas");
            if (canvas) {
              const url = canvas.toDataURL("image/png");
              clearInterval(interval);
              el.remove();
              resolve(url);
              return;
            }
            const img = el.querySelector("img");
            if (img && img.complete && img.src) {
              clearInterval(interval);
              el.remove();
              resolve(img.src);
              return;
            }
            const svg = el.querySelector("svg");
            if (svg) {
              const svgString = new XMLSerializer().serializeToString(svg);
              const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgString)));
              clearInterval(interval);
              el.remove();
              resolve(url);
              return;
            }
          } catch (error) {
            console.error("[Actions] QR extraction error", error);
          }

          if (attempts >= maxAttempts) {
            clearInterval(interval);
            el.remove();
            resolve(
              "data:image/svg+xml;utf8," +
                encodeURIComponent(
                  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#eee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#666">${text}</text></svg>`
                )
            );
          }
        }, 120);
      } catch (error) {
        console.error("[Actions] QR generation failed", error);
        resolve(
          "data:image/svg+xml;utf8," +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#eee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" fill="#666">${text}</text></svg>`
            )
        );
      }
    });
  }

  return {
    refresh: refreshTickets,
  };
}

