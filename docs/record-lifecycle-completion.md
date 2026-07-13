# Record lifecycle completion and integration

## Audited baseline

The integration branch starts at PR #19 head `5ea24b12f519be677e1c5e080bc9cff375f6b422`, which contains PR #18 head `b5f674cf4077ce7c1b118420ad3945d5a81fc527` and PR #17 head `a2536efe5fc02946a0be51826da760830d6ff750`. All are ultimately based on current `main` `c48c75da01b188237083fa5e299a33957e743290`; no lifecycle commit was duplicated.

PR #19 named the superseded Run 2 commit `5a565a87e3555ca4eca2b1a50cdc91b835b9c015`, while its actual merge commit contains the later membership authorization fix at `b5f674c`. It also reported emulator tests as unavailable, although they now run. The actual baseline defects were bulk task lifecycle, non-purge durable cascades, incomplete historical traversal, partial bucket inventory, Storage rules absent from CI, no deterministic emulator fixture, mismatched preview/apply idempotency keys, an undeclared member-impact variable, stale documentation, and no executable preflight.

Baseline verification before completion changes: type-check passed; 157 unit/component/server tests passed; 23 Firestore rules tests passed; 2 Storage rules tests passed; production build, committed-file guard, and diff check passed.

## Completion matrix

`N/A` means deletion is deliberately prohibited because the record is immutable evidence. Browser results are recorded in the integration PR after the emulator smoke run.

| Entity | Supported actions | UI available | Server handler available | Impact analyzer available | Restore available | Purge available | Firestore rule coverage | Storage rule coverage | Automated integration test | Browser acceptance test | Remaining defect |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Clients | archive, trash, restore | Yes | Yes | Yes | Yes | Admin job when unreferenced | Yes | N/A | Yes | Pass | Client merge is separate scope |
| Projects | archive, trash, restore | Yes | Yes | Yes | Yes, explicit project-wide option | Admin job | Yes | N/A | Yes | Pass | None |
| Memberships | add, role, remove, restore | Yes | Yes | Yes | Yes | Admin job | Fail-closed access | N/A | Yes | Pass | Production backfill is operator work |
| Phases | trash with cascade/reassign, restore | Yes | Yes | Yes | Yes | Admin job | Yes | N/A | Yes | Pass | None |
| Tasks | trash and bulk trash/restore | Yes | Yes | Yes | Yes, resolution plan | Admin job | Yes | N/A | Yes | Pass | None |
| Comments | create, timed edit, redact | Yes | Yes | Parent impact | Retained with task | No ordinary purge | Server-only history | N/A | Yes | Pass | Compliance erasure is separate |
| Dependencies | remove, restore | Yes | Yes | Yes | Cycle/duplicate checked | Admin job | Yes | N/A | Yes | Pass | None |
| Milestones | trash, restore | Yes | Yes | Yes | Yes | Admin job | Yes | N/A | Yes | Pass | None |
| Risks | resolve/reopen, archive, trash, restore | Yes | Yes | Yes | Yes | Admin job | Yes | N/A | Yes | Pass | None |
| Documents | archive, trash, restore, purge | Yes | Yes | Yes | Object revalidated | Durable admin purge | Yes | Browser denied | Yes | Pass | Malware scanning is deployment scope |
| Document versions | immutable create/download | Yes | Yes | Retained | N/A | With parent | Server-only metadata | Browser denied | Yes | Pass | None |
| Metrics | archive, trash, restore | Yes | Yes | Yes | Yes | Manual/imported only | Yes | N/A | Yes | Pass | Computed metrics protected by design |
| Communications | eligible draft trash/restore | Yes | Yes | Yes | Draft/failed only | Eligible drafts | Yes | N/A | Yes | Pass | Provider copies are external |
| Delivery attempts | immutable retention | Read-only | Yes | Retained | N/A | N/A | Immutable | N/A | Yes | Pass | Intentionally retained |
| Calendar events | draft trash/restore; provider cancel; archive | Yes | Yes | Yes | Local draft only | Eligible local record | Provider fields protected | N/A | Yes | Pass | Emulator avoids live provider calls |
| Reports | draft trash/restore; withdraw, void, supersede | Yes | Yes | Yes | Draft only | Non-approved draft | Server-only workflow | N/A | Yes | Pass | None |
| Report snapshots | immutable retention | Read-only | Yes | Retained | N/A | N/A | Immutable | N/A | Yes | Pass | Intentionally retained |
| Report artifacts | immutable retention | Read/download | Yes | Retained | N/A | N/A | Immutable | Server streaming | Yes | Pass | Intentionally retained |
| Activity events | immutable retention | Read-only | Yes | Retained | N/A | N/A | Immutable | N/A | Yes | Pass | Intentionally retained |
| Project versions | immutable retention | Read-only | Yes | Retained | N/A | N/A | Immutable | N/A | Yes | Pass | Intentionally retained |
| Export snapshots | immutable retention | Manager UI | Yes | Retained | N/A | N/A | Immutable | N/A | Yes | Pass | Intentionally retained |
| Update manifests | immutable retention | Update via File | Yes | Retained | N/A | N/A | Immutable | N/A | Yes | Pass | None |
| Import manifests | immutable retention | Import UI | Yes | Retained | N/A | N/A | Immutable after create | N/A | Yes | Pass | None |
| Lifecycle operations | immutable ledger | Records workspace | Server-only | Stores counts | N/A | Tombstone retained | Browser denied | N/A | Yes | Pass | Intentionally retained |
| Purge jobs | plan, run, retry | Admin API/UI | Yes | Retained-copy disclosure | N/A | Implements purge | Browser denied | Server cleanup | Yes | Pass | Scheduler not deployed |
| Legal holds | set, release | Admin API/UI | Yes | Blocks actions | N/A | Blocks purge | Cannot forge | Protects objects | Yes | Pass | Policy is organization-specific |

