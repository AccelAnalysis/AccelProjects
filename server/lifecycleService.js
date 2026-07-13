import { createHash } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { API_ORGANIZATION_ID, getAdminApp } from "./apiAuth.js";

const retentionDays = 30;
const immutableTypes = new Set(["deliveryAttempt", "reportSnapshot", "reportArtifact", "activityEvent", "projectVersion", "exportSnapshot", "updateManifest", "importManifest"]);
const registry = {
  project: { collection: null, actions: ["archive", "trash", "restore", "purge"], label: "name" },
  projectMember: { collection: "members", actions: ["remove", "restore", "purge"], label: "userId" },
  phase: { collection: "phases", actions: ["trash", "restore", "purge"], label: "name" },
  task: { collection: "tasks", actions: ["trash", "restore", "purge"], label: "title" },
  taskDependency: { collection: "taskDependencies", actions: ["remove", "restore", "purge"], label: "id" },
  milestone: { collection: "milestones", actions: ["trash", "restore", "purge"], label: "name" },
  risk: { collection: "risks", actions: ["resolve", "archive", "trash", "restore", "purge"], label: "title" },
  document: { collection: "documents", actions: ["archive", "trash", "restore", "purge"], label: "title" },
  metric: { collection: "metrics", actions: ["archive", "trash", "restore", "purge"], label: "label" }
  ,report: { collection: "reports", actions: ["trash", "restore", "purge"], label: "title" }
  ,communication: { collection: "communications", actions: ["trash", "restore", "purge"], label: "subject" }
  ,calendarEvent: { collection: "calendarEvents", actions: ["trash", "restore", "archive", "purge"], label: "title" }
};

export class LifecycleError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

const database = () => getFirestore(getAdminApp());
const stateOf = (record) => record?.lifecycle?.state || "active";
const operationId = (organizationId, idempotencyKey) => `lifecycle_${createHash("sha256").update(`${organizationId}:${idempotencyKey}`).digest("hex").slice(0, 32)}`;
const previewToken = (input) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const item = (entityType, ids) => ({ entityType, count: ids.length, ids: [...ids].sort() });

function targetRef(db, projectId, entityType, entityId) {
  const definition = registry[entityType];
  if (!definition || immutableTypes.has(entityType)) throw new LifecycleError("unsupported_entity", 400);
  if (entityType === "project" && entityId !== projectId) throw new LifecycleError("entity_identity_mismatch", 400);
  const project = db.doc(`organizations/${API_ORGANIZATION_ID}/projects/${projectId}`);
  return definition.collection ? project.collection(definition.collection).doc(entityId) : project;
}

