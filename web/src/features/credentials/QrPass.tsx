import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrPassProps {
  // The credential token itself. It is the QR payload and nothing else goes in the code.
  token: string;
  participantName: string;
  eventName: string;
  groupName: string | null;
}

export function QrPass({ token, participantName, eventName, groupName }: QrPassProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 2, width: 260 })
      .then((url: string) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <section className="pass" aria-label="QR camp pass">
      <p className="pass-event">{eventName}</p>
      <p className="pass-name">{participantName}</p>
      <p className="pass-group">{groupName ?? "No group assigned"}</p>
      {src ? (
        <img src={src} alt={`QR pass for ${participantName}`} width={260} height={260} />
      ) : (
        <p className="status">Generating QR…</p>
      )}
      <p className="pass-note">
        Shown once. Keep it private. Replacing a pass stops the old one working.
      </p>
      <button type="button" className="no-print" onClick={() => window.print()}>
        Print pass
      </button>
    </section>
  );
}
