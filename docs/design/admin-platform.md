# Admin platform: design (v1)

Status: proposal for review. Nothing here is built yet.

## Purpose

Administrators run EventPass across events. Today they can create events, but they can't manage accounts, decide who can work on which event, or see who changed what. Those tasks are done directly in the database, which is error-prone and invisible to other admins. This platform puts them in the app, behind admin-only screens, with every change recorded.

Event managers and staff keep their current event pages. The admin platform adds a layer above them.

## Who it is for

- **Administrators** (`is_admin`): everything in this document.
- **Event managers and staff**: no admin screens. They can see the access list of their own event (managers only), as described below.

## What the system already gives us

- `users`, `event_memberships`, `sessions`, and `audit_log` tables exist (migrations 0001 and 0002). No schema change is needed for v1.
- A deactivated user loses access at once. The session check requires `users.is_active`.
- Event editing exists (`PATCH /api/v1/events/:eventId`). Managers can already use it.
- There is no API for user accounts, memberships, or reading the audit log. Those are the gaps.

## Information architecture

```
Admin (visible to administrators only)
├── Overview            /admin
├── Users               /admin/users
│   └── User            /admin/users/:id
├── Events              /admin/events
│   └── Event settings  /admin/events/:id
└── Audit log           /admin/audit

Event (existing pages, one addition)
└── Access              /events/:id/access     (managers: view; admins: manage)
```

The top bar gets an **Admin** link for administrators, next to *New event*. Inside the admin area, a left sidebar lists the four sections. On a phone it becomes a row of tabs above the content.

## Screens

**Overview** (`/admin`)
- Four counters: active accounts, administrators, open events, and changes in the last 7 days.
- A short list of the 10 most recent audit entries, each linking to the audit log.

**Users** (`/admin/users`)
- A table: name, email, role (Administrator or Member), status (Active or Deactivated), last sign-in.
- Search by name or email. Filter by status.
- *Add user* opens a form: email, display name, initial password (12 characters or more), and an *Administrator* checkbox. The form warns that the password must be shared by hand, because there is no email yet.

**User** (`/admin/users/:id`)
- The profile: name and email, editable by an administrator.
- *Access*: the list of events this person can work on, with their role in each. Links to each event's access page.
- Actions: *Reset password*, *Sign out everywhere*, *Deactivate* (or *Reactivate*).
- Deactivate asks for confirmation and states the effect: "This person is signed out and cannot sign in until reactivated. Their past actions stay in the audit log."

**Events** (`/admin/events`)
- The same list as today, plus status and a count of participants.
- *New event* stays here.

**Event settings** (`/admin/events/:id`)
- Name, dates, timezone, and status (Draft, Open, Closed, Archived).
- Closing or archiving an event does not delete anything. It is shown as a banner on the event page.

**Access** (`/events/:id/access`)
- A table: person, email, role (Event manager or Staff).
- Administrators: *Add person* (search existing users), change role, remove.
- Event managers: view only.
- Removing a person from an event does not affect their other events.

**Audit log** (`/admin/audit`)
- A table, newest first: time, who, what, which event, and a short detail line.
- Filters: person, action, event, date range.
- Entries are never editable. The database already blocks changes to the log.

## Permissions

| Action | Administrator | Event manager | Staff |
|---|---|---|---|
| Open any `/admin` page | Yes | No | No |
| Create, edit, deactivate users | Yes | No | No |
| Reset a password | Yes | No | No |
| Grant or remove administrator | Yes | No | No |
| View an event's access list | Yes | Own events | No |
| Add, change, or remove event access | Yes | No (proposed, see decisions) | No |
| Edit event settings | Yes | Yes (today) | No |
| Read the audit log | Yes | No | No |

The server enforces every row. The screens only hide what isn't allowed.

## Rules the server must enforce

1. **At least one active administrator** always exists. Deactivating or demoting the last one is refused with `LAST_ADMIN`.
2. **No self-lockout.** An administrator cannot deactivate or demote themselves. They can ask another administrator to do it.
3. **Deactivation ends sessions at once.** Every session of a deactivated user is revoked in the same transaction.
4. **Password reset ends sessions too.** Resetting a password signs the person out everywhere.
5. **Passwords are never returned or logged.** They are hashed as they are today (scrypt). The audit entry records that a reset happened, not the password.
6. **Email is normalised** to lower case and must be unique. The database already enforces this.
7. **Every admin action is audited** with the actor, the action, the entity, and a small detail object. Actions: `user.create`, `user.update`, `user.deactivate`, `user.reactivate`, `user.password_reset`, `user.sessions_revoke`, `membership.add`, `membership.change`, `membership.remove`, `event.update`.
8. **Admin routes return 404 to non-administrators**, the same way other hidden resources do today. This avoids confirming that the page exists.

## API additions (all administrator-only unless marked)

Errors follow the existing envelope: `{ error: { code, message, details } }`.

| Method and path | Purpose | Notes |
|---|---|---|
| `GET /api/v1/admin/users?q=&status=` | List users | Paged, 50 per page |
| `POST /api/v1/admin/users` | Create a user | Body: `email`, `displayName`, `password`, `isAdmin` |
| `GET /api/v1/admin/users/:id` | One user, with event access | |
| `PATCH /api/v1/admin/users/:id` | Edit name, administrator flag, active flag | Rules 1 to 3 |
| `POST /api/v1/admin/users/:id/password` | Reset password | Rule 4 |
| `POST /api/v1/admin/users/:id/sessions/revoke` | Sign out everywhere | |
| `GET /api/v1/events/:eventId/memberships` | Access list | Administrators and that event's managers |
| `POST /api/v1/events/:eventId/memberships` | Add a person | Body: `userId`, `role` |
| `PATCH /api/v1/events/:eventId/memberships/:userId` | Change role | |
| `DELETE /api/v1/events/:eventId/memberships/:userId` | Remove | |
| `GET /api/v1/admin/audit?limit=&before=&actor=&action=&eventId=` | Read the audit log | Newest first, cursor paged |

The existing `PATCH /api/v1/events/:eventId` is reused for event settings.

## Data

No migration is needed for v1. Two additions are proposed for later, and are not part of this build:
- `users.password_changed_at`, to support *force a change at next sign-in*.
- `users.last_sign_in_at`, for the user list. Today this is only in `users.last_login_at`, which may be empty.

## Build plan

1. **Backend, users.** Endpoints and rules 1 to 8, with tests for each rule, including the last-administrator and self-lockout refusals, and session revocation.
2. **Backend, access.** Membership endpoints with tests for cross-event refusals (a manager of event A cannot change event B).
3. **Backend, audit.** Read endpoint with tests for filters, and a check that a refused action writes no audit entry.
4. **Frontend.** Admin shell and overview; users list, create, and detail; event settings; access tab on the event page; audit log.
5. **Verification.** Browser run in the dev stack covering every screen, at desktop and 390px. Screenshots for review. Then a local commit. Deployment only after your approval.

## Decisions for you

1. **Event managers manage access?** Proposed: no. Only administrators add or remove people, and managers can view the list. Changing this later is easy.
2. **Initial passwords.** Proposed: an administrator sets the password and shares it in person, until email exists. Is that acceptable for now?
3. **Force a password change at first sign-in.** Proposed: not in v1. It needs the migration above.
4. **Who can see the user list.** Proposed: administrators only, since it includes everyone's email.
5. **Audit retention.** Proposed: keep everything. The log is append-only already.
