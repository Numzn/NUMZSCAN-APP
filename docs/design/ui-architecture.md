# EventPass UI architecture

Status: adopted with this change. Read this before adding a page or a navigation link.

## Why

Pages were built one at a time. Each one invented its own header, back link, and permission check. The result: four back-link styles, no shared navigation for an event's pages, no page titles, and role checks repeated in eleven files. This document fixes the structure so new screens fit without reinventing it.

## Principles

1. **One structure per level.** The app has four levels: app, section, event, record. Every page sits at exactly one level and inherits its navigation from that level.
2. **Navigation says where you are.** Each page shows breadcrumbs, and the current section is marked as current in every navigation.
3. **One policy.** The screens ask one module what a person may do. The server still enforces every rule, and the screens only hide what is not allowed.
4. **One heading per page.** The `h1` is the page's title, and every page sets the browser tab title from it.
5. **Calm by default.** One primary action per screen. Destructive actions need a second, explicit step.

## Information architecture

```
EventPass
├── Events                      /  and  /events
│   ├── New event               /events/new                       (administrators)
│   └── Event                   /events/:eventId                  (event shell)
│       ├── Overview            /events/:eventId                  (index: totals and role)
│       ├── Participants        /events/:eventId/participants
│       │   └── Register        /events/:eventId/participants/new (managers)
│       ├── Groups              /events/:eventId/groups
│       ├── Access              /events/:eventId/access           (managers view, administrators change)
│       └── Settings            /admin/events/:eventId            (administrators)
│   (Registration, Credentials, Checkpoints, Attendance and Reports are not built; they are not in the navigation.)
│   └── Person in an event      /event-participants/:participantId
└── Admin                       /admin                            (administrators, admin shell)
    ├── Overview                /admin
    ├── Users                   /admin/users
    │   └── User                /admin/users/:userId
    ├── Events                  /admin/events
    │   └── Event settings      /admin/events/:eventId
    └── Audit log               /admin/audit
```

Sign-in (`/login`) sits outside the app shell and has no navigation.

## Shells

A shell is a layout route. It owns navigation, and its children own content.

| Shell | Used by | Provides |
|---|---|---|
| **App shell** | Everything after sign-in | Sidebar: My events (managers and staff), the event's operations and setup while an event is open, and Workspace and Administration for administrators. Top bar: brand, the open event's name, account. Sign out in the sidebar. |
| **Event shell** | `/events/:eventId/*` | Breadcrumbs (Events, event name), the event's name, dates, and status. The event's sections are in the sidebar, not repeated as tabs. |
| **Admin shell** | `/admin/*` | The app sidebar's Administration section: Overview, Users, Manage events, Audit log. A drawer on a phone. |
| **Auth shell** | `/login` | Centred card, no navigation |

The sidebar shows only the event sections the viewer may use. Access is hidden from staff, and Settings is hidden from everyone but administrators. Sections are defined once, in `app/navigation.ts`.

The sidebar is the one event navigation. The event shell does not repeat it as tabs, and the phone drawer shows the same sections as the desktop sidebar.

An administrator's sidebar keeps the Workspace and Administration sections. Inside an event it also gets that event's operations and setup, between them.

## Page anatomy

Every content page follows the same order:

1. **Breadcrumbs.** Only when the page is more than one level deep.
2. **Page header.** `h1` title, a one-line description when useful, and at most two actions on the right.
3. **Notices.** Success notices appear directly under the header. Errors appear next to the control that caused them, or under the header for whole-page failures.
4. **Content.** Tables, cards, or a form. A page has one primary action.

A page must not render its own back link. Breadcrumbs replace back links everywhere.

`PageHeader` is the only component that renders the page title. It sets `document.title` to `{title} · EventPass`.

## Components

Shared building blocks, in `web/src/components/`:

- **PageHeader**: breadcrumbs, title, description, actions, and the document title.
- **Breadcrumbs**: an ordered list in a `nav` labelled "Breadcrumb". The last item is `aria-current="page"` and is not a link.
- **NavTabs**: a labelled `nav` of router links, with the active tab marked `aria-current`. Not used by the event shell any more; kept for sections that need local tabs.
- **Badge**: a status label with a tone (green, amber, red, blue, grey). Wording comes from `app/labels.ts`.
- **NotFound**: the page for unknown addresses and for admin pages a non-administrator opens.
- Existing: `Layout` (app shell), `RequireAuth`, `EventShell`, `AdminLayout`, `AdminRoute`.

Forms use `.form` (stacked) and `.toolbar` (a row of filters). Buttons use four variants: primary (`button` or `.btn`), secondary (`.btn-secondary`), danger (`.btn-danger`), and ghost (`.btn-ghost`, top bar only).

## Permissions

All UI permission checks go through `app/policy.ts`. Pages never compare roles themselves.

| Capability | Who |
|---|---|
| `app.admin` | Administrators |
| `event.create` | Administrators |
| `event.view` | Administrators, and anyone with access to the event |
| `event.manage` | Administrators, and event managers of that event |
| `event.access.view` | Administrators, and event managers of that event |
| `event.access.change` | Administrators |
| `participant.register` | Administrators, and event managers of that event |
| `credential.issue` | Administrators, and anyone with access to the event (staff included) |

The server enforces each of these. A capability the screen hides is still refused by the API if it is requested directly.

## States

Every data page handles four states, in this order:

1. **Loading.** One line: "Loading participants…".
2. **Error.** An alert with the server's message. Field-level details are named by their label.
3. **Empty.** One sentence saying what is missing, and the action that fixes it when the viewer may take it.
4. **Content.**

## Responsive rules

- **Phone (up to 640px).** Tables become labelled blocks. Shells stack. Tabs scroll sideways and never wrap. No page may scroll horizontally.
- **Tablet and desktop.** Content is at most 1280px wide. The sidebar is 248px.
- Form controls shrink to their container, so a long option never widens the page.

## Accessibility

- One `h1` per page, which is the title. Section titles are `h2`.
- Every navigation has a label, and the current item is marked.
- Every input has a visible label. A checkbox or select label may include its options.
- Focus is visible everywhere (`:focus-visible`). Route changes move focus to the page heading.
- Colour is never the only signal. Badges carry their wording.

## Routing conventions

- Addresses are nouns, plural for lists: `/events`, `/events/:id/participants`.
- The old address `/event-participants/:id` stays, because printed and bookmarked links use it.
- Administrator pages live under `/admin`. The event settings page is the one exception: it is reached from an event's tabs but keeps its `/admin` address, which is where administrators manage every event.
- Changing an address needs a redirect from the old one.

## Migration

1. Policy module replaces `app/roles.ts`. Every page asks `can()`.
2. Event shell wraps the event pages. Their back links become breadcrumbs.
3. `PageHeader` replaces each page's header, which also sets titles.
4. `NotFound` replaces the bare "Page not found." text.

## Not in this change

- Sharing one loaded event between the shell and its pages. Each page still loads the event itself. The sidebar and topbar share the list of events (`app/WorkspaceEvents.tsx`), not the open event.
- Registration, Credentials, Checkpoints, Attendance and Reports. Their navigation items are added when their pages exist.
- Renaming addresses.
- A shared notice component. Notices still use the existing classes.
