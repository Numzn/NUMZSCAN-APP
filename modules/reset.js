export function setupReset(context) {
  const { dom, ui, state, saveTickets, onTicketsChanged, supabase, eventId, defaultScanLocation } = context;

  if (!dom.resetBtn) return {};

  dom.resetBtn.addEventListener("click", () => handleReset());

  async function handleReset() {
    if (!state.tickets.length) {
      alert("No tickets to reset.");
      return;
    }
    const usedTickets = state.tickets.filter((ticket) => ticket.used);
    if (!usedTickets.length) {
      alert("All tickets are already unused.");
      return;
    }
    if (!confirm("Reset all used tickets to unused? This cannot be undone.")) {
      return;
    }

    const now = new Date().toISOString();
    const deviceId = supabase.getDeviceId ? supabase.getDeviceId() : "local-device";

    state.tickets.forEach((ticket) => {
      ticket.used = false;
      ticket.usedAt = null;
      if (supabase.isEnabled()) {
        ticket.syncStatus = "pending";
        ticket.pendingAction = "reset";
      }
    });

    await saveTickets();
    await onTicketsChanged();

    if (supabase.isEnabled()) {
      usedTickets.forEach((ticket) => {
        supabase.enqueue({
          type: "recordScan",
          payload: {
            ticket_id: ticket.id,
            event_id: eventId,
            device_id: deviceId,
            scan_location: defaultScanLocation,
            scan_action: "reset",
            payload: { reset_at_local: now },
          },
        });
        supabase.enqueue({
          type: "resetTicket",
          payload: { id: ticket.id },
        });
      });
    }

    alert("All tickets reset to unused.");
  }

  return {
    reset: handleReset,
  };
}