async function buildImpact(db, projectId, entityType, entityId, { action, strategy, destinationPhaseId, replacementUserId } = {}) {
  const project = db.doc(`organizations/${API_ORGANIZATION_ID}/projects/${projectId}`);
  const transition = [], removeRelationships = [], retainImmutable = [], blockers = [], warnings = [];
  if (entityType === "project") {
    for (const [type, collection] of [["phase", "phases"], ["task", "tasks"], ["milestone", "milestones"], ["risk", "risks"], ["document", "documents"]]) {
      const snapshot = await project.collection(collection).get(); transition.push(item(type, snapshot.docs.map((doc) => doc.id)));
    }
    const versions = await project.collection("versions").get();
    const activities = await project.collection("activityEvents").get();
    retainImmutable.push(item("projectVersion", versions.docs.map((doc) => doc.id)), item("activityEvent", activities.docs.map((doc) => doc.id)));
    if (action === "restore") {
      const current = await project.get(); const data = current.data(); const [client, owner] = await Promise.all([db.doc(`organizations/${API_ORGANIZATION_ID}/clients/${data.clientId}`).get(), db.doc(`organizations/${API_ORGANIZATION_ID}/users/${data.ownerId}`).get()]);
      if (!client.exists || (client.data()?.lifecycle?.state || "active") !== "active") blockers.push("active_client_required");
      if (!owner.exists || (owner.data()?.lifecycle?.state || "active") !== "active") blockers.push("active_project_owner_required");
    }
  } else if (entityType === "phase") {
    const tasks = await project.collection("tasks").where("phaseId", "==", entityId).get();
    transition.push(item("task", tasks.docs.map((doc) => doc.id)));
    if (!tasks.empty && !["cascade_trash", "reassign"].includes(strategy)) blockers.push("phase_strategy_required");
    if (!tasks.empty && strategy === "reassign" && !destinationPhaseId) blockers.push("destination_phase_required");
    if (!tasks.empty && strategy === "reassign" && destinationPhaseId) {
      const destination = await project.collection("phases").doc(destinationPhaseId).get();
      if (!destination.exists || (destination.data()?.lifecycle?.state || "active") !== "active" || destinationPhaseId === entityId) blockers.push("invalid_destination_phase");
      else reassign.push(item("task", tasks.docs.map((doc) => doc.id)));
    }
  } else if (entityType === "task") {
    const [comments, inbound, outbound, events] = await Promise.all([
      project.collection("tasks").doc(entityId).collection("comments").get(),
      project.collection("taskDependencies").where("taskId", "==", entityId).get(),
      project.collection("taskDependencies").where("dependsOnTaskId", "==", entityId).get(),
      project.collection("calendarEvents").where("relatedEntityId", "==", entityId).get()
    ]);
    retainImmutable.push(item("taskComment", comments.docs.map((doc) => doc.id)));
    removeRelationships.push(item("taskDependency", [...inbound.docs, ...outbound.docs].map((doc) => doc.id)), item("calendarEvent", events.docs.map((doc) => doc.id)));
    if (!comments.empty) warnings.push("task_comments_will_be_retained");
    if (action === "restore") {
      const task = await project.collection("tasks").doc(entityId).get();
      const phase = task.exists ? await project.collection("phases").doc(task.data().phaseId).get() : null;
      if (!phase?.exists || (phase.data()?.lifecycle?.state || "active") !== "active") blockers.push("replacement_phase_required");
    }
  } else if (entityType === "taskDependency" && action === "restore") {
    const [target, dependencies] = await Promise.all([project.collection("taskDependencies").doc(entityId).get(), project.collection("taskDependencies").get()]);
    const record = target.data();
    const duplicate = dependencies.docs.some((doc) => doc.id !== entityId && (doc.data().lifecycle?.state || "active") === "active" && doc.data().taskId === record?.taskId && doc.data().dependsOnTaskId === record?.dependsOnTaskId);
    if (duplicate) blockers.push("duplicate_dependency");
    const active = dependencies.docs.filter((doc) => doc.id !== entityId && (doc.data().lifecycle?.state || "active") === "active").map((doc) => doc.data());
    const edges = [...active, record].filter(Boolean);
    const graph = new Map(); edges.forEach((edge) => graph.set(edge.taskId, [...(graph.get(edge.taskId) || []), edge.dependsOnTaskId]));
    const visiting = new Set(); const visited = new Set();
    const cyclic = (node) => { if (visiting.has(node)) return true; if (visited.has(node)) return false; visiting.add(node); if ((graph.get(node) || []).some(cyclic)) return true; visiting.delete(node); visited.add(node); return false; };
    if ([...graph.keys()].some(cyclic)) blockers.push("dependency_cycle");
    warnings.push("schedule_graph_will_be_revalidated");
  } else if (entityType === "projectMember") {
    const [membership, tasks, documents, members] = await Promise.all([project.collection("members").doc(entityId).get(), project.collection("tasks").where("assigneeId", "==", entityId).get(), project.collection("documents").where("ownerId", "==", entityId).get(), project.collection("members").get()]);
    if (!membership.exists) blockers.push("legacy_membership_id_requires_repair");
    const projectSnapshot = await project.get();
    if (projectSnapshot.data()?.ownerId === entityId) blockers.push("project_owner_transfer_required");
    const leads = members.docs.filter((doc) => doc.data().role === "lead" && (doc.data().lifecycle?.state || "active") === "active");
    if (membership.data()?.role === "lead" && leads.length <= 1) blockers.push("last_project_lead_replacement_required");
    reassign.push(item("task", tasks.docs.map((doc) => doc.id)), item("document", documents.docs.map((doc) => doc.id)));
    if ((!tasks.empty || !documents.empty) && (strategy !== "reassign" || !replacementUserId)) blockers.push("membership_reassignment_required");
    if (replacementUserId) {
      const replacement = await project.collection("members").doc(replacementUserId).get();
      if (!replacement.exists || (replacement.data()?.lifecycle?.state || "active") !== "active" || replacementUserId === entityId) blockers.push("invalid_replacement_member");
    }
    if (action === "restore") { const user = await db.doc(`organizations/${API_ORGANIZATION_ID}/users/${entityId}`).get(); if (!user.exists || (user.data()?.lifecycle?.state || "active") !== "active") blockers.push("active_organization_user_required"); }
  } else if (entityType === "milestone") {
    const events = await project.collection("calendarEvents").where("relatedEntityId", "==", entityId).get();
    retainImmutable.push(item("calendarEvent", events.docs.map((doc) => doc.id)));
    if (!events.empty) warnings.push("linked_calendar_events_will_be_retained");
  } else if (entityType === "risk") {
    warnings.push("approved_report_snapshots_remain_unchanged");
  } else if (entityType === "document" && action === "restore") {
    const document = await project.collection("documents").doc(entityId).get(); const data = document.data();
    if (data?.managed) { const version = await document.ref.collection("versions").doc(data.currentVersionId).get(); if (!version.exists) blockers.push("document_version_missing"); else { try { const [exists] = await getStorage(getAdminApp()).bucket(process.env.FIREBASE_STORAGE_BUCKET).file(version.data().storagePath).exists(); if (!exists) blockers.push("storage_object_missing"); } catch { blockers.push("storage_verification_failed"); } } }
  }
  return { transition: transition.filter((entry) => entry.count), reassign: reassign.filter((entry) => entry.count), removeRelationships: removeRelationships.filter((entry) => entry.count), retainImmutable: retainImmutable.filter((entry) => entry.count), blockers, warnings, requiresTypedConfirmation: blockers.length > 0 || warnings.length > 0 };
}

