import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { useAuth } from "../../app/AuthContext";
import { REGISTRATION_STATUS, statusOf } from "../../app/labels";
import { can, viewerOf } from "../../app/policy";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState } from "../../components/States";
import { api, ApiError } from "../../services/api";
import type { RegistrationSummary } from "../../services/types";

const STATUS_SENTENCE: Record<RegistrationSummary["status"], string> = {
  draft: "Not published yet. People cannot register until you open registration.",
  open: "People can currently register.",
  closed: "Registration is currently closed. New submissions are refused.",
};

// The manager's registration: status, the public link, and the form. Everything shown comes from the server.
export function RegistrationPage() {
  const { eventId = "" } = useParams();
  const { state } = useAuth();
  const viewer = viewerOf(state);
  const canView = can(viewer, "event.registration.view", eventId);
  const canManage = can(viewer, "event.registration.manage", eventId);

  const [eventName, setEventName] = useState<string | null>(null);
  // undefined while loading, null when registration is not configured yet.
  const [registration, setRegistration] = useState<RegistrationSummary | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [slugDraft, setSlugDraft] = useState("");
  const [fieldCount, setFieldCount] = useState<number | null>(null);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    async function load() {
      try {
        const [{ event }, { registration: loaded }] = await Promise.all([api.getEvent(eventId), api.registration(eventId)]);
        if (cancelled) return;
        setEventName(event.name);
        setRegistration(loaded);
        setSlugDraft(loaded?.slug ?? "");
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load registration.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId, canView]);

  useEffect(() => {
    if (!showQr || !registration?.publicUrl) {
      setQrSrc(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(registration.publicUrl, { errorCorrectionLevel: "M", margin: 2, width: 220 })
      .then((url: string) => !cancelled && setQrSrc(url))
      .catch(() => !cancelled && setQrSrc(null));
    return () => {
      cancelled = true;
    };
  }, [showQr, registration?.publicUrl]);

  useEffect(() => {
    if (!canView || !registration) return;
    let cancelled = false;
    api
      .registrationForm(eventId)
      .then(({ fields }) => !cancelled && setFieldCount(fields.length))
      .catch(() => !cancelled && setFieldCount(registration.fieldCount));
    return () => {
      cancelled = true;
    };
  }, [eventId, canView, registration]);

  if (state.status !== "signed-in") return null;
  if (!canView) {
    return <p role="alert" className="error">Only event managers can see registration.</p>;
  }
  if (error) return <p role="alert" className="error">{error}</p>;
  if (registration === undefined || eventName === null) return <LoadingState>Loading registration…</LoadingState>;

  async function run(action: () => Promise<RegistrationSummary>, done: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      setRegistration(await action());
      setNotice(done);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function configure() {
    await run(async () => (await api.createRegistration(eventId)).registration, "Registration is configured. Review the form, then open registration.");
  }

  async function publish() {
    await run(async () => (await api.publishRegistration(eventId)).registration, "Registration is open. People can register from the link.");
  }

  async function close() {
    await run(async () => (await api.closeRegistration(eventId)).registration, "Registration is closed.");
  }

  async function changeLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(async () => (await api.changeRegistrationLink(eventId, slugDraft.trim())).registration, "The public address has changed. The old link no longer works.");
  }

  async function copyLink() {
    if (!registration?.publicUrl) return;
    try {
      await navigator.clipboard.writeText(registration.publicUrl);
      setNotice("Link copied.");
    } catch {
      setError("Copy failed. Select the link and copy it by hand.");
    }
  }

  const status = statusOf(REGISTRATION_STATUS, registration?.status ?? "draft");

  return (
    <section>
      <PageHeader
        title="Registration"
        description={`Configure how people register for ${eventName}.`}
      />
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}

      {registration === null ? (
        <Card title="Registration" description="Registration has not been configured for this event yet.">
          {canManage ? (
            <button type="button" onClick={configure} disabled={busy}>
              {busy ? "Configuring…" : "Configure registration"}
            </button>
          ) : (
            <p className="meta">An event manager can configure registration.</p>
          )}
        </Card>
      ) : (
        <div className="registration-grid">
          <Card
            title="Registration status"
            actions={<Badge tone={status.tone}>{status.label}</Badge>}
            footer={canManage ? registrationActions(registration.status, busy, publish, close) : undefined}
          >
            <p>{STATUS_SENTENCE[registration.status]}</p>
          </Card>

          <Card title="Registration link" description="Share this address, or show its QR code, so people can register.">
            {registration.publicUrl ? (
              <>
                <p className="link-text"><a href={registration.publicUrl} target="_blank" rel="noopener noreferrer">{registration.publicUrl}</a></p>
                <div className="row-actions">
                  <button type="button" className="btn-secondary" onClick={copyLink}>Copy link</button>
                  <a className="btn-secondary" href={registration.publicUrl} target="_blank" rel="noopener noreferrer">Open registration</a>
                  <button type="button" className="btn-secondary" aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
                    {showQr ? "Hide QR code" : "QR code"}
                  </button>
                </div>
                {showQr && (
                  <div className="qr-box">
                    {qrSrc ? (
                      <img src={qrSrc} alt={`QR code for ${registration.publicUrl}`} width={220} height={220} />
                    ) : (
                      <p className="status">Generating QR code…</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="notice">No public address is set on this server, so there is no link or QR code yet.</p>
            )}

            {canManage && (
              <form onSubmit={changeLink} className="form address-form">
                <label>
                  Public address
                  <input
                    value={slugDraft}
                    onChange={(e) => setSlugDraft(e.target.value)}
                    maxLength={80}
                    aria-describedby="address-help"
                    required
                  />
                </label>
                <p id="address-help" className="meta">
                  Lowercase letters, digits and hyphens. Changing it stops the current link working.
                </p>
                <div className="form-actions">
                  <button type="submit" className="btn-secondary" disabled={busy || slugDraft.trim() === registration.slug}>
                    Change address
                  </button>
                </div>
              </form>
            )}
          </Card>

          <Card
            title="Registration form"
            description={`Your form currently has ${fieldCount ?? registration.fieldCount} fields.`}
            actions={canManage ? <Link className="btn-secondary" to={`/events/${eventId}/registration/form`}>Edit form</Link> : undefined}
          >
            <p className="meta">Questions people answer when they register, and which of them are required.</p>
          </Card>
        </div>
      )}
    </section>
  );
}

function registrationActions(status: RegistrationSummary["status"], busy: boolean, publish: () => void, close: () => void) {
  if (status === "open") {
    return (
      <button type="button" className="btn-secondary" onClick={close} disabled={busy}>
        Close registration
      </button>
    );
  }
  return (
    <button type="button" onClick={publish} disabled={busy}>
      {status === "closed" ? "Reopen registration" : "Publish registration"}
    </button>
  );
}

// Names the server's own message, and the field or step it refers to when it gives one.
function messageOf(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Try again.";
  const details = Array.isArray(err.details) ? (err.details as { message?: string }[]) : [];
  const first = details[0]?.message;
  return first ? `${err.message}: ${first}.` : err.message;
}