## Completed architecture

Bulk task actions use one deterministic selection, preview token, idempotency key, logical operation, project revision, version, and activity event. Comments remain; dependencies transition once; calendar, report, publication, communication, version, activity, export, update, import, and document-version references are traversed server-side and split into operational versus immutable impact. Restore re-reads current phases and the dependency graph and requires an explicit resolution plan for partial restoration.

Operations above the safe transaction threshold become server-owned `lifecycleJobs`: planned/running/completed/failed/canceled states, bounded batches, stored progress, idempotent retry, cancellation before writes, recovery-required failure, and a zero-pending integrity check before one final revision/ledger/version/activity commit. This covers project archive/trash/project-wide restore, phase cascade/reassignment, bulk task trash/restore, and membership reassignment. Browsers never orchestrate batches.

Update via File accepts export schemas 1.0, 1.1, and 1.2. Schema 1.2 omissions require explicit allowlisted lifecycle operations and retain the underlying record. Direct lifecycle, retention, audit, actor, and legal-hold metadata edits are rejected. Plans of at most 450 writes remain atomic; lifecycle-only plans above that threshold (up to 1,000 transitions) are revalidated server-side against role, source snapshot, base revision, duplicate file hash, current state, target existence, and legal hold, then queued into the same durable worker. Mixed large files are blocked with corrective guidance.

The admin-only Storage integrity API is dry-run, bounded to 100 objects and 100 metadata records, and resumes with separate bucket and metadata cursors. It detects missing objects, object-only records, duplicate and malformed paths, checksum mismatch, purged-record objects, failed uploads, and failed purges. It exposes safe paths/IDs only and has no repair action.

Operational purge is not compliance erasure. Approved snapshots, sent communications, delivery attempts, activity/version history, exports, update/import manifests, tombstones, provider copies, and backups may remain.

## Emulator browser acceptance

Authenticated smoke used the deterministic owner, client, and removed-contributor fixtures against Auth, Firestore, and Storage emulators plus the running API and Vite application. Tested routes were Home, Projects, Clients, Archive & Trash, Plan, Tasks, Risks, Files, Messages, Reports, Metrics, Team, and Project Settings. At 1440, 1280, 1024, 768, and 390 CSS pixels, the task lifecycle controls remained visible and the document/main viewport had no horizontal overflow. The 390-pixel bulk dialog stayed within the viewport without horizontal scrolling; native modal focus remained inside it; Escape closed it and restored focus to `Trash selected`.

The browser selected tasks in different phases, previewed dependency and retained comment/report/version/export/update/import impact, required `TRASH 2 TASKS`, and double-clicked the final action. The emulator recorded one new operation and one revision only. Home summary and project-attention metrics excluded the trashed tasks. Fresh-tab console checks for Messages, Reports, client portal isolation, and removed-member denial were clean. A client navigating directly to `/records` was routed to `/portal`; after `accessState` became `removed`, the contributor saw no authorized project data on the direct project URL.

## Safe rollout and preflight

No production action is performed by this branch. Use this order:

1. Deploy the `members(userId, accessState)` collection-group index and wait until ready.
2. Run `npm run migrate:membership-access-state` with production Admin credentials and review legacy IDs/values.
3. Run `npm run migrate:membership-access-state -- --apply` in an approved window.
4. Run the dry run again and require zero proposed updates.
5. Configure `FIREBASE_STORAGE_BUCKET`, bucket policy, and a least-privilege server identity.
6. Deploy the server/API while external lifecycle scheduling remains disabled.
7. Deploy Firestore rules, then Storage rules.
8. Deploy the application.
9. Run `npm run lifecycle:preflight` and `npm run lifecycle:diagnostics`; resolve missing index/bucket, legacy IDs/access states, invalid metadata, orphan phase references, failed jobs, and missing objects.
10. Enable the purge runner only after diagnostics are accepted.

Preflight is read-only and bounded to 1,000 memberships, 500 projects and 500 records per lifecycle collection per project, plus a 100-object Storage page.

## Scheduler contract (deployment-ready, not deployed)

Invoke `POST /api/admin/lifecycle/purge-jobs/{jobId}/run` with a Firebase ID token for a dedicated admin service identity, or wrap the same service in a private Cloud Run/Functions worker. Recommended settings: every 15 minutes, OIDC service authentication, no public invoker, two exponential-backoff retries, 10-minute timeout, concurrency 1 per organization, and alerts on failed/recovery-required jobs, old planned jobs, and repeated Storage failures. Configure Firebase credentials/project, `FIREBASE_STORAGE_BUCKET`, organization scope, and a worker-enable/dry-run flag. Disable safely by pausing the scheduler first; reversible pre-write jobs may be canceled.

Cloud Scheduler/Run/Functions, service accounts, alerts, rules, indexes, bucket settings, and production migrations are not deployed by this branch.