function validateAction(definition, action, role, record, now) {
  if (!definition.actions.includes(action)) throw new LifecycleError("unsupported_action");
  if (!(["admin", "project_manager"].includes(role))) throw new LifecycleError("permission_denied", 403);
  if (action === "purge" && role !== "admin") throw new LifecycleError("permission_denied", 403);
  if (action === "purge") throw new LifecycleError("durable_purge_job_required", 409);
  if (record.source === "computed" && ["trash", "purge"].includes(action)) throw new LifecycleError("computed_metric_not_deletable", 409);
  if ((record.locked || ["contract", "billing", "approved_deliverable", "report_artifact"].includes(record.category) || record.type === "contract") && ["trash", "purge"].includes(action)) throw new LifecycleError("protected_document_retention", 409);
  if (record.latestApprovedSnapshotId && ["trash", "purge"].includes(action)) throw new LifecycleError("approved_report_immutable", 409);
  if (record.channel === "email" && !["draft", "failed"].includes(record.status) && ["trash", "purge"].includes(action)) throw new LifecycleError("communication_history_retained", 409);
  if (record.calendarOwnerEmail && record.graphEventId && ["trash", "purge"].includes(action)) throw new LifecycleError("scheduled_calendar_event_retained", 409);
  if (record.lifecycle?.legalHold && ["trash", "purge"].includes(action)) throw new LifecycleError("legal_hold", 409);
  if (action === "restore" && !["archived", "trashed", "removed"].includes(stateOf(record))) throw new LifecycleError("not_restorable", 409);
  if (action === "purge" && (!record.lifecycle?.purgeEligibleAt || Date.parse(record.lifecycle.purgeEligibleAt) > now.getTime())) throw new LifecycleError("retention_not_satisfied", 409);
}

