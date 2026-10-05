# Registration v1

Status: built in this change. Read this before changing registration, the public form, or the way a submission
becomes a participant.

## Product model

```
PLATFORM ADMIN ── provisions the event
EVENT MANAGER ─── configures registration for one event (status, public address, form)
PUBLIC ────────── registers through the address and QR code, with no sign-in
EVENT PARTICIPANT ─ the person in the event, created by a registration or by hand
```

Registration belongs to one event. An event has at most one registration, with a status and a public address.

## Lifecycle

| Status | Public page | Submissions |
|---|---|---|
| `draft` | "Registration not open yet" (no form) | refused, `REGISTRATION_NOT_OPEN` |
| `open` | the form | accepted |
| `closed` | "Registration closed" (no form) | refused, `REGISTRATION_CLOSED` |

Publishing needs the three person fields on the form (see below). Closing needs an open registration. Reopening
is publishing again. An archived event is treated as closed, even if its registration is still open. The server
enforces every rule; the page only reflects it.

## Data model (migration `0003_registration.sql`, additive)

- `event_registrations`: one row per event. Holds the public `slug`, `status`, and the open and close times.
- `registration_fields`: one row per question. Holds the key, label, type, required flag, section, options, and
  `person_field`. Fields are **archived, never deleted**.
- `registration_submissions`: one row per accepted registration. Holds the confirmation `reference`, the
  participant it created, the browser's `client_request_id`, and how the person was identified.
- `registration_answers`: one row per answer. Each row holds a **snapshot** of the field's key, label and type at
  the time of submission.

Why snapshots: a manager may rename or archive a question after 50 people have answered it. The answer still
reads as it was asked, without keeping the old form as a separate version. This is the smallest model that keeps
history interpretable.

Keys are derived from the label once, and never reused, including archived keys. A stored answer therefore always
names one question for good.

## Person fields and the global Person

`first_name`, `last_name` and `phone` are the fields that identify the person. They are always present, always
required, and cannot be archived or retyped. Everything else (email, date of birth, church, district, emergency
contact, dietary needs) is an answer for this event. It does not change the global `people` table, which has no
columns for it. This follows the principle that event-specific data does not pollute the global identity.

## Identity: when is it the same person?

A registration reuses an existing person only when **both** match exactly:

- the normalised full name (case and spacing ignored), and
- the phone number's digits (spaces and punctuation ignored).

- **One match:** reused (`identity_match = reused`).
- **No match:** a new person (`new`).
- **Several matches:** a new person is created and **nothing is merged**. The submission is marked `ambiguous`.
  Someone should check for a duplicate. Merging is a manual decision.
- A person merged into another (`merged_into_id`) is never matched.

Name alone, or phone alone, is never enough. A different phone means a different person, even with the same name.
The matching algorithm is deliberately conservative: a duplicate is easier to resolve than a wrong merge.

Reuse keeps the one person across events. A person registered for two events has one record and two participants.

## Submissions: no duplicates, even under concurrency

- The browser creates a `submissionId` once per visit. A retry or a double press sends the same id, and the server
  returns the first confirmation (`200`) instead of registering again.
- The server takes an advisory lock on the submission id, so two identical requests run one after the other.
- The server takes a lock on the normalised name and phone, so two different registrations for the same person
  cannot both create a person.
- The existing unique key `(event_id, person_id)` on participants is the final guard. A second registration for the
  same person is refused with `ALREADY_REGISTERED`, and the existing record is left alone.
- The registration row is held in shared mode during a submission, so closing it cannot race a submission.

## Public surface and privacy

- `GET /api/v1/public/registration/:slug` returns the event's name and dates, the status, and the form only when
  open. It returns no participants, no IDs, no managers and no audit data. It is sent with `Cache-Control: no-store`.
- `POST /api/v1/public/registration/:slug` validates everything on the server. Unknown keys are refused, so the
  browser cannot add data the form does not ask for. Values are checked by type, options and length.
- The confirmation names the person's first name, the event and a reference such as `EP-7F3K9`. The reference
  uses an alphabet with no look-alike characters. It is not a database ID and grants no access.
- The public routes are rate-limited per address (`EVENTPASS_PUBLIC_REGISTRATION_LIMIT`, default 120 a minute).
- Error responses name the field or the state, never a stack trace or SQL.

The audit log records that a submission arrived and how the person was identified. It never records an answer.

## Who may see and change registration

| Capability | Who |
|---|---|
| `event.registration.view` | event managers of the event, and administrators |
| `event.registration.manage` | the same |

Staff cannot see registration, its answers, or its form. The public form is open to anyone with the link,
whatever their role.

On a participant's record, the registration answers are shown to managers only, because they contain personal
details such as date of birth and emergency contacts.

## Public address

The public address is built from `EVENTPASS_PUBLIC_URL`, never from the request. Blank means no link is offered,
and the manager sees a plain note instead. The address is `{base}/r/{slug}`.

The slug starts as the event's own slug. If another registration already uses it, the next free one is chosen
deterministically (`-2`, `-3`, …). A manager can change it explicitly, and the old link then stops working.
A change is audited.

## Audit

Entities follow the existing convention (action verb and entity):

| Entity | Actions |
|---|---|
| `registration` | `create`, `update` (link), `publish`, `close` |
| `registration_field` | `create`, `update`, `archive` |
| `registration_form` | `reorder` |
| `registration_submission` | `submit` (actor `public`, details: identity match only) |

## Known limits

- **Shared network address.** Behind the platform gateway every visitor may appear to come from one address, so
  both limits apply to all of them together: the public limit (`EVENTPASS_PUBLIC_REGISTRATION_LIMIT`) and the
  general API limit that every v1 route passes through (`EVENTPASS_API_LIMIT`, 600 a minute by default). A burst of
  registrations, or a busy dev session, can exhaust the general limit and refuse even sign-ins. Before production,
  confirm the gateway forwards the real client address and set trust-proxy deliberately, and size both limits for a
  whole church arriving at once.
- **Ambiguous matches have no review queue.** They are recorded and can be seen in the database, but there is no
  screen to resolve them yet.
- **Phone numbers are compared by digits.** `0971…` and `+260971…` are different numbers to the matcher. Adding
  country-code normalisation is a deliberate later change, because it could merge people wrongly.
- **Email is an answer, not a stored identity.** It is kept with the registration but is not used for matching.

## Not in v1

Custom identity rules, merging people, multi-page or conditional forms, calculated fields, editing a submitted
answer, camp pass delivery, payments, notifications, and reports. Each has its own decision and is not started.
