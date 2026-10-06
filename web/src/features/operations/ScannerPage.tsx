import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { can, viewerOf } from "../../app/policy";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState } from "../../components/States";
import { api, ApiError } from "../../services/api";
import type { Checkpoint, Occurrence } from "../../services/types";
import { isCredentialToken } from "../credentials/pass";
import { startCameraReader, type CameraReader } from "./cameraReader";
import { describeRefusal, describeScan, type ScanNotice } from "./scanOutcome";

// The gate screen for staff: pick the checkpoint and service time, then scan a pass or type its code.
export function ScannerPage() {
  const { eventId = "" } = useParams();
  const { state } = useAuth();
  const allowed = can(viewerOf(state), "operations.scan", eventId);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[] | null>(null);
  const [checkpointId, setCheckpointId] = useState("");
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [occurrenceId, setOccurrenceId] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState<"off" | "on" | "unavailable">("off");
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<CameraReader | null>(null);
  const lastCamera = useRef<{ token: string; at: number }>({ token: "", at: 0 });
  // One attempt id per pass presented. A retry after a dropped connection reuses it, so the scan is recorded once.
  const pending = useRef<{ token: string; id: string } | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    api
      .checkpoints(eventId)
      .then(({ checkpoints: loaded }) => {
        if (cancelled) return;
        const open = loaded.filter((c) => c.active);
        setCheckpoints(open);
        if (open.length === 1) setCheckpointId(open[0].id);
      })
      .catch(() => !cancelled && setCheckpoints([]));
    return () => {
      cancelled = true;
    };
  }, [eventId, allowed]);

  useEffect(() => {
    setOccurrenceId("");
    if (!checkpointId) {
      setOccurrences([]);
      return;
    }
    let cancelled = false;
    api
      .occurrences(checkpointId)
      .then(({ occurrences: loaded }) => {
        if (cancelled) return;
        setOccurrences(loaded);
        if (loaded.length === 1) setOccurrenceId(loaded[0].id);
      })
      .catch(() => !cancelled && setOccurrences([]));
    return () => {
      cancelled = true;
    };
  }, [checkpointId]);

  // The camera is stopped when the page is left.
  useEffect(() => () => readerRef.current?.stop(), []);

  if (state.status !== "signed-in") return null;
  if (!allowed) return <p role="alert" className="error">You need a role on this event to scan.</p>;
  if (!checkpoints) return <LoadingState>Loading checkpoints…</LoadingState>;

  async function record(rawCode: string) {
    const token = rawCode.trim();
    setNotice(null);
    if (!checkpointId || !occurrenceId) {
      setNotice({ tone: "error", text: "Choose a checkpoint and a service time first." });
      return;
    }
    if (!isCredentialToken(token)) {
      setNotice({ tone: "error", text: describeRefusal("INVALID_INPUT") });
      return;
    }
    if (!pending.current || pending.current.token !== token) {
      pending.current = { token, id: crypto.randomUUID() };
    }
    setBusy(true);
    try {
      const result = await api.scan(eventId, {
        id: pending.current.id,
        credential: token,
        checkpointId,
        occurrenceId,
        scannedAt: new Date().toISOString(),
      });
      pending.current = null;
      setNotice(describeScan(result));
      setCode("");
    } catch (err) {
      if (err instanceof ApiError) {
        // A refusal is on record. Clear the attempt so the next pass starts fresh.
        pending.current = null;
        const name = (err.details as { participant?: { fullName: string } } | undefined)?.participant?.fullName;
        setNotice({ tone: "error", text: describeRefusal(err.code, name) });
        setCode("");
      } else {
        // The request never reached the server. Keep the attempt, so pressing again retries the same scan.
        setNotice({ tone: "error", text: "Not sent: check the connection, then press Record again." });
      }
    } finally {
      setBusy(false);
    }
  }

  function onManual(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void record(code);
  }

  async function startCamera() {
    setCameraMessage(null);
    try {
      if (!videoRef.current) throw new Error("no video element");
      readerRef.current = await startCameraReader(videoRef.current, (text) => {
        // The same pass stays in view for several frames. Ignore it for a few seconds after the first read.
        const now = Date.now();
        if (text === lastCamera.current.token && now - lastCamera.current.at < 4000) return;
        lastCamera.current = { token: text, at: now };
        if (!busy) void record(text);
      });
      setCamera("on");
    } catch {
      setCamera("unavailable");
      setCameraMessage("The camera is not available or permission was refused. Type the pass code instead.");
    }
  }

  function stopCamera() {
    readerRef.current?.stop();
    readerRef.current = null;
    setCamera("off");
  }

  return (
    <section>
      <PageHeader title="Scanner" description="Choose where and when you are operating, then scan a pass." />

      <div className="card form">
        <label>
          Checkpoint
          <select value={checkpointId} onChange={(e) => setCheckpointId(e.target.value)}>
            <option value="">Choose a checkpoint…</option>
            {checkpoints.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        {checkpoints.length === 0 && <p className="meta">No checkpoint is open. A manager must open one first.</p>}
        <label>
          Service time
          <select value={occurrenceId} onChange={(e) => setOccurrenceId(e.target.value)} disabled={!checkpointId}>
            <option value="">Choose a service time…</option>
            {occurrences.map((o) => (
              <option key={o.id} value={o.id}>{o.label} · {o.serviceDate}</option>
            ))}
          </select>
        </label>
      </div>

      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={notice.tone === "error" ? "error scan-result" : `notice scan-result scan-${notice.tone}`}>
          {notice.text}
        </p>
      )}

      <div className="card scanner-camera">
        {camera === "on" ? (
          <button type="button" className="btn-secondary" onClick={stopCamera}>Stop camera</button>
        ) : (
          <button type="button" onClick={startCamera} disabled={!checkpointId || !occurrenceId}>Use camera</button>
        )}
        <video ref={videoRef} muted playsInline className={camera === "on" ? "scanner-video" : "scanner-video is-hidden"} aria-label="Camera preview for scanning passes" />
        {cameraMessage && <p className="meta">{cameraMessage}</p>}
      </div>

      <form onSubmit={onManual} className="card form">
        <label>
          Pass code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="EP1:…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>
        <div className="form-actions">
          <button type="submit" disabled={busy || !code.trim() || !checkpointId || !occurrenceId}>
            {busy ? "Recording…" : "Record"}
          </button>
        </div>
      </form>
    </section>
  );
}