export async function previewLifecycle(input, { db = database() } = {}) {
  const { projectId, entityType, entityId, action, expectedProjectRevision, actor } = input;
  const definition = registry[entityType];
  const [projectSnapshot, targetSnapshot] = await Promise.all([db.doc(`organizations/${API_ORGANIZATION_ID}/projects/${projectId}`).get(), targetRef(db, projectId, entityType, entityId).get()]);
  if (!projectSnapshot.exists || !targetSnapshot.exists) throw new LifecycleError("record_not_found", 404);
  const project = projectSnapshot.data(); const record = targetSnapshot.data();
  if ((project.revision || 1) !== expectedProjectRevision) throw new LifecycleError("revision_conflict", 409);
  validateAction(definition, action, actor.role, record, new Date());
  const impact = await buildImpact(db, projectId, entityType, entityId, input);
  const token = previewToken({ projectId, entityType, entityId, action, expectedProjectRevision, state: stateOf(record), impact });
  return { projectRevision: project.revision || 1, entityState: stateOf(record), impact, previewToken: token };
}

export async function applyLifecycle(input, { db = database(), now = new Date() } = {}) {
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw new LifecycleError("invalid_idempotency_key");
  const opId = operationId(API_ORGANIZATION_ID, input.idempotencyKey);
  const operationRef = db.doc(`organizations/${API_ORGANIZATION_ID}/recordLifecycleOperations/${opId}`);
  const priorOperation = await operationRef.get();
  if (priorOperation.exists) {
    const prior = priorOperation.data();
    if (prior.projectId !== input.projectId || prior.entityType !== input.entityType || prior.entityId !== input.entityId || prior.requestedAction !== input.action || prior.actorId !== input.actor.id) throw new LifecycleError("idempotency_key_reused", 409);
    return { operation: prior, duplicate: true };
  }
  const preview = await previewLifecycle(input, { db });
  if (preview.previewToken !== input.previewToken) throw new LifecycleError("stale_preview", 409);
  if (preview.impact.blockers.length) throw new LifecycleError("impact_blocked", 409);
  const projectRef = db.doc(`organizations/${API_ORGANIZATION_ID}/projects/${input.projectId}`);
  const entityRef = targetRef(db, input.projectId, input.entityType, input.entityId);
  return db.runTransaction(async (transaction) => {
    const [existing, projectSnapshot, entitySnapshot] = await Promise.all([transaction.get(operationRef), transaction.get(projectRef), transaction.get(entityRef)]);
    if (existing.exists) return { operation: existing.data(), duplicate: true };
    if (!projectSnapshot.exists || !entitySnapshot.exists) throw new LifecycleError("record_not_found", 404);
    const project = projectSnapshot.data(); const record = entitySnapshot.data();
    if ((project.revision || 1) !== input.expectedProjectRevision) throw new LifecycleError("revision_conflict", 409);
    validateAction(registry[input.entityType], input.action, input.actor.role, record, now);
    const resultingState = { archive: "archived", trash: "trashed", remove: "removed", restore: "active", purge: "purged" }[input.action] || stateOf(record);
    const revisionAfter = (project.revision || 1) + 1;
    const timestamp = now.toISOString(); const deadline = new Date(now.getTime() + retentionDays * 86400000).toISOString();
    const operation = { id: opId, idempotencyKey: input.idempotencyKey, organizationId: API_ORGANIZATION_ID, projectId: input.projectId, entityType: input.entityType, entityId: input.entityId, entityDisplayLabel: String(record[registry[input.entityType].label] || input.entityId), action: input.action, requestedAction: input.action, resultingLifecycleState: resultingState, actor: input.actor, actorId: input.actor.id, actorRole: input.actor.role, reason: { code: input.reason.code, ...(input.reason.note ? { note: input.reason.note.slice(0, 500) } : {}) }, requestedAt: timestamp, appliedAt: timestamp, priorState: stateOf(record), resultingState, impactCounts: Object.fromEntries([...preview.impact.transition, ...preview.impact.removeRelationships, ...preview.impact.retainImmutable].map((entry) => [entry.entityType, entry.count])), strategy: input.strategy || "retain_related", projectRevisionBefore: project.revision || 1, projectRevisionAfter: revisionAfter, status: "applied", purgeEligibleAt: input.action === "purge" ? record.lifecycle?.purgeEligibleAt : deadline, immutableHistoryRetained: true };
    const lifecycle = { schemaVersion: 1, state: resultingState, retentionClass: record.lifecycle?.retentionClass || "operational_30d", legalHold: record.lifecycle?.legalHold === true, lastOperationId: opId };
    if (input.action === "archive") lifecycle.archived = { at: timestamp, by: input.actor.id, reason: operation.reason };
    if (["trash", "remove"].includes(input.action)) { lifecycle[input.action === "trash" ? "trashed" : "removed"] = { at: timestamp, by: input.actor.id, reason: operation.reason, restoreDeadline: deadline }; lifecycle.purgeEligibleAt = deadline; }
    if (input.action === "restore") lifecycle.restored = { at: timestamp, by: input.actor.id };
    transaction.update(entityRef, {
      lifecycle,
      ...(input.entityType === "projectMember" ? { accessState: input.action === "remove" ? "removed" : "active" } : {})
    });
    if (input.entityType === "task" && input.action === "trash") {
      const dependencies = preview.impact.removeRelationships.find((entry) => entry.entityType === "taskDependency")?.ids || [];
      dependencies.forEach((dependencyId) => transaction.update(projectRef.collection("taskDependencies").doc(dependencyId), { lifecycle: { schemaVersion: 1, state: "removed", retentionClass: "relationship_30d", legalHold: false, lastOperationId: opId, removed: { at: timestamp, by: input.actor.id, reason: operation.reason, restoreDeadline: deadline }, purgeEligibleAt: deadline } }));
    }
    if (input.entityType === "phase" && input.action === "trash" && input.strategy === "cascade_trash") {
      const tasks = preview.impact.transition.find((entry) => entry.entityType === "task")?.ids || [];
      tasks.forEach((taskId) => transaction.update(projectRef.collection("tasks").doc(taskId), { lifecycle: { schemaVersion: 1, state: "trashed", retentionClass: "operational_30d", legalHold: false, lastOperationId: opId, trashed: { at: timestamp, by: input.actor.id, reason: operation.reason, restoreDeadline: deadline }, purgeEligibleAt: deadline } }));
    }
    if (input.entityType === "phase" && input.action === "trash" && input.strategy === "reassign") {
      const tasks = preview.impact.reassign.find((entry) => entry.entityType === "task")?.ids || [];
      tasks.forEach((taskId) => transaction.update(projectRef.collection("tasks").doc(taskId), { phaseId: input.destinationPhaseId }));
    }
    if (input.entityType === "projectMember" && input.action === "remove" && input.strategy === "reassign") {
      const tasks = preview.impact.reassign.find((entry) => entry.entityType === "task")?.ids || [];
      const documents = preview.impact.reassign.find((entry) => entry.entityType === "document")?.ids || [];
      tasks.forEach((taskId) => transaction.update(projectRef.collection("tasks").doc(taskId), { assigneeId: input.replacementUserId }));
      documents.forEach((documentId) => transaction.update(projectRef.collection("documents").doc(documentId), { ownerId: input.replacementUserId }));
    }
    transaction.update(projectRef, { revision: revisionAfter, updatedAt: timestamp, lastStructuralChangeAt: timestamp });
    transaction.set(projectRef.collection("versions").doc(`version_${opId}`), { id: `version_${opId}`, projectId: input.projectId, revision: revisionAfter, previousRevision: project.revision || 1, changeType: "lifecycle", summary: `${input.action} ${input.entityType} ${input.entityId}`, actorId: input.actor.id, metadata: { operationId: opId }, createdAt: timestamp });
    transaction.set(projectRef.collection("activityEvents").doc(`activity_${opId}`), { id: `activity_${opId}`, projectId: input.projectId, actorId: input.actor.id, type: "record_lifecycle", message: `${input.action} ${input.entityType}`, metadata: { operationId: opId, entityId: input.entityId }, createdAt: timestamp });
    transaction.create(operationRef, operation);
    return { operation, duplicate: false };
  });
}

