# Record lifecycle retention, files, and hardening (Run 3)

## Dependency and baseline

This stacked run is based directly on `codex/record-lifecycle-operational-entities-run-2` commit `5a565a87e3555ca4eca2b1a50cdc91b835b9c015` and depends on draft PRs #17 and #18.

The baseline had no Firebase Storage configuration or rules. Project documents were display-only external URLs. Report PDFs were generated in memory and artifact records retained metadata/hashes, not storage objects. Approved report snapshots, report artifacts, delivery attempts, activity events, versions, update/import manifests, and export snapshots were browser immutable. Comments were still created directly by the browser. Run 3 preserves all immutable records and replaces the remaining unsafe paths.

## Managed document storage

Managed uploads flow only through authenticated server routes. Browser Storage access is denied. The server validates a 10 MiB limit, allowlisted MIME type, magic signature for PDF/PNG/JPEG, sanitized filename, project authorization, and computes SHA-256. It chooses:

`organizations/{organizationId}/projects/{projectId}/documents/{documentId}/versions/{versionId}/{sanitizedFilename}`

Metadata records storage provider, managed/external status, current version, visibility, category, MIME type, original filename, byte size, checksum, owner, actors/timestamps, retention class, and lock state. Version documents and objects are immutable. Replacement creates a new version and never overwrites. Firestore metadata failure triggers uploaded-object cleanup. Downloads are streamed by the authorized server and checksum-verified.

Legacy document URLs remain external links. AccelProjects never claims an external source was deleted; lifecycle actions affect only its link record. Contracts, billing documents, report artifacts, locked deliverables, and legal-held files block ordinary replacement/purge.

## Reports, communications, and calendar

Draft reports may trash/restore through the shared ledger. Submitted reports may withdraw back to draft. Approved reports may be voided with a reason or used to create a replacement draft. Voiding changes only server-owned workflow fields; the approved snapshot, PDF artifact metadata, portal/delivery history, and sent communication remain immutable. Supersession links the new draft to its source; the source becomes `superseded` only when the replacement is approved, creating an immutable bidirectional chain.

Only draft/failed communications may trash. Sending, accepted, unknown, and canceled states are retained; delivery attempts and attachment references stay immutable. Draft/failed local calendar records may trash. Scheduled events must use the existing Graph cancellation flow and retain provider IDs. Canceled events may archive but are never recreated by restore.

## Controlled comments

Comment creation, author edit, and manager redaction are server routes. Authors have a conservative 15-minute edit window. Each edit stores an immutable restricted revision before replacing the visible body. Manager redaction requires a reason, stores the original body only in server-restricted moderation history, clears it from the readable comment, and shows a tombstone. Browser comment writes/deletes and revision/moderation access are denied.

## Retention and legal hold

The versioned registry defines operational temporary, ordinary project, project trash, relationship, communication history, calendar history, approved report, report artifact, contract/billing, audit, and legal-hold classes plus legacy aliases. Each defines restore/purge timing, manual/schedulable/never mode, legal-hold support, administrator confirmation, and immutability. Defaults are deliberately conservative. Actual legal retention periods must be configured by the organization with qualified advice; this document makes no legal-retention claim.

Admins may set/release legal hold with a required reason and idempotency key. The state change is audited without restoring the record. Hold blocks preview/job creation and automated processing. Sensitive hold reasons live in internal operation history and are never exposed to project managers or clients. Update via File cannot set or release hold.

## Durable operational purge

Ordinary lifecycle endpoints reject `purge`; administrators must create an immutable-idempotency-keyed purge job and explicitly run it. Jobs record planned/running/completed/failed state, reversible versus irreversible stages, bounded progress, safe errors, retained-copy disclosure, and retry state. Managed document jobs delete every version object, verify all deletion results, recursively delete metadata/subcollections, and retain operation/job tombstones. External-link jobs remove only AccelProjects metadata.

No scheduler exists. The secure admin route is the invocation contract for a future Cloud Scheduler/Cloud Run caller. It is not deployed. Interrupted jobs can be rerun; completed jobs are idempotent. Storage cleanup failure stops metadata deletion and records failure instead of silently partially succeeding.

## Operational purge versus compliance erasure

Operational purge removes live records and managed storage objects. It may retain lifecycle tombstones, approved report snapshots, delivered attachments, activity/version history, and canonical export snapshots under their retention policy. UI and operation/job records disclose those retained copies and never claim complete erasure.

Compliance erasure is a separate administrator-only governance process that would locate and lawfully redact permitted personal/sensitive content across immutable snapshots and audit stores. It is not implemented here. Approved report snapshots are never silently rewritten.

## Diagnostics and restoration

The admin dry-run diagnostics route reports failed/partial operations, purge jobs, eligible records, holds, legacy project records without lifecycle metadata, operation counts, and retained-snapshot semantics. It performs no writes. Storage orphan/missing-object expansion should use bucket inventory in the deployment environment.

Restores continue to revalidate project revision, task phase, dependency graph, member status, client/owner references, and legal hold. Managed document restore additionally requires retained metadata/version objects; no provider calendar event is recreated automatically. Unresolvable restores remain blocked with a resolution plan.

## Deployment steps not performed

1. Configure `FIREBASE_STORAGE_BUCKET` on the server and a least-privilege Admin SDK identity.
2. Review organization-specific retention periods and legal-hold permissions.
3. Deploy the authenticated server routes.
4. Deploy `firestore.rules` and `storage.rules` only after Java-enabled emulator tests pass.
5. Configure Storage CORS only if a future direct-download design needs it; current server streaming does not.
6. Review Firestore indexes for diagnostics queries; current queries use single-field indexes.
7. Run admin diagnostics in dry-run mode and reconcile legacy external links.
8. Optionally configure Cloud Scheduler to invoke the secure purge-runner contract with service authentication.

No rules, indexes, Storage bucket/CORS, scheduler, migration, server infrastructure, legal hold, purge job, Microsoft Graph operation, or production data change is deployed by this branch.

## Remaining limitations

Full compliance erasure, bucket-wide orphan inventory, malware scanning/quarantine, direct client-visible document delivery, scheduled purge deployment, and jurisdiction-specific retention configuration remain deployment/governance work. The app does not infer executable safety from extension alone, but production uploads should add a malware-scanning service before broad external ingestion.
