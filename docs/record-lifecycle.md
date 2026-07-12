# Record lifecycle architecture (Run 1)

## Baseline audit (before implementation)

Main at `c48c75d` used workflow `status` fields and had no shared lifecycle state. Firestore allowed browser hard deletes for users (admin), clients (admin), projects (admin), and manager-controlled members, phases, tasks, dependencies, risks, documents, metrics, and milestones. Task comments allowed any project reader to write, including delete. Communications and calendar events already retained sent/scheduled history; delivery attempts, report records/snapshots/artifacts, activity events, versions, export snapshots, update manifests, import manifests, and portal projections were server-only or immutable. Project structural browser mutations created versions and revisions, but deletion was client-orchestrated. Update via File schemas 1.0/1.1 treated omitted collection records as physical transaction deletes, blocking only commented tasks and phases still in use. No Storage rules or managed Firebase Storage integration exists; document URLs and generated report artifacts are Firestore metadata/PDF bytes, so storage-object purge remains future work.

Recent merged work reviewed: operational readiness/security (#13), revision/export (#8), Update via File (#9), communications/calendar (#14), client reporting/PDF (#15), and the client portal (#16). CI is represented by package quality commands and `scripts/check-committed-files.mjs`; no `.github/workflows` directory exists.

## Model and invariants

Workflow status and lifecycle are independent. Missing `lifecycle` means `active` without a write. New transitions write nested schema-versioned metadata only to the affected record. Operational states are `active`, `archived`, `trashed`, and relationship-only `removed`; `purged` exists only in the immutable operation ledger. `resolved`, `canceled`, `voided`, and `superseded` remain workflow outcomes.

All lifecycle transitions use authenticated, allowlisted server routes. Browser rules deny hard delete, lifecycle creation/forgery, and lifecycle-operation access. A preview binds entity state, deterministic impacts, action, and expected revision into a token. Apply rechecks authorization, token, revision, retention/legal hold, and idempotency in a transaction; it writes a version, activity event, and organization operation ledger entry. Purge requires admin role, eligibility, no legal hold, and confirmed impact. Immutable history is retained.

## Maintained lifecycle matrix

Role `manager` means admin or project owner/lead project manager. All initiations below are server-only; ordinary browser edits may not change lifecycle fields.

| Entity | Actions / disallowed | Role & impact | Restore / retention | Immutable / purge | Revision / activity | External effect |
|---|---|---|---|---|---|---|
| Organization user | archive, restore; no delete | admin; ownership/assignments | yes / operational | no purge in Run 1 | no / operation audit | identity disablement future |
| Client | archive, restore, constrained trash; merge future | admin; projects/contracts | yes / business 7y | conditional purge | no / operation audit | none |
| Project | archive, trash, restore, purge | manager; all contained/immutable records | yes / business 7y | admin purge | yes / yes | none |
| Project membership | remove, restore, purge; never user delete | manager; ownership/assignments | yes / relationship 30d | conditional | yes / yes | access change |
| Phase | trash, restore, purge | manager; contained tasks block purge | yes / operational 30d | conditional | yes / yes | none |
| Task/work item | trash, restore, purge | manager; comments, dependencies, events, reports/snapshots | yes / operational 30d | conditional | yes / yes | linked event retained |
| Task comment | controlled edit/redaction; no ordinary delete | manager; audit references | tombstone / business 7y | retained | controlled revision | none |
| Task dependency | remove, restore/undo, purge | manager; both endpoints | yes / relationship 30d | conditional | yes / yes | none |
| Milestone | trash, restore, purge | manager; tasks/reports/calendar | yes / operational 30d | conditional | yes / yes | linked event retained |
| Risk | resolve, archive, trash, restore, purge | manager; reports/snapshots | yes / operational 30d | conditional | yes / yes | none |
| Document | archive, trash, restore, purge | manager; ownership, report/contract references, storage | yes / business 7y | protected types block purge | yes / yes | managed object future |
| Document version | none | server history | no / business 7y | immutable | no / no | none |
| Metric | archive, trash, restore, manual-definition purge | manager; reports/snapshots | yes / operational 30d | conditional | yes / yes | none |
| Communication | trash unsent draft; cancel; no sent delete | manager; delivery/source refs | no / business 7y | accepted/sent retained | yes / yes | provider cancellation future |
| Delivery attempt | none | server only | no / permanent audit | immutable, no purge | no / no | provider evidence |
| Calendar event | trash local draft; cancel scheduled; no history delete | manager; provider/link refs | no / business 7y | scheduled retained | yes / yes | cancellation may call provider |
| Report | trash draft, withdraw submitted, void/supersede approved | manager; snapshots/artifacts/publications | draft only / business 7y | approved retained | yes / yes | portal/email publication |
| Report snapshot | none | server only | no / permanent audit | immutable | no / no | portal publication |
| Report artifact | none when tied to approved snapshot | server only | no / permanent audit | immutable | no / no | PDF/email attachment |
| Activity event | none | internal read only | no / permanent audit | immutable | no / no | none |
| Project version | none | manager read | no / permanent audit | immutable | no / no | none |
| Export snapshot | none | manager read | no / permanent audit | immutable | no / no | downloaded package |
| Update manifest | none | manager read | no / permanent audit | immutable | no / no | uploaded package evidence |
| Import manifest | none | internal read | no / permanent audit | immutable | no / no | uploaded package evidence |

## Firestore schema

Lifecycle metadata lives at `record.lifecycle`: `{schemaVersion,state,retentionClass,archived|trashed|removed|restored,purgeEligibleAt,legalHold,lastOperationId}`. Legacy absence normalizes to active. Immutable ledger documents live at `organizations/{organizationId}/recordLifecycleOperations/{operationId}` and contain only sanitized actor/reason, impact counts, revisions, status, retention, and reversal linkage—never credentials, provider payloads, or tokens.

## API

`POST /api/projects/:projectId/lifecycle/:entityType/:entityId/impact` accepts `action`, `expectedProjectRevision`, `idempotencyKey`, and `reason`. `POST .../actions` additionally accepts `previewToken`, optional strategy, and confirmation. Both authenticate Firebase, resolve the organization profile and owner/lead membership, and reject arbitrary entity paths. Errors are stable safe codes (`revision_conflict`, `stale_preview`, `legal_hold`, `retention_not_satisfied`, `permission_denied`).

## Update via File 1.2

Exports now default to 1.2 and include `lifecycleOperations`. Versions 1.0/1.1 remain readable. Omission never deletes: an omitted existing record without a valid explicit operation blocks planning with `implicit_removal_not_allowed`; a valid operation converts the omission into a nested lifecycle transition retained in the result snapshot. Lifecycle metadata round-trips and participates in structural hashing. Direct edits to project identity/revision remain prohibited; actor, audit, retention and legal-hold mutation is not accepted as a package operation. Archive/trash/remove/restore appear as modifications containing lifecycle fields, never transaction deletes.

## Migration, deployment, and limitations

No backfill is required or performed. Reads are pure and legacy-safe; the first transition upgrades one record. Before release, deploy the authenticated server, then Firestore rules after emulator tests, and monitor safe error codes. No rules, indexes, Storage configuration, migrations, server infrastructure, or production data are deployed by this PR. Run 2 must add entity-page controls, trash/archive views, full report-reference queries, task-comment redaction, external-provider cancellation, client merge, managed Storage deletion, scheduled retention purge, and broad UI filtering. Composite indexes may be needed as impact analyzers expand.