export async function previewOrganizationLifecycle(input, { db = database() } = {}) {
  if (input.entityType !== "client") throw new LifecycleError("unsupported_entity");
  const target = db.doc(`organizations/${API_ORGANIZATION_ID}/clients/${input.entityId}`);
  const snapshot = await target.get();
  if (!snapshot.exists) throw new LifecycleError("record_not_found", 404);
  const record = snapshot.data();
  validateAction({ actions: ["archive", "trash", "restore", "purge"] }, input.action, input.actor.role, record, new Date());
  const projects = await db.collection(`organizations/${API_ORGANIZATION_ID}/projects`).where("clientId", "==", input.entityId).get();
  const projectIds = projects.docs.map((doc) => doc.id);
  const blockers = input.action === "purge" && projectIds.length ? ["client_projects_require_explicit_handling"] : [];
  const warnings = input.action === "archive" && projectIds.length ? ["client_projects_will_not_be_archived"] : [];
  const impact = { transition: [], reassign: [], removeRelationships: [], retainImmutable: projectIds.length ? [item("project", projectIds)] : [], blockers, warnings, requiresTypedConfirmation: blockers.length > 0 || warnings.length > 0 };
  return { projectRevision: 0, entityState: stateOf(record), impact, previewToken: previewToken({ entityType: "client", entityId: input.entityId, action: input.action, state: stateOf(record), impact }) };
}

