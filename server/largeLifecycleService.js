import { createHash } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { API_ORGANIZATION_ID, getAdminApp } from "./apiAuth.js";
import { cancelBulkLifecycleJob, runBulkLifecycleJob } from "./bulkLifecycleService.js";

const databaseDefault = () => getFirestore(getAdminApp());
const hash = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
const collectionByType = { projectMember: "members", phase: "phases", task: "tasks", taskDependency: "taskDependencies", milestone: "milestones", risk: "risks", document: "documents", metric: "metrics", report: "reports", communication: "communications", calendarEvent: "calendarEvents" };
const fileEntityType = { phases: "phase", milestones: "milestone", tasks: "task", taskDependencies: "taskDependency", risks: "risk", documents: "document", metrics: "metric" };
export class LargeLifecycleError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
const safeSegment = (value) => typeof value === "string" && value.length > 0 && value.length <= 200 && !value.includes("/");

function targetPath(projectId, entityType, entityId) {
  if (entityType === "project") return `organizations/${API_ORGANIZATION_ID}/projects/${projectId}`;
  const collection = collectionByType[entityType]; if (!collection) throw new LargeLifecycleError("unsupported_large_operation");
  return `organizations/${API_ORGANIZATION_ID}/projects/${projectId}/${collection}/${entityId}`;
}

function stateFor(action) { if (action === "restore") return "active"; if (action === "remove") return "removed"; return action === "archive" ? "archived" : "trashed"; }

export async function createLargeLifecycleJob(input, preview, { database = databaseDefault(), now = new Date() } = {}) {
  const id = `lifecycle_job_${hash(`${API_ORGANIZATION_ID}:${input.idempotencyKey}`)}`; const ref = database.doc(`organizations/${API_ORGANIZATION_ID}/lifecycleJobs/${id}`); const existing = await ref.get();
  if (existing.exists) return { job: existing.data(), queued: true, duplicate: true };
  const operationId = `lifecycle_${hash(`${API_ORGANIZATION_ID}:${input.idempotencyKey}`)}`; const items = [];
  items.push({ id: `target_${input.entityType}_${input.entityId}`, entityType: input.entityType, entityId: input.entityId, path: targetPath(input.projectId, input.entityType, input.entityId), operation: "lifecycle", state: stateFor(input.action), pending: true });
  if (input.entityType === "project" && ["archive", "trash"].includes(input.action)) for (const group of preview.impact.transition) for (const entityId of group.ids) if (collectionByType[group.entityType]) items.push({ id: `cascade_${group.entityType}_${entityId}`, entityType: group.entityType, entityId, path: targetPath(input.projectId, group.entityType, entityId), operation: "lifecycle", state: stateFor(input.action), parentOperationId: operationId, pending: true });
  if (input.entityType === "project" && input.action === "restore" && input.strategy === "project_wide_restore") for (const group of preview.impact.transition) for (const entityId of group.ids) if (collectionByType[group.entityType]) items.push({ id: `restore_${group.entityType}_${entityId}`, entityType: group.entityType, entityId, path: targetPath(input.projectId, group.entityType, entityId), operation: "restore_if_parent", state: "active", sourceOperationId: input.sourceOperationId, pending: true });
  if (input.entityType === "phase" && input.action === "trash" && input.strategy === "cascade_trash") for (const entityId of preview.impact.transition.flatMap((group) => group.entityType === "task" ? group.ids : [])) items.push({ id: `phase_task_${entityId}`, entityType: "task", entityId, path: targetPath(input.projectId, "task", entityId), operation: "lifecycle", state: "trashed", parentOperationId: operationId, pending: true });
  if (input.entityType === "phase" && input.action === "trash" && input.strategy === "reassign") for (const entityId of preview.impact.reassign.flatMap((group) => group.entityType === "task" ? group.ids : [])) items.push({ id: `phase_reassign_${entityId}`, entityType: "task", entityId, path: targetPath(input.projectId, "task", entityId), operation: "patch", patch: { phaseId: input.destinationPhaseId }, pending: true });
  if (input.entityType === "projectMember" && input.action === "remove" && input.strategy === "reassign") for (const group of preview.impact.reassign) for (const entityId of group.ids) items.push({ id: `member_reassign_${group.entityType}_${entityId}`, entityType: group.entityType, entityId, path: targetPath(input.projectId, group.entityType, entityId), operation: "patch", patch: group.entityType === "task" ? { assigneeId: input.replacementUserId } : { ownerId: input.replacementUserId }, pending: true });
  const job = { id, type: "large_lifecycle", organizationId: API_ORGANIZATION_ID, projectId: input.projectId, entityType: input.entityType, entityId: input.entityId, action: input.action, strategy: input.strategy ?? null, idempotencyKey: input.idempotencyKey, operationId, requestedBy: input.actor.id, requestedRole: input.actor.role, requestedAt: now.toISOString(), expectedProjectRevision: input.expectedProjectRevision, state: "planned", stage: "reversible", reversible: true, progress: { completed: 0, total: items.length }, errors: [], integrity: null };
  await ref.create(job);
  for (let offset = 0; offset < items.length; offset += 200) { const batch = database.batch(); items.slice(offset, offset + 200).forEach((item) => batch.set(ref.collection("items").doc(item.id), item)); await batch.commit(); }
  return { job, queued: true, duplicate: false };
}

