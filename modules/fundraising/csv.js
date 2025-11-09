import { yieldToMainThread } from "./utils.js";

export async function importCsv(file, options) {
  const { loader, ui, contributionStore, state } = options;
  loader.show("Preparing CSV…");
  ui.toggleButtonLoading(options.dom.importCsvBtn, true, "Importing…");

  try {
    const text = await file.text();
    const analysis = analyzeCsv(text);
    if (!analysis.totalRows) {
      alert("No rows found in CSV file.");
      return;
    }

    const { lines, headers, startIndex, delimiter, totalRows } = analysis;
    const existingIds = new Set(state.contributions.map((entry) => entry.id));
    const newEntries = [];
    const skipped = [];
    const now = new Date().toISOString();

    let processed = 0;
    for (let i = startIndex; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;

      processed++;
      const record = recordFromLine(rawLine, headers, delimiter);
      if (!record?.id) {
        skipped.push(`Row ${i + 1}: missing id`);
        continue;
      }
      if (existingIds.has(record.id)) {
        skipped.push(`${record.id} (duplicate)`);
        continue;
      }

      const amountValue = parseFloat(record.amount || record.value || record.ticket_amount || 0);
      const amount = Number.isFinite(amountValue) && amountValue > 0 ? amountValue : 50;
      const type = record.type || "ticket";

      newEntries.push({
        id: record.id,
        type,
        amount,
        notes: record.notes || "Imported CSV",
        createdAt: record.created_at ? new Date(record.created_at).toISOString() : now,
      });
      existingIds.add(record.id);

      if (processed % 200 === 0) {
        const percent = Math.min(100, Math.round((processed / totalRows) * 100));
        loader.update(`Importing… ${processed}/${totalRows} (${percent}%)`);
        await yieldToMainThread();
      }
    }

    loader.update("Finalizing tickets…");
    await yieldToMainThread();

    if (!newEntries.length) {
      alert(
        `No new contributions imported.${skipped.length ? ` Skipped ${skipped.length} entries.` : ""}`
      );
      return;
    }

    contributionStore.importMany(newEntries);
    options.onAfterImport?.(newEntries.length);
    const skippedMsg = skipped.length ? `\nSkipped: ${skipped.length}` : "";
    alert(`Imported ${newEntries.length} entries.${skippedMsg}`);
  } catch (error) {
    console.error("[Fundraising:CSV] Failed:", error);
    alert(error?.message ? `CSV import failed: ${error.message}` : "Failed to import CSV file.");
  } finally {
    ui.toggleButtonLoading(options.dom.importCsvBtn, false);
    loader.hide();
  }
}

function analyzeCsv(text) {
  const lines = text.split(/\r?\n/);
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
  const headersLine = lines[firstNonEmptyIndex] || "";
  const delimiter = detectDelimiter(headersLine);
  const headers = headersLine.split(delimiter).map((header) => header.trim().toLowerCase());
  return {
    lines,
    headers,
    startIndex: firstNonEmptyIndex + 1,
    delimiter,
    totalRows: lines.length - (firstNonEmptyIndex + 1),
  };
}

function detectDelimiter(line) {
  if (line.includes(",")) return ",";
  if (line.includes(";")) return ";";
  if (line.includes("\t")) return "\t";
  return ",";
}

function recordFromLine(line, headers, delimiter) {
  const values = parseCsvLine(line, delimiter);
  const record = {};
  headers.forEach((key, index) => {
    record[key] = values[index];
  });
  return record;
}

function parseCsvLine(line, delimiter) {
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
    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((value) => value.trim());
}