export async function applyOrganizationLifecycle(input, { db = database(), now = new Date() } = {}) {
  const opId = operationId(API_ORGANIZATION_ID, input.idempotencyKey);
  const operationRef = db.doc(`organizations/${API_ORGANIZATION_ID}/recordLifecycleOperations/${opId}`);
  const prior = await operationRef.get();
  if (prior.exists) return { operation: prior.data(), duplicate: true };
  const preview = await previewOrganizationLifecycle(input, { db });
  if (preview.previewToken !== input.previewToken) throw new LifecycleError("stale_preview", 409);
  if (preview.impact.blockers.length) throw new LifecycleError("impact_blocked", 409);
  const target = db.doc(`organizations/${API_ORGANIZATION_ID}/clients/${input.entityId}`);
  return db.runTransaction(async (transaction) => {
    const [existing, snapshot] = await Promise.all([transaction.get(operationRef), transaction.get(target)]);
    if (existing.exists) return { operation: existing.data(), duplicate: true };
    if (!snapshot.exists) throw new LifecycleError("record_not_found", 404);
    const record = snapshot.data(); const timestamp = now.toISOString(); const deadline = new Date(now.getTime() + retentionDays * 86400000).toISOString();
    validateAction({ actions: ["archive", "trash", "restore", "purge"] }, input.action, input.actor.role, record, now);
    const state = { archive: "archived", trash: "trashed", restore: "active", purge: "purged" }[input.action];
    const reason = { code: input.reason.code, ...(input.reason.note ? { note: input.reason.note.slice(0, 500) } : {}) };
    const operation = { id: opId, idempotencyKey: input.idempotencyKey, organizationId: API_ORGANIZATION_ID, entityType: "client", entityId: input.entityId, entityDisplayLabel: record.name || input.entityId, action: input.action, requestedAction: input.action, actor: input.actor, actorId: input.actor.id, actorRole: input.actor.role, reason, requestedAt: timestamp, appliedAt: timestamp, priorState: stateOf(record), resultingState: state, impactCounts: { project: preview.impact.retainImmutable[0]?.count || 0 }, status: "applied", purgeEligibleAt: input.action === "purge" ? record.lifecycle?.purgeEligibleAt : deadline, immutableHistoryRetained: true };
    transaction.update(target, { lifecycle: { schemaVersion: 1, state, retentionClass: "business_7y", legalHold: record.lifecycle?.legalHold === true, lastOperationId: opId, ...(input.action === "archive" ? { archived: { at: timestamp, by: input.actor.id, reason } } : {}), ...(input.action === "trash" ? { trashed: { at: timestamp, by: input.actor.id, reason, restoreDeadline: deadline }, purgeEligibleAt: deadline } : {}), ...(input.action === "restore" ? { restored: { at: timestamp, by: input.actor.id } } : {}) } });
    transaction.create(operationRef, operation);
    return { operation, duplicate: false };
  });
}
