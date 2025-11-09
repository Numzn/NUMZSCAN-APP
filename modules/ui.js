import { formatTimestamp } from "./utils.js";

export function createUi(dom) {
  let globalLoaderHideTimer = null;
  let feedbackHideTimer = null;

  function setGlobalLoading(isLoading, message = "Working...") {
    if (!dom.globalLoader || !dom.loaderMessage) return;
    if (globalLoaderHideTimer) {
      clearTimeout(globalLoaderHideTimer);
      globalLoaderHideTimer = null;
    }
    if (isLoading) {
      dom.loaderMessage.textContent = message;
      if (dom.globalLoader.classList.contains("hidden")) {
        dom.globalLoader.classList.remove("hidden");
        requestAnimationFrame(() => dom.globalLoader.classList.add("show"));
      } else {
        dom.globalLoader.classList.add("show");
      }
    } else {
      dom.globalLoader.classList.remove("show");
      globalLoaderHideTimer = setTimeout(() => {
        dom.globalLoader.classList.add("hidden");
        globalLoaderHideTimer = null;
      }, 200);
    }
  }

  function updateLoaderMessage(message) {
    if (dom.loaderMessage) {
      dom.loaderMessage.textContent = message;
    }
  }

  function toggleButtonLoading(button, isLoading, loadingText = "Working...") {
    if (!button) return;
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }
    if (isLoading) {
      button.innerHTML = `<span class="inline-spinner" aria-hidden="true"></span><span>${loadingText}</span>`;
      button.disabled = true;
      button.classList.add("is-loading");
      button.setAttribute("aria-busy", "true");
    } else {
      button.innerHTML = button.dataset.originalHtml || button.innerHTML;
      button.disabled = false;
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
    }
  }

  function updateGenerationLockUI(locked) {
    if (dom.generateBtn) {
      if (locked) {
        dom.generateBtn.classList.add("locked");
        dom.generateBtn.disabled = true;
      } else {
        dom.generateBtn.classList.remove("locked");
        dom.generateBtn.disabled = false;
      }
    }
    if (dom.generationLockNotice) {
      dom.generationLockNotice.classList.toggle("hidden", !locked);
    }
  }

  function updateSyncIndicator(status, supabaseEnabled, helpers = {}) {
    if (!dom.syncStatusBadge || !dom.syncStatusText) return;
    const manualMode = helpers.manualMode === true;
    const active = Boolean(supabaseEnabled || manualMode);

    if (!active) {
      dom.syncStatusBadge.classList.add("hidden");
      updateCloudSyncDetails({ enabled: false, manualMode: false }, helpers);
      return;
    }

    dom.syncStatusBadge.classList.remove("hidden");
    dom.syncStatusBadge.classList.remove("online", "syncing", "manual-mode");

    if (manualMode) {
      dom.syncStatusBadge.classList.add("manual-mode");
      if (status?.syncing) {
        dom.syncStatusText.textContent = "Manual Syncing…";
      } else if ((status?.pending || 0) > 0) {
        dom.syncStatusText.textContent = `Pending (${status.pending})`;
      } else if (status?.online) {
        dom.syncStatusText.textContent = "Manual Ready";
      } else {
        dom.syncStatusText.textContent = "Offline";
      }
    } else {
      let text = "Offline";
      if (status.online && !status.syncing && status.pending === 0) {
        dom.syncStatusBadge.classList.add("online");
        text = "Online";
      } else if (status.syncing || status.pending > 0) {
        dom.syncStatusBadge.classList.add("syncing");
        text = status.pending > 0 ? `Syncing (${status.pending})` : "Syncing…";
      } else if (status.online) {
        text = "Online";
      }
      dom.syncStatusText.textContent = text;
    }

    updateCloudSyncDetails({ enabled: true, status, manualMode }, helpers);
  }

  function updateCloudSyncDetails({ enabled, status, manualMode }, helpers = {}) {
    const { getDeviceId = () => "-", getLastSyncAt = () => null, getTotals = () => null } = helpers;
    if (!dom.cloudSyncStatusLabel || !dom.cloudSyncDeviceId || !dom.cloudSyncLastSync || !dom.cloudSyncPending) return;

    if (!enabled && !manualMode) {
      dom.cloudSyncStatusLabel.textContent = "Disabled";
      dom.cloudSyncDeviceId.textContent = "-";
      dom.cloudSyncLastSync.textContent = "Never";
      dom.cloudSyncPending.textContent = "0";
      if (dom.cloudSyncTotals) {
        dom.cloudSyncTotals.textContent = "--";
      }
      if (dom.cloudSyncMode) {
        dom.cloudSyncMode.textContent = "Mode: Offline-first";
      }
      if (dom.cloudSyncCard) {
        dom.cloudSyncCard.style.display = "none";
      }
      if (dom.manualSyncBtn) {
        dom.manualSyncBtn.disabled = true;
        dom.manualSyncBtn.setAttribute("aria-busy", "false");
      }
      return;
    }

    if (dom.cloudSyncCard) {
      dom.cloudSyncCard.style.display = "";
    }

    const { pending = 0, syncing = false, online = navigator.onLine } = status || {};
    const totals = getTotals();

    if (manualMode) {
      dom.cloudSyncStatusLabel.textContent = pending > 0 ? `Pending (${pending})` : "Manual Mode";
      dom.cloudSyncDeviceId.textContent = getDeviceId() || "-";
      const lastSync = status?.lastSyncAt || getLastSyncAt();
      dom.cloudSyncLastSync.textContent = formatTimestamp(lastSync);
      dom.cloudSyncPending.textContent = String(pending);
      if (dom.cloudSyncTotals) {
        dom.cloudSyncTotals.textContent = totals ? `${totals.active} active / ${totals.inactive} inactive` : "--";
      }
      if (dom.cloudSyncMode) {
        dom.cloudSyncMode.textContent = "Mode: Offline-first (Manual)";
      }
      if (dom.manualSyncBtn) {
        dom.manualSyncBtn.disabled = syncing;
        dom.manualSyncBtn.setAttribute("aria-busy", syncing ? "true" : "false");
      }
      return;
    }

    let text = "Offline";
    if (online && syncing) {
      text = pending > 0 ? `Syncing (${pending})` : "Syncing…";
    } else if (online) {
      text = pending > 0 ? `Pending (${pending})` : "Online";
    }

    dom.cloudSyncStatusLabel.textContent = text;
    dom.cloudSyncDeviceId.textContent = getDeviceId() || "-";
    const lastSync = status?.lastSyncAt || getLastSyncAt();
    dom.cloudSyncLastSync.textContent = formatTimestamp(lastSync);
    dom.cloudSyncPending.textContent = String(pending);
    if (dom.cloudSyncTotals) {
      dom.cloudSyncTotals.textContent = totals ? `${totals.active} active / ${totals.inactive} inactive` : "--";
    }
    if (dom.cloudSyncMode) {
      dom.cloudSyncMode.textContent = "Mode: Auto sync";
    }
    if (dom.manualSyncBtn) {
      dom.manualSyncBtn.disabled = syncing;
      dom.manualSyncBtn.setAttribute("aria-busy", syncing ? "true" : "false");
    }
  }

  function showSyncAlert(message) {
    if (!dom.syncAlert || !dom.syncAlertText) return;
    dom.syncAlertText.textContent = message;
    dom.syncAlert.classList.remove("hidden");
  }

  function hideSyncAlert() {
    if (!dom.syncAlert) return;
    dom.syncAlert.classList.add("hidden");
  }

  function showScanFeedback(type, title, code, message) {
    if (!dom.scanFeedbackEl || !dom.feedbackIconEl || !dom.feedbackTitleEl || !dom.feedbackCodeEl || !dom.feedbackMessageEl) {
      return;
    }

    const hideDelay = type === "success" ? 2500 : 3000;

    dom.feedbackIconEl.className = "feedback-icon " + type;
    if (type === "success") {
      dom.feedbackIconEl.textContent = "✓";
    } else if (type === "warning") {
      dom.feedbackIconEl.textContent = "⚠";
    } else {
      dom.feedbackIconEl.textContent = "✕";
    }

    dom.feedbackTitleEl.textContent = title;
    dom.feedbackCodeEl.textContent = code;
    dom.feedbackMessageEl.textContent = message;
    if (!dom.feedbackMessageEl.dataset.appendedHint) {
      const hintEl = document.createElement("div");
      hintEl.className = "feedback-hint";
      hintEl.textContent = "Tap anywhere to scan the next ticket.";
      dom.feedbackMessageEl.parentElement.appendChild(hintEl);
      dom.feedbackMessageEl.dataset.appendedHint = "true";
    }

    const colors = {
      success: "#27ae60",
      warning: "#f39c12",
      error: "#c0392b",
    };
    if (dom.scanResultEl) {
      dom.scanResultEl.innerHTML = `<span style="color:${colors[type] || "#333"}">${title}: ${code}</span>`;
    }

    dom.scanFeedbackEl.classList.remove("hidden");

    const hideFeedback = () => {
      dom.scanFeedbackEl.classList.add("hidden");
      dom.scanFeedbackEl.removeEventListener("click", hideFeedback);
    };

    dom.scanFeedbackEl.addEventListener("click", hideFeedback, { once: true });

    clearTimeout(feedbackHideTimer);
    feedbackHideTimer = setTimeout(() => {
      dom.scanFeedbackEl.classList.add("hidden");
      dom.scanFeedbackEl.removeEventListener("click", hideFeedback);
      feedbackHideTimer = null;
    }, hideDelay);
  }

  return {
    setGlobalLoading,
    updateLoaderMessage,
    toggleButtonLoading,
    updateGenerationLockUI,
    updateSyncIndicator,
    updateCloudSyncDetails,
    showSyncAlert,
    hideSyncAlert,
    showScanFeedback,
  };
}

