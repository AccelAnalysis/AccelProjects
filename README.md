# AccelProjects

Record lifecycle architecture, API contracts, schema evolution, security notes, and deployment limitations are documented in [`docs/record-lifecycle.md`](docs/record-lifecycle.md).
Operational lifecycle UI and entity behavior are documented in [`docs/record-lifecycle-run-2.md`](docs/record-lifecycle-run-2.md).
Retention-sensitive records, managed file storage, legal hold, purge jobs, and erasure semantics are documented in [`docs/record-lifecycle-run-3.md`](docs/record-lifecycle-run-3.md).

AccelProjects is a Firebase-backed internal project-management workspace. The original Mini Billing Messenger billing module remains in the repository, but the primary application surface is now AccelProjects project tracking, imports, exports, update-via-file, revisions, scheduling, risks, and account settings.

## Production-Capable Surfaces

- Firebase Authentication sign-in and sign-out.
- Firestore-backed organization users, clients, projects, members, phases, milestones, tasks, dependencies, risks, documents, metrics, activity, project communications, delivery attempts, calendar events, versions, export snapshots, update manifests, and import manifests.
- Project creation through validated AccelProjects Project Package imports.
- Existing-project updates through verified project export files.
- Project exports and immutable revision records.
- Task, schedule, milestone, dependency, risk, document, metric, and comment persistence through the established Firestore data layer.
- Account settings for profile display name, avatar initials, read-only account metadata, access summary, password reset, and persisted notification preferences.
- Manual project email composition with explicit confirmation, Microsoft Graph server-side sending, accepted/failed/unknown status recording, immutable delivery attempts, and project activity audit entries.
- Manual Outlook calendar event creation, update, open-in-Outlook, and cancel flows associated with projects.
- Secure read-only client portal access through server-authorized `/api/portal/*` routes, explicit portal-user and project grants, published project summaries, approved report publications, and client-safe PDF downloads.
- Backend API authentication for application-data and provider-status routes using Firebase ID tokens.
- CI quality gate for type-checking, unit/component/backend tests, Firestore rules tests, production build, and committed-file guard.

## Prototype Or Deferred Surfaces

- Role Preview and Client-Safe Preview are development/test-only UI aids, not authorization.
- Notification preferences are stored, but automatic notification/email delivery is not active yet.
- Microsoft Graph `202 Accepted` is recorded as accepted by Microsoft 365 for delivery, not delivered/read/received by the recipient.
- Client-visible communication and calendar classifications are stored for future portal expansion, but client-role users still cannot access internal project communications or calendar records.
- Portal clients can view only published project summaries and published approved report snapshots. Client comments, approvals, decisions, change requests, notifications, and document exchange are deferred.
- Recurring meetings and Teams meeting generation are not implemented.
- Dependency-aware schedule recalculation is not implemented; dependencies are validated and rendered, but the Gantt does not run a scheduling engine.
- Billing, Microsoft Graph email, Twilio SMS, Stripe checkout, and integration test tooling remain available for compatibility and development workflows, but test/demo controls are hidden from normal production navigation.
- Historical revision restore/rollback is not implemented.

## Authorization Model

Authorization comes from the authenticated Firebase user plus the Firestore organization-user profile at:

```text
organizations/org_accel_projects/users/{uid}
```

The real role in that document controls application permissions and Firestore access. The current roles are `admin`, `project_manager`, `contributor`, `viewer`, and `client`.

- Admins can access all organization projects and manage supported user roles.
- Project managers can read projects they own or projects where they are explicit members. They can manage schedules, project communications, and Outlook calendar events for owned or lead-member projects.
- Contributors and viewers can read only projects where they are explicit members.
- Contributors and viewers can read permitted internal communication/calendar history, but cannot send external project email or manage Outlook events.
- Contributors can update only allowed fields on their assigned tasks.
- Clients are blocked from the internal project workspace and routed to the read-only client portal.
- Client portal access requires an active server-managed `portalUsers/{uid}` record, an active read-only `portalUsers/{uid}/projectAccess/{projectId}` grant, a published `portalProjects/{projectId}` summary, and published report-publication records for any visible approved report snapshots.
- Self-service profile updates can change only display name, avatar initials, notification preferences, and updated timestamp.
- Users cannot self-promote, change organization identity, edit another user, delete another user, or alter protected profile fields.
- Organization document updates are admin-only and limited to supported fields.

