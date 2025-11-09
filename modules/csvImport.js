import { ensureTicketShape, rebuildTicketMap, sortTickets } from "./tickets.js";
import { yieldToMainThread } from "./utils.js";

export function setupCsvImport(context) {
  const { dom, ui, state, saveTickets, onTicketsChanged, setGenerationLock, supabase, eventId } = context;

  if (!dom.importCsvBtn || !dom.importCsvFile) {
    return {};
  }

  dom.importCsvBtn.addEventListener("click", () => dom.importCsvFile.click());
  dom.importCsvFile.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleCsvFile(file);
    event.target.value = "";
  });

  async function handleCsvFile(file) {
    ui.setGlobalLoading(true, "Importing CSV…");
    setGenerationLock(true, { reason: "CSV import" });

    try {
      const text = await file.text();
      const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (!rows.length) {
        alert("CSV file is empty.");
        return;
      }

      const headers = rows[0].split(",").map((h) => h.trim().toLowerCase());
      const idIndex = headers.findIndex((h) => h === "ticket id" || h === "id" || h === "ticket");
      if (idIndex === -1) {
        throw new Error("CSV must include a 'Ticket ID' column.");
      }
      const statusIndex = headers.findIndex((h) => h === "status");
      const usedAtIndex = headers.findIndex((h) => h === "used at" || h === "used_at");

      const existingMap = new Map(state.tickets.map((ticket) => [ticket.id, ticket]));
      const newTickets = [];
      let processed = 0;
      let skipped = 0;

      for (let i = 1; i < rows.length; i++) {
        const line = rows[i];
        if (!line) continue;
        const cols = parseCsvLine(line);
        const id = cols[idIndex]?.trim();
        if (!id) {
          skipped++;
          continue;
        }

        const status = statusIndex >= 0 ? cols[statusIndex]?.trim().toLowerCase() : "";
        const used = status === "used" || status === "true" || status === "yes";
        const usedAt = usedAtIndex >= 0 ? cols[usedAtIndex]?.trim() || null : null;

        const existing = existingMap.get(id);
        if (existing) {
          if (used && !existing.used) {
            existing.used = true;
            existing.usedAt = usedAt || existing.usedAt || new Date().toISOString();
          }
          continue;
        }

        const ticket = ensureTicketShape({
          id,
          used,
          usedAt,
          createdAt: new Date().toISOString(),
          source: "csv",
          syncStatus: supabase.isEnabled() ? "pending" : "local",
          pendingAction: supabase.isEnabled() ? "createTicket" : null,
        });
        existingMap.set(id, ticket);
        newTickets.push(ticket);

        if (supabase.isEnabled()) {
          supabase.enqueue({
            type: "createTicket",
            payload: {
              id: ticket.id,
              event_id: eventId,
              active: !ticket.used,
              created_at: ticket.createdAt,
              metadata: {
                source: "csv",
              },
            },
          });
        }

        processed++;
        if (processed % 50 === 0) {
          ui.updateLoaderMessage(`Importing CSV… ${processed} rows processed`);
          await yieldToMainThread();
        }
      }

      state.tickets = sortTickets(Array.from(existingMap.values()));
      state.ticketMap = rebuildTicketMap(state.tickets);
      state.ticketIdGenerator.setBaseline(state.tickets.length);
      await saveTickets();
      await onTicketsChanged();

      alert(`CSV import complete. Added ${newTickets.length} tickets. Skipped ${skipped}.`);
    } catch (error) {
      console.error("[CSV Import] Failed", error);
      alert(`Failed to import CSV: ${error.message}`);
    } finally {
      ui.setGlobalLoading(false);
    }
  }

  function parseCsvLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    values.push(current);
    return values;
  }

  return {
    import: handleCsvFile,
  };
}

