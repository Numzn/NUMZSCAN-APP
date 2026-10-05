import { useEffect, useState } from "react";
import { Card } from "../../components/Card";
import { api } from "../../services/api";
import type { RegistrationSubmissionView } from "../../services/types";

type Loaded =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; submission: RegistrationSubmissionView | null };

const MATCH_NOTE: Record<RegistrationSubmissionView["identityMatch"], string> = {
  new: "A new person record was created for this registration.",
  reused: "Matched an existing person by name and phone number.",
  ambiguous: "Several people share this name and phone number, so a new person record was created. Check for a duplicate.",
};

// The answers a participant gave on their registration. Read-only, and shown only to people who may see registration.
export function RegistrationAnswers({ participantId }: { participantId: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    api
      .registrationAnswers(participantId)
      .then(({ submission }) => !cancelled && setLoaded({ status: "ready", submission }))
      .catch(() => !cancelled && setLoaded({ status: "failed" }));
    return () => {
      cancelled = true;
    };
  }, [participantId]);

  return (
    <Card title="Registration answers">
      {loaded.status === "loading" && <p className="status">Loading answers…</p>}
      {loaded.status === "failed" && <p className="meta">The answers could not be loaded.</p>}
      {loaded.status === "ready" && loaded.submission === null && (
        <p className="meta">This person was added by hand, not through the registration form.</p>
      )}
      {loaded.status === "ready" && loaded.submission && (
        <>
          <p className="meta">
            Reference {loaded.submission.reference} · submitted {formatDate(loaded.submission.submittedAt)}. {MATCH_NOTE[loaded.submission.identityMatch]}
          </p>
          <dl className="facts">
            {loaded.submission.answers.map((answer) => (
              <div key={answer.key} className="answer-row">
                <dt>{answer.label}</dt>
                <dd>{answer.type === "checkbox" ? (answer.value === "true" ? "Yes" : "No") : answer.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Card>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