Client portal persistence paths are intentionally denied to browser Firestore clients, including admins. The Express API uses Firebase Admin SDK after checking Firebase ID tokens, organization roles, portal status, client identity, project grants, and publication status.

Project membership documents are written with the user ID as the Firestore document ID for rule-checkable membership lookups. Legacy member documents whose document IDs are not user IDs should be audited and backfilled before relying on strict member-scoped access for those records.

## Development Preview And Tool Guards

Role preview is disabled by default. Enable it only in development or tests:

```bash
VITE_ENABLE_ROLE_PREVIEW=true
```

Development tools are disabled in production builds. Enable them only for development/test workflows:

```bash
VITE_ENABLE_DEVELOPMENT_TOOLS=true
```

The app still uses the real Firestore profile role for authorization. Preview mode never changes Firestore rules, backend API authorization, or the authenticated organization-user profile.

## Environment Setup

Copy `.env.example` to `.env`, fill in the Firebase values, and restart Vite:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=accelprojects.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=accelprojects
VITE_FIREBASE_STORAGE_BUCKET=accelprojects.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_ENABLE_FIREBASE_SIGNUP=false
VITE_ENABLE_ROLE_PREVIEW=false
VITE_ENABLE_DEVELOPMENT_TOOLS=false
```

Provider variables for Microsoft Graph, Twilio, and Stripe are also listed in `.env.example`. Do not commit real provider secrets.

Microsoft Graph project email and calendar require application permissions approved by an Entra administrator:

- `Mail.Send`
- `Calendars.ReadWrite`

The server uses app-only client credentials and restricts send/calendar mailbox use with:

```bash
MICROSOFT_SENDER_EMAIL=
MICROSOFT_CALENDAR_OWNER_EMAIL=
MICROSOFT_ALLOWED_MAILBOXES=
MICROSOFT_DEFAULT_TIME_ZONE=Eastern Standard Time
```

`MICROSOFT_CALENDAR_OWNER_EMAIL` defaults to the sender mailbox when omitted. Browser requests cannot choose arbitrary sender or calendar mailboxes. Admin capability checks return safe booleans and configured mailbox names only; they do not expose tenant secrets, client secrets, access tokens, token claims, or raw Graph errors.

Optional live Microsoft tests must be explicitly enabled with `MICROSOFT_ENABLE_LIVE_INTEGRATION_TESTS=true` and must use approved test mailboxes/recipients only. Standard tests mock Graph and must not send real email or invitations.

The backend Firebase Admin SDK verifies bearer ID tokens. Local development can use the project ID from `FIREBASE_PROJECT_ID`, `GCLOUD_PROJECT`, or `VITE_FIREBASE_PROJECT_ID`.

## Local Development

Install dependencies and start the app:

```bash
npm ci
npm run dev
```

The Vite app normally runs at `http://localhost:5173` and the API at `http://localhost:5174`.

Firestore rules tests require Java because the Firebase emulator depends on it. CI uses Temurin 21. On macOS with Homebrew, a local equivalent is:

```bash
brew install openjdk@21
JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:rules
```

## Validation Commands

Run the same quality gate locally:

```bash
npm ci
npm run typecheck
npm test
npm run test:rules
npm run build
git diff --check
```

The repository also includes:

```bash
npm run check:committed-files
```

That guard fails if generated or unrelated files such as `dist/`, `.DS_Store`, or `accelprojects-dashboard-redesign.png` are accidentally committed.

## CI

`.github/workflows/quality-gate.yml` runs on pull requests and pushes to `main`.

The workflow uses:

