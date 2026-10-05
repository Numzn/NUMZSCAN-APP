import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../services/api";
import type { AuditEntry, Overview } from "../../services/types";
import { actionLabel, describeEntry } from "./auditText";

export function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recent, setRecent] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [{ overview: o }, { entries }] = await Promise.all([api.adminOverview(), api.adminAudit({ limit: 8 })]);
        if (!cancelled) {
          setOverview(o);
          setRecent(entries);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load the overview.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!overview) return <p className="status">Loading overview…</p>;

  const counters: [string, number][] = [
    ["Active accounts", overview.activeUsers],
    ["Administrators", overview.administrators],
    ["Open events", overview.openEvents],
    ["Changes in the last 7 days", overview.changesLast7Days],
  ];

  return (
    <section>
      <h1>Overview</h1>
      <div className="metrics">
        {counters.map(([label, value]) => (
          <div className="metric" key={label}>
            <span className="metric-label">{label}</span>
            <span className="metric-value">{value}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="page-head">
          <h2>Recent changes</h2>
          <Link to="/admin/audit">All entries</Link>
        </div>
        {recent.length === 0 ? (
          <p className="status">No changes recorded yet.</p>
        ) : (
          <ul className="plain-list">
            {recent.map((entry) => (
              <li key={entry.id}>
                <span className="meta">{new Date(entry.occurredAt).toLocaleString()}</span>
                <span>{entry.actorName ?? "Unknown"}</span>
                <span>{actionLabel(entry.action)}</span>
                <span className="meta">{describeEntry(entry)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
