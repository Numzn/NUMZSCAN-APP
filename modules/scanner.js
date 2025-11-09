const SCAN_DEBOUNCE_MS = 500;
const SCAN_RESET_DELAY_MS = 1200;

export function setupScanner(context) {
  const { dom, ui, state, findTicket, onTicketUpdated, supabase, eventId, defaultScanLocation } = context;

  if (dom.startScannerBtn) {
    dom.startScannerBtn.addEventListener("click", () => startScanner());
  }
  if (dom.stopScannerBtn) {
    dom.stopScannerBtn.addEventListener("click", () => stopScanner());
  }

  async function startScanner() {
    if (state.html5QrScanner) return;
    if (typeof Html5Qrcode === "undefined") {
      alert("Scanner library missing. Ensure html5-qrcode.min.js is available.");
      return;
    }
    const config = {
      fps: 30,
      qrbox: { width: 300, height: 300 },
      aspectRatio: 1.0,
      disableFlip: true,
      videoConstraints: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    try {
      state.html5QrScanner = new Html5Qrcode("reader");
      dom.startScannerBtn.disabled = true;
      dom.stopScannerBtn.disabled = false;
      await state.html5QrScanner.start(
        { facingMode: "environment" },
        config,
        (message) => processScan(message),
        () => {}
      );
    } catch (error) {
      alert(`Could not start camera: ${error.message}`);
      await stopScanner();
    }
  }

  async function stopScanner() {
    if (!state.html5QrScanner) return;
    try {
      await state.html5QrScanner.stop();
    } catch (error) {
      console.warn("[Scanner] stop failed", error);
    }
    try {
      state.html5QrScanner.clear();
    } catch (error) {
      console.warn("[Scanner] clear failed", error);
    }
    state.html5QrScanner = null;
    resetScanState();
    dom.startScannerBtn.disabled = false;
    dom.stopScannerBtn.disabled = true;
    if (dom.readerEl) dom.readerEl.innerHTML = "";
    if (dom.scanFeedbackEl) dom.scanFeedbackEl.classList.add("hidden");
  }

  function resetScanState() {
    if (state.scanCooldownTimer) {
      clearTimeout(state.scanCooldownTimer);
      state.scanCooldownTimer = null;
    }
    state.scanProcessing = false;
    state.lastScannedCode = null;
    state.lastScanTime = 0;
  }

  function scheduleScanReset(delay) {
    if (state.scanCooldownTimer) {
      clearTimeout(state.scanCooldownTimer);
    }
    state.scanCooldownTimer = setTimeout(() => {
      state.scanProcessing = false;
      state.scanCooldownTimer = null;
    }, delay);
  }

  async function processScan(rawCode) {
    const now = Date.now();
    if (rawCode === state.lastScannedCode && now - state.lastScanTime < SCAN_DEBOUNCE_MS) {
      return;
    }
    if (state.scanProcessing) {
      return;
    }

    state.scanProcessing = true;
    state.lastScannedCode = rawCode;
    state.lastScanTime = now;

    const ticketId = extractTicketId(rawCode);
    const ticket = findTicket(ticketId);

    if (!ticket) {
      ui.showScanFeedback("error", "Unknown Ticket", ticketId, "This ticket is not in the system.");
      scheduleScanReset(1500);
      return;
    }

    if (ticket.used) {
      ui.showScanFeedback("warning", "Already Used", ticket.id, "This ticket was already scanned.");
      scheduleScanReset(1500);
      return;
    }

    ticket.used = true;
    ticket.usedAt = new Date().toISOString();
    if (supabase.isEnabled()) {
      ticket.syncStatus = "pending";
      ticket.pendingAction = "scan";
    }

    ui.showScanFeedback("success", "Ticket Accepted", ticket.id, "Entry granted. Welcome!");

    await onTicketUpdated();

    if (supabase.isEnabled()) {
      const deviceId = supabase.getDeviceId ? supabase.getDeviceId() : "local-device";
      const payloadBase = {
        ticket_id: ticket.id,
        event_id: eventId,
        device_id: deviceId,
        scan_location: defaultScanLocation,
      };
      supabase.enqueue({
        type: "recordScan",
        payload: {
          ...payloadBase,
          scan_action: "scan",
          payload: { scanned_at_local: ticket.usedAt },
        },
      });
      supabase.enqueue({
        type: "updateTicket",
        payload: {
          id: ticket.id,
          update: { active: false, last_synced_at: ticket.usedAt },
        },
      });
    }

    scheduleScanReset(SCAN_RESET_DELAY_MS);
  }

  function extractTicketId(code) {
    if (!code) return "";
    if (!code.startsWith("http://") && !code.startsWith("https://")) {
      return code.trim();
    }
    try {
      const url = new URL(code);
      if (url.searchParams.has("ticket")) {
        return url.searchParams.get("ticket");
      }
      if (url.hash && url.hash.length > 1) {
        return url.hash.substring(1);
      }
      if (url.pathname.includes("/t/")) {
        const match = url.pathname.match(/\/t\/([^\/\?&#]+)/);
        return match ? match[1] : url.pathname.split("/t/")[1]?.split(/[\/\?&#]/)[0] || code;
      }
      if (url.pathname.includes("/ticket/")) {
        const match = url.pathname.match(/\/ticket\/([^\/\?&#]+)/);
        return match ? match[1] : url.pathname.split("/ticket/")[1]?.split(/[\/\?&#]/)[0] || code;
      }
      const pathParts = url.pathname.split("/").filter(Boolean);
      return pathParts[pathParts.length - 1] || code;
    } catch (error) {
      if (code.includes("?ticket=")) {
        return code.split("?ticket=")[1]?.split(/[&#]/)[0] || code;
      }
      if (code.includes("#")) {
        return code.split("#")[1]?.split(/[?&]/)[0] || code;
      }
      if (code.includes("/t/")) {
        return code.split("/t/")[1]?.split(/[\/\?&#]/)[0] || code;
      }
      const parts = code.split("/");
      return parts[parts.length - 1]?.split(/[?#]/)[0] || code;
    }
  }

  return {
    start: startScanner,
    stop: stopScanner,
  };
}