- Node.js `22.17.0`
- Temurin Java `21`
- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run test:rules`
- `npm run build`
- `npm run check:committed-files`

No production Firebase credentials are required for Firestore rules-unit tests.

## Backend API Protection

`/api/health` remains public and minimal. Stripe webhooks remain protected by Stripe signature verification and do not require Firebase bearer tokens.

Application-data routes and provider configuration checks require:

```http
Authorization: Bearer <firebase-id-token>
```

The server verifies the Firebase ID token, loads the organization-user profile, attaches `request.auth`, and returns:

- `401` for missing, invalid, or expired tokens.
- `403` for authenticated users without an authorized AccelProjects organization profile or role.

Microsoft Graph, Twilio, and Stripe configuration-check routes are admin-only and return non-sensitive status fields. They do not expose secrets, token values, or full credentials.

Project communication and calendar API routes additionally verify real project access on the server:

- Admins may manage all organization project communications and calendar events.
- Project managers may manage only projects they own or where they are an explicit lead member.
- Contributors and viewers may read permitted internal history but cannot send or manage.
- Client-role users are blocked from internal project communication and calendar APIs.

Email and calendar side effects require explicit confirmation. An ambiguous email timeout is stored as `unknown`; automatic retry is intentionally avoided because Microsoft may have already accepted the request. Manual retry after `unknown` must acknowledge duplicate-delivery risk. Calendar creates reuse a stored `transactionId` so deliberate retries are less likely to create duplicate Outlook events.

The frontend API client automatically includes the current Firebase ID token when a user is signed in and surfaces 401/403 responses as session/authorization errors.

## Account Settings

The profile menu routes to distinct settings surfaces:

- `/settings/profile`: edit display name and avatar initials; email and role are read-only.
- `/settings/account`: show email, provider, Firebase UID, verification state, and password-reset action for password accounts.
- `/settings/access`: show the real Firestore role, visual preview status, and visible project memberships.
- `/settings/notifications`: persist task assignment, due date, risk, project-message, and email-delivery preferences.

Notification preferences are saved now. Automatic delivery is deferred.

## Project Communications And Calendar

The Messages workspace stores project-scoped records under:

```text
organizations/{organizationId}/projects/{projectId}/communications/{communicationId}
organizations/{organizationId}/projects/{projectId}/communications/{communicationId}/deliveryAttempts/{attemptId}
organizations/{organizationId}/projects/{projectId}/calendarEvents/{calendarEventId}
```

Communication records support manual project-update email now and reserve `report_snapshot` plus attachment references for Run 3. Delivery attempts are immutable and contain status, HTTP status, safe error classification, and a request hash, but never access tokens, client secrets, full Graph responses, raw token payloads, or full message bodies.

Calendar records store local audit state, configured calendar owner, Outlook Graph event ID, iCalUId, web link, change key, and last sync fields. Cancelation preserves the local record. Linked tasks or milestones do not automatically update Outlook; users must deliberately sync/edit the event.

When attendees are included, Outlook sends invitations after confirmation.

## Project Imports

`/projects/import` creates a new project from package type `accelprojects.project` schema `1.0`.

Import validation checks required fields, enum values, date formats, numeric values, unique keys and aliases, missing references, duplicate dependencies, circular dependencies, and date ordering. Fatal errors block import. Completed or processing manifests with the same package ID or source hash block duplicate imports.

Imports do not create Firebase Authentication users, update existing projects, merge data, replace data, or delete records.

## Update Via File

`/projects/{projectId}/update` updates only the selected existing project from package type `accelprojects.project.export`.

The update workflow verifies the export snapshot, source hash, selected project identity, current base revision, immutable IDs, client identity, membership identity, assignees, document owners, dependency validity, and temporary IDs before persistence.

Supported update scope:

- Project fields: name, summary, status, health, priority, start date, target date, budget, currency.
- Collections: phases, milestones, tasks, task dependencies, risks, documents, metrics.

Not supported through update files:

- Client edits, project owner changes, membership changes, organization users, Firebase Authentication users, task comments, activity history rewrites, prior versions, prior snapshots, import manifests, arbitrary restores, or rollbacks.

Updates at or below the atomic limit use one Firestore transaction. A successful file update creates one project revision, one `ProjectVersion`, one activity event, and one immutable update manifest keyed by uploaded-file SHA-256 hash. Atomic updates also store one canonical result snapshot. Schema 1.2 supports explicit archive, trash, restore, and relationship-removal operations while retaining the record; direct lifecycle, retention, actor, audit, and legal-hold edits remain forbidden.

Safety limits:

- Maximum atomic planned writes: 450. Larger lifecycle-only updates (up to 1,000 transitions) queue a server-owned durable job; mixed-content files must be split.
- Maximum canonical snapshot JSON size: 700,000 UTF-8 bytes.

## Current Next Work

- Run 5: client comments, approvals, decisions, change requests, notifications, and document exchange.
- Add automatic notification delivery using the persisted preferences.
- Add dependency-aware schedule recalculation when the scheduling model is ready.
- Design restore/rollback workflows for historical revisions.

Firestore rules for the Operational Readiness Gate 1 model have been deployed to the live Firebase project. Deploy updated rules again before live-testing newly added portal collections in production.
