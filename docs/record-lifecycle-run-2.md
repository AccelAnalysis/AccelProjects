# Record lifecycle operational entities (Run 2)

> Historical note: the completion integration closes the bulk-task, durable-job, and historical-reference deferrals below. Use `record-lifecycle-completion.md` for current behavior.

## Dependency and baseline

This stacked run is based on `codex/record-lifecycle-foundation-run-1` commit `a2536efe5fc02946a0be51826da760830d6ff750` and depends on draft PR #17. It must not merge before Run 1.

Run 1 verification found four operational gaps: lifecycle blockers could be bypassed with a `confirmed` request, removed membership metadata did not affect Firestore membership access predicates, no authorized lifecycle workspace/history route existed, and task/phase/member relationship strategies were not applied atomically. Run 2 fixes those prerequisites while preserving the Run 1 policy, ledger, revision, preview-token, and idempotency model.

## Operational behavior

- Projects expose archive and trash from Project Settings. Active routing, project switchers, Home metrics, Projects cards, portfolio timelines, and global search exclude archived/trashed records. If the selected project becomes non-active, routing returns to Projects and selects another active project when available.
- Tasks expose Trash in the Tasks table. Task impact includes comments, inbound/outbound dependencies, calendar links, assignment, phase, and immutable-history warnings. Trashing lifecycle-removes active dependencies in the same project transaction.
- Phases use impact strategies: cascade contained tasks or reassign them to a validated active destination phase. Simple confirmation is blocked while active tasks remain.
- Dependency Manager removal now uses the lifecycle preview/apply service and operation ledger. Restore rejects duplicate or cyclic graphs and reports schedule revalidation warnings.
- Milestone removal now moves to Trash through the lifecycle service and is restorable from the centralized workspace.
- Risks retain workflow resolution/reopen through status changes, while archive/trash/restore use lifecycle operations. High-impact risk trash requires typed confirmation; approved report snapshots remain unchanged.
- Team membership removal requires ownership/last-lead checks and task/document reassignment to an active replacement member. Membership IDs use the deterministic user ID; legacy mismatches block with corrective guidance. Firestore access checks ignore removed memberships immediately, while historical actor fields remain unchanged.
- Clients support admin archive/trash/restore and constrained purge. Client projects are never archived implicitly; any project blocks client purge.
- Metrics default legacy `source` to manual in UI. Manual/imported definitions can archive/trash; computed metrics cannot trash/purge. Historical approved reports remain unchanged.

## Shared UI and workspace

`RecordActionsMenu`, `LifecycleImpactDialog`, `LifecycleReasonField`, `TypedConfirmationField`, `LifecycleStatusBadge`, `RestoreAction`, `PurgeEligibilityNotice`, `LifecycleOperationResult`, `ReassignmentPlanner`, and the Archive & Trash list are shared components. Native modal dialogs provide focus trapping and Escape behavior; the trigger regains focus after close. Apply is unavailable until a server impact preview succeeds, required reason/typed confirmation is supplied, and blockers are resolved. Duplicate clicks are disabled while requests run; stale preview/revision responses clear the preview.

`/records` is visible only to admins and project managers. Admins see organization clients and all accessible project records; managers see only owned or lead-managed project records. Filters cover project, entity, state, and search. Operation history is loaded through the authenticated server, never direct Firestore reads. Contributors, viewers, and clients receive no organization lifecycle history.

## API, rules, and transaction integrity

Run 2 retains the Run 1 project routes and adds admin-only organization-client lifecycle routes plus an admin/manager operation-history route. Project actions still write exactly one operation, project version, activity event, and revision. Phase task handling, task dependency removal, and membership reassignment occur in that same transaction. Server blockers cannot be overridden by a client confirmation flag. Browser hard-delete and lifecycle-forgery rules remain denied.

Membership discovery uses an always-present `accessState` (`active` or `removed`) in addition to immutable lifecycle metadata. Removal and restoration update both values in the authoritative transaction. Browser clients cannot change either field, and the collection-group loader queries both the authenticated `userId` and `accessState == active`.

### Membership migration and deployment order

Before deploying the updated application or rules, deploy the new `members(userId, accessState)` collection-group index, run `npm run migrate:membership-access-state` as a dry run with production Admin credentials, review the paths and inferred states, then run `npm run migrate:membership-access-state -- --apply`. The migration maps nested lifecycle state `removed` to `accessState: removed` and every other legacy membership to `active`; it is idempotent and only updates missing/invalid values. Verify that a second dry run reports zero updates before deploying the application and rules together. Missing `accessState` fails closed, so rolling out rules or the new loader before backfill would temporarily hide legacy active memberships. Rollback requires restoring the prior application and rules together; retaining the added field and index is harmless.

## Known limitations and deferred Run 3 scope

Bulk task trash, complete document/storage lifecycle, task-comment redaction, report supersession, communication-draft lifecycle, scheduled purge, provider cancellation, and client merge remain deferred. Project-wide cascade restoration is conservative: independently trashed child records are never implicitly restored. Full historical report-reference counts require a denormalized reference index; current previews retain immutable snapshots and disclose that preservation without rewriting them. Large operations beyond Firestore transaction limits are blocked rather than partially applied; a background durable worker remains future work.

No Firebase rules, indexes, migrations, Storage rules, server infrastructure, or production data are deployed by this branch.
