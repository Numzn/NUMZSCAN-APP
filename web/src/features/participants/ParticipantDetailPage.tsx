import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { CREDENTIAL_STATUS, PARTICIPANT_STATUS, statusOf } from "../../app/labels";
import { can, roleOn, viewerOf } from "../../app/policy";
import { PageHeader } from "../../components/PageHeader";
import { Badge } from "../../components/Badge";
import { QrPass } from "../credentials/QrPass";
import { isCredentialToken } from "../credentials/pass";
import { api, ApiError } from "../../services/api";
import type { CampEvent, Credential, Group, Participant } from "../../services/types";

interface ShownPass {
  token: string;
  credentialId: string;
}

export function ParticipantDetailPage() {
  const { participantId = "" } = useParams();
  const { state } = useAuth();
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [event, setEvent] = useState<CampEvent | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [pass, setPass] = useState<ShownPass | null>(null);
  const [groupChoice, setGroupChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadCredentials() {
    const { credentials: c } = await api.listCredentials(participantId);
    setCredentials(c);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { participant: p } = await api.getParticipant(participantId);
        const [{ event: e }, { groups: g }, { credentials: c }] = await Promise.all([
          api.getEvent(p.eventId),
          api.listGroups(p.eventId),
          api.listCredentials(participantId),
        ]);
        if (!cancelled) {
          setParticipant(p);
          setGroupChoice(p.groupId ?? "");
          setEvent(e);
          setGroups(g);
          setCredentials(c);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load this participant.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [participantId]);

  if (state.status !== "signed-in") return null;
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!participant || !event) return <p className="status">Loading participant…</p>;

  const viewer = viewerOf(state);
  const role = roleOn(viewer, participant.eventId);
  const manager = can(viewer, "event.manage", participant.eventId);
  const issuer = can(viewer, "credential.issue", participant.eventId);
  const activeCredential = credentials.find((c) => c.status === "active") ?? null;
  const currentGroup = groups.find((g) => g.id === participant.groupId)?.name ?? null;
  const participantStatus = statusOf(PARTICIPANT_STATUS, participant.status);

  async function run(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const saveGroup = () =>
    run(async () => {
      const { participant: updated } = await api.updateParticipant(participant.id, { groupId: groupChoice || null });
      setParticipant(updated);
      setNotice("Group saved.");
    });

  const issue = () =>
    run(async () => {
      const issued = await api.issueCredential(participant.id);
      setPass({ token: issued.token, credentialId: issued.credential.id });
      await loadCredentials();
      setNotice("Credential issued. Print the pass now; it is shown once.");
    });

  const replace = (credentialId: string) =>
    run(async () => {
      const issued = await api.replaceCredential(credentialId);
      setPass({ token: issued.token, credentialId: issued.credential.id });
      await loadCredentials();
      setNotice("Credential replaced. The old pass no longer works.");
    });

  const revoke = (credentialId: string) =>
    run(async () => {
      await api.revokeCredential(credentialId);
      if (pass?.credentialId === credentialId) setPass(null);
      await loadCredentials();
      setNotice("Credential revoked.");
    });

  return (
    <section>
      <PageHeader
        title={participant.fullName}
        crumbs={[
          { label: "Events", to: "/events" },
          { label: event.name, to: `/events/${participant.eventId}` },
          { label: "Participants", to: `/events/${participant.eventId}/participants` },
          { label: participant.fullName },
        ]}
        badge={<Badge tone={participantStatus.tone}>{participantStatus.label}</Badge>}
      />

      <dl className="facts card">
        <dt>Event</dt><dd>{event.name}</dd>
        <dt>Group</dt><dd>{currentGroup ?? "No group"}</dd>
        <dt>Your role</dt><dd>{role === "admin" ? "Administrator" : role === "event_manager" ? "Event manager" : role === "staff" ? "Staff" : "No role"}</dd>
      </dl>

      {manager && (
        <div className="card toolbar">
          <label>
            Group
            <select value={groupChoice} onChange={(e) => setGroupChoice(e.target.value)}>
              <option value="">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-secondary" onClick={saveGroup} disabled={busy}>Save group</button>
        </div>
      )}

      <div className="card">
        <h2>Credential</h2>
        {credentials.length === 0 ? (
          <p className="status">No credential issued yet.</p>
        ) : (
          <ul className="credential-list">
            {credentials.map((c) => {
              const status = statusOf(CREDENTIAL_STATUS, c.status);
              return (
                <li key={c.id}>
                  <span className="token-hint">…{c.tokenHint}</span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <span className="meta">issued {new Date(c.issuedAt).toLocaleDateString()}</span>
                  <span className="row-actions">
                    {c.status === "active" && issuer && (
                      <button type="button" className="btn-secondary" onClick={() => replace(c.id)} disabled={busy}>Replace</button>
                    )}
                    {c.status === "active" && manager && (
                      <button type="button" className="btn-danger" onClick={() => revoke(c.id)} disabled={busy}>Revoke</button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {!activeCredential && issuer && participant.status !== "cancelled" && (
          <button type="button" className="btn" onClick={issue} disabled={busy}>Issue credential</button>
        )}
      </div>

      {notice && <p role="status" className="notice">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {pass && isCredentialToken(pass.token) && (
        <QrPass token={pass.token} participantName={participant.fullName} eventName={event.name} groupName={currentGroup} />
      )}
    </section>
  );
}
