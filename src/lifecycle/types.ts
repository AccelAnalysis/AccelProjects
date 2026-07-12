import type { UserRole } from "../types";

export const lifecycleSchemaVersion = 1 as const;

export type LifecycleState = "active" | "archived" | "trashed" | "removed";
export type LifecycleAction = "archive" | "trash" | "restore" | "remove" | "cancel" | "void" | "supersede" | "resolve" | "purge";
export type LifecycleEntityType =
  | "organizationUser" | "client" | "project" | "projectMember" | "phase" | "task" | "taskComment"
  | "taskDependency" | "milestone" | "risk" | "document" | "documentVersion" | "metric"
  | "communication" | "deliveryAttempt" | "calendarEvent" | "report" | "reportSnapshot" | "reportArtifact"
  | "activityEvent" | "projectVersion" | "exportSnapshot" | "updateManifest" | "importManifest";
export type RetentionClass = "operational_temporary" | "ordinary_project" | "project_trash" | "relationship_30d" | "communication_history" | "calendar_history" | "approved_report" | "report_artifact" | "contract_billing" | "audit_permanent" | "legal_hold" | "operational_30d" | "business_7y";
export type LifecycleOperationStatus = "planned" | "applied" | "failed" | "partially_applied" | "reversed";

export type LifecycleActor = { id: string; role: UserRole };
export type LifecycleReason = { code: string; note?: string };

export type RecordLifecycleMetadata = {
  schemaVersion: typeof lifecycleSchemaVersion;
  state: LifecycleState;
  retentionClass: RetentionClass;
  archived?: { at: string; by: string; reason: LifecycleReason };
  trashed?: { at: string; by: string; reason: LifecycleReason; restoreDeadline: string };
  restored?: { at: string; by: string };
  removed?: { at: string; by: string; reason: LifecycleReason; restoreDeadline: string };
  purgeEligibleAt?: string;
  legalHold?: boolean;
  lastOperationId: string;
};

export type LifecycleImpactItem = { entityType: LifecycleEntityType; count: number; ids: string[] };
export type LifecycleImpact = {
  transition: LifecycleImpactItem[];
  reassign: LifecycleImpactItem[];
  removeRelationships: LifecycleImpactItem[];
  retainImmutable: LifecycleImpactItem[];
  blockers: string[];
  warnings: string[];
  requiresTypedConfirmation: boolean;
};

export type LifecycleOperation = {
  id: string;
  idempotencyKey: string;
  organizationId: string;
  projectId?: string;
  entityType: LifecycleEntityType;
  entityId: string;
  entityDisplayLabel: string;
  action: LifecycleAction;
  actor: LifecycleActor;
  reason: LifecycleReason;
  requestedAt: string;
  appliedAt?: string;
  priorState: LifecycleState;
  resultingState?: LifecycleState | "purged";
  impactCounts: Record<string, number>;
  strategy?: string;
  projectRevisionBefore?: number;
  projectRevisionAfter?: number;
  status: LifecycleOperationStatus;
  safeErrorCode?: string;
  relatedOperationId?: string;
  purgeEligibleAt?: string;
  immutableHistoryRetained: boolean;
};

export type LifecyclePolicy = {
  entityType: LifecycleEntityType;
  actions: readonly LifecycleAction[];
  roles: readonly UserRole[];
  retentionClass: RetentionClass;
  immutable: boolean;
  restorable: boolean;
  purgeAllowed: boolean;
  incrementsProjectRevision: boolean;
  createsActivityEvent: boolean;
  serverOnly: boolean;
};

export type LifecyclePolicyDecision = { allowed: boolean; code: string; policy: LifecyclePolicy; resultingState?: LifecycleState | "purged" };
