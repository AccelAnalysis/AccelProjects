import type { UserRole } from "../types";
import type { LifecycleAction, LifecycleEntityType, LifecyclePolicy, LifecyclePolicyDecision, LifecycleState, RecordLifecycleMetadata, RetentionClass } from "./types";

const managerRoles: UserRole[] = ["admin", "project_manager"];
const immutable = ["deliveryAttempt", "reportSnapshot", "reportArtifact", "activityEvent", "projectVersion", "exportSnapshot", "updateManifest", "importManifest"] as const;
const relationship = ["projectMember", "taskDependency"] as const;

function policy(entityType: LifecycleEntityType, actions: LifecycleAction[], options: Partial<LifecyclePolicy> = {}): LifecyclePolicy {
  return { entityType, actions, roles: managerRoles, retentionClass: "operational_30d", immutable: false, restorable: actions.includes("restore"), purgeAllowed: actions.includes("purge"), incrementsProjectRevision: true, createsActivityEvent: true, serverOnly: true, ...options };
}

export const lifecyclePolicies: Readonly<Record<LifecycleEntityType, LifecyclePolicy>> = {
  organizationUser: policy("organizationUser", ["archive", "restore"], { roles: ["admin"], incrementsProjectRevision: false }),
  client: policy("client", ["archive", "trash", "restore", "purge"], { roles: ["admin"], retentionClass: "business_7y", incrementsProjectRevision: false }),
  project: policy("project", ["archive", "trash", "restore", "purge"], { retentionClass: "business_7y" }),
  projectMember: policy("projectMember", ["remove", "restore", "purge"], { retentionClass: "relationship_30d" }),
  phase: policy("phase", ["trash", "restore", "purge"]), task: policy("task", ["trash", "restore", "purge"]),
  taskComment: policy("taskComment", [], { retentionClass: "business_7y", purgeAllowed: false }),
  taskDependency: policy("taskDependency", ["remove", "restore", "purge"], { retentionClass: "relationship_30d" }),
  milestone: policy("milestone", ["trash", "restore", "purge"]),
  risk: policy("risk", ["resolve", "archive", "trash", "restore", "purge"]),
  document: policy("document", ["archive", "trash", "restore", "purge"], { retentionClass: "business_7y" }),
  documentVersion: policy("documentVersion", [], { immutable: true, retentionClass: "business_7y", incrementsProjectRevision: false, createsActivityEvent: false }),
  metric: policy("metric", ["archive", "trash", "restore", "purge"]),
  communication: policy("communication", ["trash", "cancel"], { retentionClass: "business_7y", restorable: false }),
  calendarEvent: policy("calendarEvent", ["trash", "cancel"], { retentionClass: "business_7y", restorable: false }),
  report: policy("report", ["trash", "void", "supersede"], { retentionClass: "business_7y", restorable: false }),
  ...Object.fromEntries(immutable.map((entityType) => [entityType, policy(entityType, [], { immutable: true, retentionClass: "audit_permanent", incrementsProjectRevision: false, createsActivityEvent: false })])),
} as Record<LifecycleEntityType, LifecyclePolicy>;

export function normalizeLifecycle(value: unknown, retentionClass: RetentionClass = "operational_30d"): Pick<RecordLifecycleMetadata, "schemaVersion" | "state" | "retentionClass" | "legalHold"> {
  if (!value || typeof value !== "object") return { schemaVersion: 1, state: "active", retentionClass, legalHold: false };
  const lifecycle = value as Partial<RecordLifecycleMetadata>;
  return { schemaVersion: 1, state: (["active", "archived", "trashed", "removed"] as const).includes(lifecycle.state as LifecycleState) ? lifecycle.state as LifecycleState : "active", retentionClass: lifecycle.retentionClass ?? retentionClass, legalHold: lifecycle.legalHold === true };
}

const resultState: Partial<Record<LifecycleAction, LifecycleState | "purged">> = { archive: "archived", trash: "trashed", remove: "removed", restore: "active", purge: "purged" };

export function decideLifecycle(entityType: LifecycleEntityType, action: LifecycleAction, role: UserRole, lifecycle?: RecordLifecycleMetadata, now = new Date()): LifecyclePolicyDecision {
  const selected = lifecyclePolicies[entityType];
  if (selected.immutable) return { allowed: false, code: "immutable_record", policy: selected };
  if (!selected.actions.includes(action)) return { allowed: false, code: "unsupported_action", policy: selected };
  if (!selected.roles.includes(role)) return { allowed: false, code: "permission_denied", policy: selected };
  const current = normalizeLifecycle(lifecycle, selected.retentionClass);
  if (current.legalHold && (action === "trash" || action === "purge")) return { allowed: false, code: "legal_hold", policy: selected };
  if (action === "restore" && !["archived", "trashed", "removed"].includes(current.state)) return { allowed: false, code: "not_restorable", policy: selected };
  if (action === "purge" && (!lifecycle?.purgeEligibleAt || Date.parse(lifecycle.purgeEligibleAt) > now.getTime())) return { allowed: false, code: "retention_not_satisfied", policy: selected };
  return { allowed: true, code: "allowed", policy: selected, resultingState: resultState[action] };
}

export const isLifecycleActive = (record: { lifecycle?: RecordLifecycleMetadata }) => normalizeLifecycle(record.lifecycle).state === "active";
export const isArchived = (record: { lifecycle?: RecordLifecycleMetadata }) => normalizeLifecycle(record.lifecycle).state === "archived";
export const isTrashed = (record: { lifecycle?: RecordLifecycleMetadata }) => normalizeLifecycle(record.lifecycle).state === "trashed";
export const isRestorable = (record: { lifecycle?: RecordLifecycleMetadata }) => ["archived", "trashed", "removed"].includes(normalizeLifecycle(record.lifecycle).state);
export const isPurgeEligible = (record: { lifecycle?: RecordLifecycleMetadata }, now = Date.now()) => !record.lifecycle?.legalHold && Boolean(record.lifecycle?.purgeEligibleAt) && Date.parse(record.lifecycle!.purgeEligibleAt!) <= now;
export const visibleToClient = (record: { lifecycle?: RecordLifecycleMetadata }) => isLifecycleActive(record);
