import { createHash } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { API_ORGANIZATION_ID, getAdminApp } from "./apiAuth.js";
import { scanProjectReferences } from "./referenceImpactService.js";

const dbDefault = () => getFirestore(getAdminApp());
const maxSelection = 1000;
const transactionWriteLimit = 300;
const batchSizeDefault = 150;
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const operationId = (key) => `lifecycle_${hash(`${API_ORGANIZATION_ID}:${key}`).slice(0, 32)}`;
const jobId = (key) => `lifecycle_job_${hash(`${API_ORGANIZATION_ID}:${key}`).slice(0, 32)}`;
const lifecycleState = (value) => value?.lifecycle?.state ?? "active";

export class BulkLifecycleError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

function requireManager(actor) {
  if (!actor || !["admin", "project_manager"].includes(actor.role)) throw new BulkLifecycleError("permission_denied", 403);
}

function normalizedTaskIds(taskIds) {
  if (!Array.isArray(taskIds)) throw new BulkLifecycleError("task_selection_required");
  const ids = [...new Set(taskIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))].sort();
  if (!ids.length) throw new BulkLifecycleError("task_selection_required");
  if (ids.length > maxSelection) throw new BulkLifecycleError("task_selection_too_large", 413);
  return ids;
}

async function getSelectedTasks(project, ids) {
  return Promise.all(ids.map(async (id) => {
    const snapshot = await project.collection("tasks").doc(id).get();
    if (!snapshot.exists) throw new BulkLifecycleError("task_not_found", 404);
    return { id, ref: snapshot.ref, data: snapshot.data() };
  }));
}

function graphHasCycle(edges) {
  const graph = new Map();
  edges.forEach((edge) => graph.set(edge.taskId, [...(graph.get(edge.taskId) ?? []), edge.dependsOnTaskId]));
  const visiting = new Set(); const visited = new Set();
  const visit = (node) => { if (visiting.has(node)) return true; if (visited.has(node)) return false; visiting.add(node); if ((graph.get(node) ?? []).some(visit)) return true; visiting.delete(node); visited.add(node); return false; };
  return [...graph.keys()].some(visit);
}

