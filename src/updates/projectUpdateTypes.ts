import type {
  Milestone,
  Phase,
  Project,
  ProjectDocument,
  ProjectExportSnapshot,
  ProjectMetric,
  ProjectRisk,
  ProjectState,
  Task,
  TaskDependency,
  User
} from "../types";
import type { ProjectExportPackage } from "../exports/projectExport";

export type ProjectUpdateEntityType = "project" | "phases" | "milestones" | "tasks" | "taskDependencies" | "risks" | "documents" | "metrics";
export type ProjectUpdateChangeKind = "added" | "modified" | "removed" | "unchanged";

export type ProjectUpdateIssueCode =
  | "malformed_json"
  | "unsupported_export_schema"
  | "wrong_package_type"
  | "create_package_not_valid_for_update"
  | "unknown_export_snapshot"
  | "duplicate_export_snapshot"
  | "source_snapshot_hash_mismatch"
  | "project_identity_mismatch"
  | "client_identity_mismatch"
  | "immutable_field_changed"
  | "member_updates_not_supported"
  | "unknown_assignee"
  | "unknown_document_owner"
  | "invalid_temporary_id"
  | "duplicate_entity_id"
  | "missing_phase_reference"
  | "missing_dependency_target"
  | "self_dependency"
  | "duplicate_dependency"
  | "circular_dependency"
  | "task_with_comments_cannot_be_removed"
  | "phase_still_in_use"
  | "stale_base_revision"
  | "stale_preview"
  | "duplicate_update_file"
  | "no_project_changes"
  | "project_snapshot_too_large"
  | "revision_too_large_for_atomic_apply"
  | "permission_denied"
  | "transaction_conflict"
  | "network_failure"
  | "invalid_project"
  | "invalid_phase"
  | "invalid_milestone"
  | "invalid_task"
  | "invalid_dependency"
  | "invalid_risk"
  | "invalid_document"
  | "invalid_metric";

export type ProjectUpdateIssue = {
  severity: "error" | "warning";
  code: ProjectUpdateIssueCode;
  message: string;
  entityType?: ProjectUpdateEntityType;
  entityId?: string;
  entityName?: string;
  path?: string;
  correctiveAction?: string;
};

export type ProjectUpdateFieldChange = {
  field: string;
  before: unknown;
  after: unknown;
};

export type ProjectUpdateChange = {
  entityType: ProjectUpdateEntityType;
  entityId: string;
  entityName: string;
  kind: Exclude<ProjectUpdateChangeKind, "unchanged">;
  fields: ProjectUpdateFieldChange[];
};

export type ProjectUpdateChangeCounts = {
  added: number;
  modified: number;
  removed: number;
  byEntityType: Record<string, { added: number; modified: number; removed: number }>;
};

export type ProjectUpdatePlan = {
  projectId: string;
  baseRevision: number;
  resultRevision: number;
  sourceSnapshotId: string;
  sourcePackageId: string;
  sourceSnapshotHash: string;
  uploadedFileHash: string;
  projectPatch: Partial<Project>;
  additions: ProjectUpdateChange[];
  modifications: ProjectUpdateChange[];
  removals: ProjectUpdateChange[];
  temporaryIdMap: Record<string, string>;
  validationIssues: ProjectUpdateIssue[];
  warnings: ProjectUpdateIssue[];
  destructiveSummary: Record<string, number>;
  expectedWriteCount: number;
  changeCounts: ProjectUpdateChangeCounts;
  humanSummary: string;
  originalPackage: ProjectExportPackage;
  uploadedPackage: ProjectExportPackage;
  resultCanonicalPackage: ProjectExportPackage;
  resultStateHash: string;
  sourceSnapshot: ProjectExportSnapshot;
  currentProject: Project;
  actor: User;
  applyTimestamp: string;
};

export type ProjectUpdatePlannerInput = {
  projectId: string;
  originalPackage: ProjectExportPackage;
  uploadedPackage: ProjectExportPackage;
  sourceSnapshot: ProjectExportSnapshot;
  currentState: ProjectState;
  currentUser: User;
  uploadedFileHash: string;
  applyTimestamp?: string;
  generateId: (entityType: ProjectUpdateEntityType, temporaryId: string) => string;
};

export type ProjectUpdatePackageValidationResult = {
  package: ProjectExportPackage | null;
  issues: ProjectUpdateIssue[];
};

export type ProjectUpdateResolvedCollections = {
  project: Project;
  phases: Phase[];
  milestones: Milestone[];
  tasks: Task[];
  taskDependencies: TaskDependency[];
  risks: ProjectRisk[];
  documents: ProjectDocument[];
  metrics: ProjectMetric[];
};
