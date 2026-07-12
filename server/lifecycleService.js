import { createHash } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
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

async function buildImpact(db, projectId, entityType, entityId) {
  const project = db.doc(`organizations/${API_ORGANIZATION_ID}/projects/${projectId}`);
  const transition = [], removeRelationships = [], retainImmutable = [], blockers = [], warnings = [];
  if (entityType === "project") {
    for (const [type, collection] of [["phase", "phases"], ["task", "tasks"], ["milestone", "milestones"], ["risk", "risks"], ["document", "documents"]]) {
      const snapshot = await project.collection(collection).get(); transition.push(item(type, snapshot.docs.map((doc) => doc.id)));
    }
    const versions = await project.collection("versions").get();
    const activities = await project.collection("activityEvents").get();
    retainImmutable.push(item("projectVersion", versions.docs.map((doc) => doc.id)), item("activityEvent", activities.docs.map((doc) => doc.id)));
  } else if (entityType === "phase") {
    const tasks = await project.collection("tasks").where("phaseId", "==", entityId).get();
    transition.push(item("task", tasks.docs.map((doc) => doc.id)));
    if (!tasks.empty) blockers.push("phase_contains_tasks");
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
  }
  return { transition: transition.filter((entry) => entry.count), reassign: [], removeRelationships: removeRelationships.filter((entry) => entry.count), retainImmutable: retainImmutable.filter((entry) => entry.count), blockers, warnings, requiresTypedConfirmation: blockers.length > 0 || warnings.length > 0 };
}

function validateAction(definition, action, role, record, now) {
  if (!definition.actions.includes(action)) throw new LifecycleError("unsupported_action");
  if (!(["admin", "project_manager"].includes(role))) throw new LifecycleError("permission_denied", 403);
  if (action === "purge" && role !== "admin") throw new LifecycleError("permission_denied", 403);
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
  const impact = await buildImpact(db, projectId, entityType, entityId);
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
  if (preview.impact.blockers.length && !input.confirmed) throw new LifecycleError("impact_blocked", 409);
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
    const operation = { id: opId, idempotencyKey: input.idempotencyKey, organizationId: API_ORGANIZATION_ID, projectId: input.projectId, entityType: input.entityType, entityId: input.entityId, entityDisplayLabel: String(record[registry[input.entityType].label] || input.entityId), requestedAction: input.action, resultingLifecycleState: resultingState, actorId: input.actor.id, actorRole: input.actor.role, reason: { code: input.reason.code, ...(input.reason.note ? { note: input.reason.note.slice(0, 500) } : {}) }, requestedAt: timestamp, appliedAt: timestamp, priorState: stateOf(record), resultingState, impactCounts: Object.fromEntries([...preview.impact.transition, ...preview.impact.removeRelationships, ...preview.impact.retainImmutable].map((entry) => [entry.entityType, entry.count])), strategy: input.strategy || "retain_related", projectRevisionBefore: project.revision || 1, projectRevisionAfter: revisionAfter, status: "applied", purgeEligibleAt: input.action === "purge" ? record.lifecycle?.purgeEligibleAt : deadline, immutableHistoryRetained: true };
    if (input.action === "purge") transaction.delete(entityRef);
    else {
      const lifecycle = { schemaVersion: 1, state: resultingState, retentionClass: record.lifecycle?.retentionClass || "operational_30d", legalHold: record.lifecycle?.legalHold === true, lastOperationId: opId };
      if (input.action === "archive") lifecycle.archived = { at: timestamp, by: input.actor.id, reason: operation.reason };
      if (["trash", "remove"].includes(input.action)) { lifecycle[input.action === "trash" ? "trashed" : "removed"] = { at: timestamp, by: input.actor.id, reason: operation.reason, restoreDeadline: deadline }; lifecycle.purgeEligibleAt = deadline; }
      if (input.action === "restore") lifecycle.restored = { at: timestamp, by: input.actor.id };
      transaction.update(entityRef, { lifecycle });
    }
    transaction.update(projectRef, { revision: revisionAfter, updatedAt: timestamp, lastStructuralChangeAt: timestamp });
    transaction.set(projectRef.collection("versions").doc(`version_${opId}`), { id: `version_${opId}`, projectId: input.projectId, revision: revisionAfter, previousRevision: project.revision || 1, changeType: "lifecycle", summary: `${input.action} ${input.entityType} ${input.entityId}`, actorId: input.actor.id, metadata: { operationId: opId }, createdAt: timestamp });
    transaction.set(projectRef.collection("activityEvents").doc(`activity_${opId}`), { id: `activity_${opId}`, projectId: input.projectId, actorId: input.actor.id, type: "record_lifecycle", message: `${input.action} ${input.entityType}`, metadata: { operationId: opId, entityId: input.entityId }, createdAt: timestamp });
    transaction.create(operationRef, operation);
    return { operation, duplicate: false };
  });
}