export async function createFileLifecycleJob(input, { database = databaseDefault(), now = new Date() } = {}) {
  if (!["admin", "project_manager"].includes(input.actor?.role)) throw new LargeLifecycleError("manager_role_required", 403);
  if (!Array.isArray(input.operations) || input.operations.length < 446 || input.operations.length > 1000) throw new LargeLifecycleError("invalid_file_lifecycle_job", 400);
  if (![input.projectId, input.sourceSnapshotId, input.uploadedFileHash].every(safeSegment) || ![input.sourcePackageId, input.sourceSnapshotHash, input.resultStateHash].every((value) => typeof value === "string" && value.length > 0 && value.length <= 500)) throw new LargeLifecycleError("invalid_file_lifecycle_job", 400);
  const projectRef = database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${input.projectId}`);
  const snapshotRef = projectRef.collection("exportSnapshots").doc(input.sourceSnapshotId);
  const manifestRef = projectRef.collection("updateManifests").doc(input.uploadedFileHash);
  const [projectSnapshot, sourceSnapshot, existingManifest] = await Promise.all([projectRef.get(), snapshotRef.get(), manifestRef.get()]);
  if (!projectSnapshot.exists) throw new LargeLifecycleError("project_not_found", 404);
  if ((projectSnapshot.data().revision ?? 1) !== input.expectedProjectRevision) throw new LargeLifecycleError("revision_conflict", 409);
  if (!sourceSnapshot.exists) throw new LargeLifecycleError("unknown_export_snapshot", 409);
  const source = sourceSnapshot.data();
  if (source.packageId !== input.sourcePackageId || source.sourceHash !== input.sourceSnapshotHash || source.projectId !== input.projectId || source.baseRevision !== input.expectedProjectRevision) throw new LargeLifecycleError("source_snapshot_mismatch", 409);
  if (existingManifest.exists) return { job: { id: existingManifest.data().lifecycleJobId, state: "completed", progress: { completed: input.operations.length, total: input.operations.length } }, queued: true, duplicate: true };
  const seen = new Set();
  const normalized = input.operations.map((operation) => {
    const entityType = fileEntityType[operation.entityType];
    const key = `${operation.entityType}:${operation.entityId}`;
    if (!entityType || !["archive", "trash", "restore", "remove"].includes(operation.action) || !safeSegment(operation.entityId) || typeof operation.reason !== "string" || operation.reason.trim().length === 0 || operation.reason.length > 500 || seen.has(key)) throw new LargeLifecycleError("invalid_file_lifecycle_operation", 400);
    seen.add(key);
    return { ...operation, entityType, path: targetPath(input.projectId, entityType, operation.entityId) };
  });
  const targets = [];
  for (let offset = 0; offset < normalized.length; offset += 100) targets.push(...await Promise.all(normalized.slice(offset, offset + 100).map((operation) => database.doc(operation.path).get())));
  targets.forEach((target, index) => {
    if (!target.exists) throw new LargeLifecycleError("job_target_missing", 409);
    const lifecycle = target.data().lifecycle ?? {};
    const priorState = lifecycle.state ?? "active";
    if (normalized[index].expectedPriorState && normalized[index].expectedPriorState !== priorState) throw new LargeLifecycleError("stale_lifecycle_state", 409);
    if (lifecycle.legalHold === true && normalized[index].action !== "restore") throw new LargeLifecycleError("legal_hold_blocked", 409);
  });
  const id = `lifecycle_job_${hash(`${API_ORGANIZATION_ID}:file:${input.projectId}:${input.uploadedFileHash}`)}`;
  const ref = database.doc(`organizations/${API_ORGANIZATION_ID}/lifecycleJobs/${id}`);
  const existingJob = await ref.get();
  if (existingJob.exists) return { job: existingJob.data(), queued: true, duplicate: true };
  const operationId = `lifecycle_${hash(`${API_ORGANIZATION_ID}:file:${input.uploadedFileHash}`)}`;
  const job = { id, type: "file_update_lifecycle", organizationId: API_ORGANIZATION_ID, projectId: input.projectId, entityType: "project", entityId: input.projectId, action: "file_update", idempotencyKey: `file:${input.uploadedFileHash}`, operationId, requestedBy: input.actor.id, requestedRole: input.actor.role, requestedAt: now.toISOString(), expectedProjectRevision: input.expectedProjectRevision, sourceSnapshotId: input.sourceSnapshotId, sourcePackageId: input.sourcePackageId, sourceSnapshotHash: input.sourceSnapshotHash, uploadedFileHash: input.uploadedFileHash, resultStateHash: input.resultStateHash, state: "planned", stage: "reversible", reversible: true, progress: { completed: 0, total: normalized.length }, errors: [], integrity: null };
  await ref.create(job);
  for (let offset = 0; offset < normalized.length; offset += 200) { const batch = database.batch(); normalized.slice(offset, offset + 200).forEach((operation) => batch.set(ref.collection("items").doc(`${operation.entityType}_${operation.entityId}`), { id: `${operation.entityType}_${operation.entityId}`, entityType: operation.entityType, entityId: operation.entityId, path: operation.path, operation: "lifecycle", action: operation.action, state: stateFor(operation.action), reason: operation.reason, expectedPriorState: operation.expectedPriorState ?? null, pending: true })); await batch.commit(); }
  return { job, queued: true, duplicate: false };
}

function lifecyclePatch(job, item, current, now) {
  const prior = current.lifecycle ?? {}; const timestamp = now.toISOString(); const state = item.state; const deadline = new Date(now.getTime() + 30 * 86400000).toISOString();
  const reason = { code: job.type === "file_update_lifecycle" ? "update_file" : "large_lifecycle", ...(item.reason ? { note: item.reason } : {}) };
  return { schemaVersion: 1, state, retentionClass: prior.retentionClass ?? (item.entityType === "projectMember" ? "relationship_30d" : "operational_30d"), legalHold: prior.legalHold === true, lastOperationId: job.operationId, ...(item.parentOperationId ? { parentOperationId: item.parentOperationId } : {}), ...(state === "active" ? { restored: { at: timestamp, by: job.requestedBy } } : state === "archived" ? { archived: { at: timestamp, by: job.requestedBy, reason } } : state === "removed" ? { removed: { at: timestamp, by: job.requestedBy, reason, restoreDeadline: deadline }, purgeEligibleAt: deadline } : { trashed: { at: timestamp, by: job.requestedBy, reason, restoreDeadline: deadline }, purgeEligibleAt: deadline }) };
}

export async function runLargeLifecycleJob(jobId, { database = databaseDefault(), now = new Date(), batchSize = 150 } = {}) {
  const ref = database.doc(`organizations/${API_ORGANIZATION_ID}/lifecycleJobs/${jobId}`); const snapshot = await ref.get(); if (!snapshot.exists) throw new LargeLifecycleError("lifecycle_job_not_found", 404); const job = snapshot.data();
  if (job.type === "bulk_task_lifecycle") return runBulkLifecycleJob(jobId, { database, now, batchSize });
  if (job.state === "completed" || job.state === "canceled") return job;
  try {
    await ref.update({ state: "running", stage: "reversible_batches", updatedAt: now.toISOString() });
    const pending = await ref.collection("items").where("pending", "==", true).limit(Math.max(1, Math.min(batchSize, 200))).get(); const batch = database.batch(); let processed = 0;
    for (const itemDoc of pending.docs) { const item = itemDoc.data(); const target = database.doc(item.path); const current = await target.get(); if (!current.exists) throw new LargeLifecycleError("job_target_missing", 409); const currentLifecycle = current.data().lifecycle ?? {}; const currentState = currentLifecycle.state ?? "active"; if (item.expectedPriorState && item.expectedPriorState !== currentState) throw new LargeLifecycleError("stale_lifecycle_state", 409); if (currentLifecycle.legalHold === true && item.state !== "active") throw new LargeLifecycleError("legal_hold_blocked", 409); if (item.operation === "restore_if_parent" && currentLifecycle.parentOperationId !== item.sourceOperationId) { batch.update(itemDoc.ref, { pending: false, skipped: "independently_transitioned" }); processed += 1; continue; } const patch = item.operation === "patch" ? item.patch : { lifecycle: lifecyclePatch(job, item, current.data(), now), ...(item.entityType === "projectMember" ? { accessState: item.state === "active" ? "active" : "removed" } : {}) }; batch.update(target, { ...patch, lifecyclePendingJobId: job.id }); batch.update(itemDoc.ref, { pending: false, completedAt: now.toISOString() }); processed += 1; }
    await batch.commit();
    const remainingSnapshot = await ref.collection("items").where("pending", "==", true).count().get();
    const remaining = remainingSnapshot.data().count;
    const completed = job.progress.total - remaining;
    if (completed < job.progress.total) { await ref.update({ progress: { completed, total: job.progress.total }, updatedAt: now.toISOString() }); return { ...job, state: "running", progress: { completed, total: job.progress.total } }; }
    const project = database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${job.projectId}`); const timestamp = now.toISOString();
    await database.runTransaction(async (transaction) => { const current = await transaction.get(project); if ((current.data().revision ?? 1) !== job.expectedProjectRevision) throw new LargeLifecycleError("revision_conflict", 409); const before = current.data().revision ?? 1; const after = before + 1; const summary = job.type === "file_update_lifecycle" ? `Applied ${job.progress.total} lifecycle transitions from update file` : `${job.action} ${job.entityType}`; transaction.update(project, { revision: after, updatedAt: timestamp, lastStructuralChangeAt: timestamp }); transaction.set(project.collection("versions").doc(`version_${job.operationId}`), { id: `version_${job.operationId}`, projectId: job.projectId, revision: after, previousRevision: before, changeType: "lifecycle", summary, actorId: job.requestedBy, metadata: { operationId: job.operationId, lifecycleJobId: job.id }, createdAt: timestamp }); transaction.set(project.collection("activityEvents").doc(`activity_${job.operationId}`), { id: `activity_${job.operationId}`, projectId: job.projectId, actorId: job.requestedBy, type: "record_lifecycle", message: summary, metadata: { operationId: job.operationId, lifecycleJobId: job.id }, createdAt: timestamp }); transaction.set(database.doc(`organizations/${API_ORGANIZATION_ID}/recordLifecycleOperations/${job.operationId}`), { id: job.operationId, idempotencyKey: job.idempotencyKey, organizationId: API_ORGANIZATION_ID, projectId: job.projectId, entityType: job.entityType, entityId: job.entityId, entityDisplayLabel: job.entityId, action: job.action, requestedAction: job.action, actor: { id: job.requestedBy, role: job.requestedRole }, actorId: job.requestedBy, actorRole: job.requestedRole, reason: { code: job.type === "file_update_lifecycle" ? "update_file" : "large_lifecycle" }, requestedAt: job.requestedAt, appliedAt: timestamp, priorState: "active", resultingState: job.type === "file_update_lifecycle" ? "mixed" : stateFor(job.action), impactCounts: { processed: job.progress.total }, projectRevisionBefore: before, projectRevisionAfter: after, status: "applied", immutableHistoryRetained: true }); if (job.type === "file_update_lifecycle") transaction.set(project.collection("updateManifests").doc(job.uploadedFileHash), { id: job.uploadedFileHash, projectId: job.projectId, sourceSnapshotId: job.sourceSnapshotId, sourcePackageId: job.sourcePackageId, sourceSnapshotHash: job.sourceSnapshotHash, uploadedFileHash: job.uploadedFileHash, resultStateHash: job.resultStateHash, baseRevision: before, resultRevision: after, lifecycleJobId: job.id, operationId: job.operationId, appliedBy: job.requestedBy, appliedAt: timestamp }); transaction.update(ref, { state: "completed", stage: "integrity_verified", reversible: false, completedAt: timestamp, progress: { completed: job.progress.total, total: job.progress.total }, integrity: { planned: job.progress.total, processed: job.progress.total, missing: 0 } }); });
    return { ...job, state: "completed", stage: "integrity_verified", progress: { completed: job.progress.total, total: job.progress.total } };
  } catch (error) { const code = error instanceof LargeLifecycleError ? error.code : "large_lifecycle_failed"; await ref.update({ state: "failed", stage: "recovery_required", updatedAt: now.toISOString(), errors: [...(job.errors ?? []), { code, at: now.toISOString() }] }); throw error; }
}

export async function cancelLargeLifecycleJob(jobId, { database = databaseDefault(), now = new Date() } = {}) { const ref = database.doc(`organizations/${API_ORGANIZATION_ID}/lifecycleJobs/${jobId}`); const snapshot = await ref.get(); if (!snapshot.exists) throw new LargeLifecycleError("lifecycle_job_not_found", 404); const job = snapshot.data(); if (job.type === "bulk_task_lifecycle") return cancelBulkLifecycleJob(jobId, { database, now }); if ((job.progress?.completed ?? 0) > 0 || job.reversible === false) throw new LargeLifecycleError("job_cancellation_requires_recovery", 409); await ref.update({ state: "canceled", stage: "canceled_before_writes", canceledAt: now.toISOString() }); return { ...job, state: "canceled", stage: "canceled_before_writes" }; }