export async function previewBulkTaskLifecycle(input, { database = dbDefault() } = {}) {
  requireManager(input.actor);
  if (!(["trash", "restore"].includes(input.action))) throw new BulkLifecycleError("unsupported_action");
  const taskIds = normalizedTaskIds(input.taskIds);
  const project = database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${input.projectId}`);
  const [projectSnapshot, tasks, dependencySnapshot] = await Promise.all([
    project.get(),
    getSelectedTasks(project, taskIds),
    project.collection("taskDependencies").limit(2000).get()
  ]);
  if (!projectSnapshot.exists) throw new BulkLifecycleError("project_not_found", 404);
  if ((projectSnapshot.data().revision ?? 1) !== input.expectedProjectRevision) throw new BulkLifecycleError("revision_conflict", 409);

  const selected = new Set(taskIds);
  const dependencies = dependencySnapshot.docs.filter((item) => selected.has(item.data().taskId) || selected.has(item.data().dependsOnTaskId));
  const comments = [];
  const retained = [];
  const operationalReferences = [];
  const warnings = [];
  const blockers = [];

  for (const task of tasks) {
    const commentSnapshot = await task.ref.collection("comments").get();
    commentSnapshot.docs.forEach((item) => comments.push(`${task.id}/${item.id}`));
    const references = await scanProjectReferences(database, input.projectId, task.id);
    retained.push(...references.retained);
    operationalReferences.push(...references.operational);
    warnings.push(...references.warnings);

    if (input.action === "trash" && lifecycleState(task.data) !== "active") blockers.push(`task_not_active:${task.id}`);
    if (input.action === "restore") {
      if (lifecycleState(task.data) !== "trashed") blockers.push(`task_not_trashed:${task.id}`);
      const replacementPhase = input.resolutionPlan?.moveTaskPhaseIds?.[task.id];
      const phaseId = replacementPhase || task.data.phaseId;
      const phase = phaseId ? await project.collection("phases").doc(phaseId).get() : null;
      if (!phase?.exists || lifecycleState(phase.data()) !== "active") blockers.push(`missing_active_phase:${task.id}`);
      if (task.data.lifecycle?.bulkGroupId && task.data.lifecycle.bulkGroupId !== input.sourceOperationId && !input.resolutionPlan?.allowPartial) blockers.push(`bulk_group_mismatch:${task.id}`);
    }
  }

  if (comments.length) warnings.push("task_comments_will_be_retained");
  if (retained.length) warnings.push("immutable_historical_references_will_be_retained");
  const dependencyIds = [...new Set(dependencies.map((item) => item.id))].sort();

  if (input.action === "restore") {
    const skip = new Set(input.resolutionPlan?.skipDependencyIds ?? []);
    const activeEdges = dependencySnapshot.docs
      .filter((item) => !dependencyIds.includes(item.id) && lifecycleState(item.data()) === "active")
      .map((item) => item.data());
    const restoredEdges = dependencies.filter((item) => !skip.has(item.id)).map((item) => item.data());
    const keys = new Set();
    for (const edge of [...activeEdges, ...restoredEdges]) {
      const key = `${edge.taskId}:${edge.dependsOnTaskId}`;
      if (keys.has(key)) blockers.push(`duplicate_dependency:${key}`);
      keys.add(key);
    }
    if (graphHasCycle([...activeEdges, ...restoredEdges])) blockers.push("dependency_cycle");
  }

  const impact = {
    transition: [{ entityType: "task", count: taskIds.length, ids: taskIds }],
    removeRelationships: dependencyIds.length ? [{ entityType: "taskDependency", count: dependencyIds.length, ids: dependencyIds }] : [],
    retainImmutable: [
      ...(comments.length ? [{ entityType: "taskComment", count: comments.length, ids: comments.sort() }] : []),
      ...retained
    ],
    operationalReferences,
    blockers: [...new Set(blockers)].sort(),
    warnings: [...new Set(warnings)].sort(),
    requiresTypedConfirmation: taskIds.length >= 10 || dependencies.length >= 20 || retained.length > 0
  };
  const tokenInput = { projectId: input.projectId, action: input.action, expectedProjectRevision: input.expectedProjectRevision, taskIds, sourceOperationId: input.sourceOperationId ?? null, resolutionPlan: input.resolutionPlan ?? null, states: tasks.map((task) => [task.id, lifecycleState(task.data), task.data.phaseId]), impact };
  return { projectRevision: input.expectedProjectRevision, taskIds, impact, previewToken: hash(tokenInput) };
}

function lifecycleFor(action, current, opId, actorId, now, bulkGroupId) {
  const timestamp = now.toISOString();
  if (action === "restore") return { schemaVersion: 1, state: "active", retentionClass: current?.retentionClass ?? "operational_30d", legalHold: current?.legalHold === true, lastOperationId: opId, bulkGroupId, restored: { at: timestamp, by: actorId } };
  const deadline = new Date(now.getTime() + 30 * 86400000).toISOString();
  return { schemaVersion: 1, state: "trashed", retentionClass: current?.retentionClass ?? "operational_30d", legalHold: current?.legalHold === true, lastOperationId: opId, bulkGroupId, purgeEligibleAt: deadline, trashed: { at: timestamp, by: actorId, reason: { code: "bulk_task_lifecycle" }, restoreDeadline: deadline } };
}

async function createBulkJob(input, preview, { database, now }) {
  const id = jobId(input.idempotencyKey); const ref = database.doc(`organizations/${API_ORGANIZATION_ID}/lifecycleJobs/${id}`);
  const existing = await ref.get(); if (existing.exists) return { job: existing.data(), queued: true, duplicate: true };
  const opId = operationId(input.idempotencyKey); const timestamp = now.toISOString();
  const job = { id, type: "bulk_task_lifecycle", state: "planned", stage: "reversible", organizationId: API_ORGANIZATION_ID, projectId: input.projectId, action: input.action, operationId: opId, idempotencyKey: input.idempotencyKey, requestedBy: input.actor.id, requestedAt: timestamp, expectedProjectRevision: input.expectedProjectRevision, taskIds: preview.taskIds, dependencyIds: preview.impact.removeRelationships.flatMap((item) => item.ids), resolutionPlan: input.resolutionPlan ?? null, progress: { completed: 0, total: preview.taskIds.length + preview.impact.removeRelationships.reduce((sum, item) => sum + item.count, 0) }, errors: [], reversible: true };
  await ref.create(job); return { job, queued: true, duplicate: false };
}

export async function applyBulkTaskLifecycle(input, { database = dbDefault(), now = new Date() } = {}) {
  const opId = operationId(input.idempotencyKey); const opRef = database.doc(`organizations/${API_ORGANIZATION_ID}/recordLifecycleOperations/${opId}`);
  const priorOperation = await opRef.get(); if (priorOperation.exists) return { operation: priorOperation.data(), duplicate: true, queued: false };
  const preview = await previewBulkTaskLifecycle(input, { database });
  if (preview.previewToken !== input.previewToken) throw new BulkLifecycleError("stale_preview", 409);
  if (preview.impact.blockers.length) throw new BulkLifecycleError("impact_blocked", 409);
  const dependencyIds = preview.impact.removeRelationships.flatMap((item) => item.ids);
  if (preview.taskIds.length + dependencyIds.length + 4 > transactionWriteLimit) return createBulkJob(input, preview, { database, now });
  const projectRef = database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${input.projectId}`);
  const timestamp = now.toISOString();
  return database.runTransaction(async (transaction) => {
    const [operationSnapshot, projectSnapshot] = await Promise.all([transaction.get(opRef), transaction.get(projectRef)]);
    if (operationSnapshot.exists) return { operation: operationSnapshot.data(), duplicate: true, queued: false };
    if ((projectSnapshot.data().revision ?? 1) !== input.expectedProjectRevision) throw new BulkLifecycleError("revision_conflict", 409);
    const revisionAfter = input.expectedProjectRevision + 1;
    const taskTargets = await Promise.all(preview.taskIds.map(async (taskId) => { const ref = projectRef.collection("tasks").doc(taskId); return { taskId, ref, snapshot: await transaction.get(ref) }; }));
    const dependencyTargets = await Promise.all(dependencyIds.map(async (dependencyId) => { const ref = projectRef.collection("taskDependencies").doc(dependencyId); return { dependencyId, ref, snapshot: await transaction.get(ref) }; }));
    for (const { taskId, ref, snapshot } of taskTargets) {
      const movePhase = input.resolutionPlan?.moveTaskPhaseIds?.[taskId];
      transaction.update(ref, { lifecycle: lifecycleFor(input.action, snapshot.data().lifecycle, opId, input.actor.id, now, opId), ...(movePhase ? { phaseId: movePhase } : {}) });
    }
    const skipped = new Set(input.resolutionPlan?.skipDependencyIds ?? []);
    for (const { dependencyId, ref, snapshot } of dependencyTargets) {
      if (skipped.has(dependencyId)) continue;
      const state = input.action === "restore" ? "active" : "removed";
      transaction.update(ref, { lifecycle: { ...lifecycleFor(input.action === "restore" ? "restore" : "trash", snapshot.data().lifecycle, opId, input.actor.id, now, opId), state } });
    }
    const operation = { id: opId, idempotencyKey: input.idempotencyKey, organizationId: API_ORGANIZATION_ID, projectId: input.projectId, entityType: "task", entityId: `bulk:${hash(preview.taskIds).slice(0, 16)}`, entityIds: preview.taskIds, entityDisplayLabel: `${preview.taskIds.length} selected tasks`, action: input.action, actor: input.actor, reason: input.reason, requestedAt: timestamp, appliedAt: timestamp, priorState: input.action === "restore" ? "trashed" : "active", resultingState: input.action === "restore" ? "active" : "trashed", impactCounts: { task: preview.taskIds.length, taskDependency: dependencyIds.length }, projectRevisionBefore: input.expectedProjectRevision, projectRevisionAfter: revisionAfter, status: "applied", immutableHistoryRetained: true, bulkGroupId: opId };
    transaction.update(projectRef, { revision: revisionAfter, updatedAt: timestamp, lastStructuralChangeAt: timestamp });
    transaction.create(projectRef.collection("versions").doc(`version_${opId}`), { id: `version_${opId}`, projectId: input.projectId, revision: revisionAfter, previousRevision: input.expectedProjectRevision, changeType: "lifecycle", summary: `${input.action} ${preview.taskIds.length} tasks`, actorId: input.actor.id, metadata: { operationId: opId, taskIds: preview.taskIds }, createdAt: timestamp });
    transaction.create(projectRef.collection("activityEvents").doc(`activity_${opId}`), { id: `activity_${opId}`, projectId: input.projectId, actorId: input.actor.id, type: "record_lifecycle", message: `${input.action} ${preview.taskIds.length} tasks`, metadata: { operationId: opId, taskIds: preview.taskIds }, createdAt: timestamp });
    transaction.create(opRef, operation);
    return { operation, duplicate: false, queued: false };
  });
}

