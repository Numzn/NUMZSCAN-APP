export function createTicketGrid(dom, { ticketBaseUrl, useUrlInQr }) {
  function renderGrid(tickets) {
    if (!dom.qrcodesEl) return;
    dom.qrcodesEl.innerHTML = "";

    if (dom.ticketCountBadge) {
      const count = tickets.length;
      dom.ticketCountBadge.textContent = count === 1 ? "1 ticket" : `${count} tickets`;
    }

    if (tickets.length === 0) {
      dom.qrcodesEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div>No tickets generated yet</div>
          <div style="font-size:0.85rem; margin-top:8px; color:#999;">Click "Generate Tickets" to create your first batch</div>
        </div>
      `;
      removeStatusBanner();
      return;
    }

    if (typeof QRCode === "undefined") {
      dom.qrcodesEl.innerHTML = `<div style="color:#666">Loading QR library... Please wait.</div>`;
      retryRender(tickets, 0);
      return;
    }

    let failedTickets = 0;
    tickets.forEach((ticket) => {
      const item = document.createElement("div");
      item.className = "item";
      const qrHolder = document.createElement("div");
      qrHolder.id = `qr-${ticket.id}`;
      const idLabel = document.createElement("div");
      idLabel.style.marginTop = "6px";
      idLabel.textContent = ticket.id;
      item.append(qrHolder, idLabel);
      dom.qrcodesEl.appendChild(item);

      const qrElement = document.getElementById(`qr-${ticket.id}`);
      if (!qrElement) {
        console.error("QR element not found:", `qr-${ticket.id}`);
        return;
      }

      let failureRecorded = false;
      const markFailure = (message = "QR unavailable") => {
        if (!qrElement) return;
        const parentItem = qrElement.closest(".item");
        if (!failureRecorded) {
          failedTickets++;
          failureRecorded = true;
        }
        const errorText = document.createElement("span");
        errorText.className = "qr-error";
        errorText.textContent = message;
        qrElement.replaceChildren(errorText);
        if (parentItem) parentItem.classList.add("qr-error-state");
      };

      const clearFailureState = () => {
        if (!qrElement) return;
        const parentItem = qrElement.closest(".item");
        if (parentItem) parentItem.classList.remove("qr-error-state");
      };

      try {
        if (typeof QRCode === "undefined") {
          console.error("QRCode is undefined when trying to create QR");
          markFailure("QR library missing");
          return;
        }
        const qrText = useUrlInQr ? `${ticketBaseUrl}${ticket.id}` : ticket.id;
        new QRCode(qrElement, { text: qrText, width: 100, height: 100, margin: 1 });
      } catch (e) {
        console.error("QRCode creation failed:", e);
        markFailure(`QR error: ${e.message}`);
      }

      const maxChecks = 3;
      let attempts = 0;
      const verifyRendered = () => {
        if (failureRecorded) return;
        attempts++;
        const hasVisual = qrElement.querySelector("canvas, img, svg");
        if (hasVisual) {
          clearFailureState();
          return;
        }
        if (attempts < maxChecks) {
          setTimeout(verifyRendered, 150);
        } else {
          markFailure("QR failed to render. Refresh to retry.");
        }
      };

      requestAnimationFrame(() => setTimeout(verifyRendered, 100));
    });

    updateStatusBanner(failedTickets);
  }

  function retryRender(tickets, attempt) {
    const maxRetries = 10;
    if (attempt >= maxRetries) {
      dom.qrcodesEl.innerHTML = `<div style="color:#dc3545">QR library failed to load. Please refresh the page.</div>`;
      return;
    }
    setTimeout(() => {
      if (typeof QRCode !== "undefined") {
        renderGrid(tickets);
      } else {
        retryRender(tickets, attempt + 1);
      }
    }, 100);
  }

  function removeStatusBanner() {
    const existing = document.getElementById("qrStatusBanner");
    if (existing) existing.remove();
  }

  function updateStatusBanner(failedTickets) {
    removeStatusBanner();
    if (!failedTickets) return;

    const banner = document.createElement("div");
    banner.id = "qrStatusBanner";
    banner.className = "qr-status-banner";
    const message =
      failedTickets === 1
        ? "1 QR code failed to render. Refresh the page or export JSON to keep a backup."
        : `${failedTickets} QR codes failed to render. Refresh the page or export JSON to keep a backup.`;
    banner.textContent = `⚠️ ${message}`;
    if (dom.qrcodesEl.firstChild) {
      dom.qrcodesEl.prepend(banner);
    } else {
      dom.qrcodesEl.appendChild(banner);
    }
  }

  function renderTicketStats({ total, used, unused }) {
    if (dom.totalTicketsEl) dom.totalTicketsEl.textContent = total;
    if (dom.usedTicketsEl) dom.usedTicketsEl.textContent = used;
    if (dom.unusedTicketsEl) dom.unusedTicketsEl.textContent = unused;
  }

  return {
    renderGrid,
    renderTicketStats,
  };
}