export async function runBulkLifecycleJob(jobIdValue, { database = dbDefault(), now = new Date(), batchSize = batchSizeDefault } = {}) {
  const ref = database.doc(`organizations/${API_ORGANIZATION_ID}/lifecycleJobs/${jobIdValue}`); const snapshot = await ref.get();
  if (!snapshot.exists) throw new BulkLifecycleError("lifecycle_job_not_found", 404);
  let job = snapshot.data(); if (["completed", "canceled"].includes(job.state)) return job;
  const project = database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${job.projectId}`);
  const items = [
    ...job.taskIds.map((id) => ({ kind: "task", id })),
    ...job.dependencyIds.filter((id) => !(job.resolutionPlan?.skipDependencyIds ?? []).includes(id)).map((id) => ({ kind: "taskDependency", id }))
  ];
  const offset = job.progress?.completed ?? 0;
  const chunk = items.slice(offset, offset + Math.max(1, Math.min(batchSize, 200)));
  try {
    await ref.update({ state: "running", stage: "reversible_batches", updatedAt: now.toISOString() });
    const batch = database.batch();
    for (const item of chunk) {
      const target = project.collection(item.kind === "task" ? "tasks" : "taskDependencies").doc(item.id); const current = await target.get();
      if (!current.exists) throw new BulkLifecycleError("job_target_missing", 409);
      const state = item.kind === "taskDependency" && job.action === "trash" ? "removed" : job.action === "restore" ? "active" : "trashed";
      const movePhase = item.kind === "task" ? job.resolutionPlan?.moveTaskPhaseIds?.[item.id] : null;
      batch.update(target, { lifecycle: { ...lifecycleFor(job.action, current.data().lifecycle, job.operationId, job.requestedBy, now, job.operationId), state }, lifecyclePendingJobId: job.id, ...(movePhase ? { phaseId: movePhase } : {}) });
    }
    await batch.commit();
    const completed = offset + chunk.length;
    if (completed < items.length) { await ref.update({ progress: { completed, total: items.length }, updatedAt: now.toISOString() }); return { ...job, state: "running", progress: { completed, total: items.length } }; }
    const timestamp = now.toISOString();
    await database.runTransaction(async (transaction) => {
      const currentProject = await transaction.get(project); if ((currentProject.data().revision ?? 1) !== job.expectedProjectRevision) throw new BulkLifecycleError("revision_conflict", 409);
      const revisionAfter = job.expectedProjectRevision + 1; const opRef = database.doc(`organizations/${API_ORGANIZATION_ID}/recordLifecycleOperations/${job.operationId}`);
      transaction.update(project, { revision: revisionAfter, updatedAt: timestamp, lastStructuralChangeAt: timestamp });
      transaction.set(project.collection("versions").doc(`version_${job.operationId}`), { id: `version_${job.operationId}`, projectId: job.projectId, revision: revisionAfter, previousRevision: job.expectedProjectRevision, changeType: "lifecycle", summary: `${job.action} ${job.taskIds.length} tasks`, actorId: job.requestedBy, metadata: { operationId: job.operationId, lifecycleJobId: job.id }, createdAt: timestamp });
      transaction.set(project.collection("activityEvents").doc(`activity_${job.operationId}`), { id: `activity_${job.operationId}`, projectId: job.projectId, actorId: job.requestedBy, type: "record_lifecycle", message: `${job.action} ${job.taskIds.length} tasks`, metadata: { operationId: job.operationId, lifecycleJobId: job.id }, createdAt: timestamp });
      transaction.set(opRef, { id: job.operationId, idempotencyKey: job.idempotencyKey, organizationId: API_ORGANIZATION_ID, projectId: job.projectId, entityType: "task", entityId: `bulk:${hash(job.taskIds).slice(0, 16)}`, entityIds: job.taskIds, entityDisplayLabel: `${job.taskIds.length} selected tasks`, action: job.action, actor: { id: job.requestedBy, role: "admin" }, reason: { code: "bulk_task_lifecycle" }, requestedAt: job.requestedAt, appliedAt: timestamp, priorState: job.action === "restore" ? "trashed" : "active", resultingState: job.action === "restore" ? "active" : "trashed", impactCounts: { task: job.taskIds.length, taskDependency: job.dependencyIds.length }, projectRevisionBefore: job.expectedProjectRevision, projectRevisionAfter: revisionAfter, status: "applied", immutableHistoryRetained: true, bulkGroupId: job.operationId });
      transaction.update(ref, { state: "completed", stage: "integrity_verified", reversible: false, completedAt: timestamp, progress: { completed: items.length, total: items.length }, integrity: { missingTargets: 0, revision: revisionAfter } });
    });
    job = { ...job, state: "completed", stage: "integrity_verified", progress: { completed: items.length, total: items.length } }; return job;
  } catch (error) {
    const code = error instanceof BulkLifecycleError ? error.code : "lifecycle_job_failed";
    await ref.update({ state: "failed", stage: "recovery_required", updatedAt: now.toISOString(), errors: [...(job.errors ?? []), { code, at: now.toISOString() }] });
    throw error;
  }
}

export async function cancelBulkLifecycleJob(jobIdValue, { database = dbDefault(), now = new Date() } = {}) {
  const ref = database.doc(`organizations/${API_ORGANIZATION_ID}/lifecycleJobs/${jobIdValue}`); const snapshot = await ref.get(); if (!snapshot.exists) throw new BulkLifecycleError("lifecycle_job_not_found", 404);
  const job = snapshot.data(); if ((job.progress?.completed ?? 0) > 0 || job.reversible === false) throw new BulkLifecycleError("job_cancellation_requires_recovery", 409);
  await ref.update({ state: "canceled", stage: "canceled_before_writes", canceledAt: now.toISOString() }); return { ...job, state: "canceled", stage: "canceled_before_writes" };
}
