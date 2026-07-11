import { createCanonicalProjectExport, hashProjectExportStructuralState, maxProjectSnapshotBytes, stringifyCanonicalProjectExport, type ProjectExportPackage } from "../exports/projectExport";
import { stableStringify } from "../imports/projectImportPlanner";
import { validateDependencies } from "../scheduling/dependencyGraph";
import type { Milestone, Phase, Project, ProjectDocument, ProjectMetric, ProjectRisk, ProjectState, Task, TaskDependency } from "../types";
import { diffEntityCollection, diffProjectFields } from "./projectUpdateDiff";
import type {
  ProjectUpdateChange,
  ProjectUpdateChangeCounts,
  ProjectUpdateEntityType,
  ProjectUpdateIssue,
  ProjectUpdatePlannerInput,
  ProjectUpdatePlan,
  ProjectUpdateResolvedCollections
} from "./projectUpdateTypes";

const maxAtomicWrites = 450;
const tempIdPattern = /^new_[a-zA-Z0-9_-]+$/;

const projectMutableFields = ["name", "summary", "status", "health", "priority", "startDate", "targetDate", "budget", "currency"] as const;
const projectImmutableFields = ["id", "organizationId", "clientId", "ownerId", "createdAt", "revision", "updatedAt", "lastStructuralChangeAt"] as const;
const projectStatuses = new Set(["planning", "active", "paused", "complete", "archived"]);
const projectHealth = new Set(["on_track", "at_risk", "blocked"]);
const priorities = new Set(["low", "medium", "high", "urgent"]);
const phaseStatuses = new Set(["planned", "active", "complete", "blocked"]);
const milestoneStatuses = new Set(["planned", "at_risk", "complete"]);
const taskStatuses = new Set(["not_started", "todo", "in_progress", "waiting_on_client", "blocked", "done"]);
const dependencyTypes = new Set(["finish_to_start", "start_to_start", "finish_to_finish"]);
const riskSeverity = new Set(["low", "medium", "high", "critical"]);
const riskProbability = new Set(["low", "medium", "high"]);
const riskStatuses = new Set(["monitoring", "mitigating", "resolved"]);
const documentTypes = new Set(["brief", "contract", "technical_note", "deliverable", "other"]);
const metricTones = new Set(["success", "warning", "danger", "info"]);

function issue(
  code: ProjectUpdateIssue["code"],
  message: string,
  options: Omit<ProjectUpdateIssue, "severity" | "code" | "message"> & { severity?: ProjectUpdateIssue["severity"] } = {}
): ProjectUpdateIssue {
  const { severity = "error", ...rest } = options;
  return { severity, code, message, ...rest };
}

function byId<T extends { id: string }>(items: T[]) {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function sameValue(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

function collectionById<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function collectionHasDuplicates<T extends { id: string }>(entityType: ProjectUpdateEntityType, items: T[], issues: ProjectUpdateIssue[]) {
  const seen = new Set<string>();
  items.forEach((item) => {
    if (seen.has(item.id)) {
      issues.push(issue("duplicate_entity_id", `${entityType} contains duplicate ID ${item.id}.`, { entityType, entityId: item.id }));
    }
    seen.add(item.id);
  });
}

function isTempId(value: string) {
  return value.startsWith("new_");
}

function collectTempIds<T extends { id: string }>(
  entityType: ProjectUpdateEntityType,
  originalItems: T[],
  uploadedItems: T[],
  input: ProjectUpdatePlannerInput,
  issues: ProjectUpdateIssue[],
  temporaryIdMap: Record<string, string>
) {
  const originalIds = new Set(originalItems.map((item) => item.id));
  const seenTempIds = new Set<string>();

  uploadedItems.forEach((item) => {
    if (originalIds.has(item.id)) {
      return;
    }

    if (!isTempId(item.id) || !tempIdPattern.test(item.id)) {
      issues.push(issue("invalid_temporary_id", `New ${entityType} record "${item.id}" must use a new_ temporary ID.`, { entityType, entityId: item.id }));
      return;
    }

    if (seenTempIds.has(item.id)) {
      issues.push(issue("duplicate_entity_id", `Temporary ID ${item.id} appears more than once.`, { entityType, entityId: item.id }));
      return;
    }

    seenTempIds.add(item.id);
    temporaryIdMap[item.id] = input.generateId(entityType, item.id);
  });
}

function replaceId(value: string, temporaryIdMap: Record<string, string>) {
  return temporaryIdMap[value] ?? value;
}

function resolveCollections(input: ProjectUpdatePlannerInput, temporaryIdMap: Record<string, string>, issues: ProjectUpdateIssue[]): ProjectUpdateResolvedCollections {
  const now = input.applyTimestamp ?? new Date().toISOString();
  const originalTasks = collectionById(input.originalPackage.tasks);
  const originalDocuments = collectionById(input.originalPackage.documents);
  const resultProject: Project = {
    ...input.originalPackage.project,
    ...Object.fromEntries(projectMutableFields.map((field) => [field, input.uploadedPackage.project[field]])),
    revision: input.originalPackage.baseRevision + 1,
    updatedAt: now,
    lastStructuralChangeAt: now
  };

  const phases: Phase[] = input.uploadedPackage.phases.map((phase) => ({
    ...phase,
    id: replaceId(phase.id, temporaryIdMap),
    projectId: input.projectId
  }));
  const milestones: Milestone[] = input.uploadedPackage.milestones.map((milestone) => ({
    ...milestone,
    id: replaceId(milestone.id, temporaryIdMap),
    projectId: input.projectId
  }));
  const tasks: Task[] = input.uploadedPackage.tasks.map((task) => {
    const originalTask = originalTasks.get(task.id);
    const nextStatus = task.status;
    const completedAt = nextStatus === "done"
      ? (originalTask?.status === "done" ? originalTask.completedAt : now)
      : null;

    return {
      ...task,
      id: replaceId(task.id, temporaryIdMap),
      projectId: input.projectId,
      phaseId: replaceId(task.phaseId, temporaryIdMap),
      completedAt
    };
  });
  const taskDependencies: TaskDependency[] = input.uploadedPackage.taskDependencies.map((dependency) => ({
    ...dependency,
    id: replaceId(dependency.id, temporaryIdMap),
    taskId: replaceId(dependency.taskId, temporaryIdMap),
    dependsOnTaskId: replaceId(dependency.dependsOnTaskId, temporaryIdMap)
  }));
  const risks: ProjectRisk[] = input.uploadedPackage.risks.map((risk) => ({
    ...risk,
    id: replaceId(risk.id, temporaryIdMap),
    projectId: input.projectId
  }));
  const documents: ProjectDocument[] = input.uploadedPackage.documents.map((document) => {
    const originalDocument = originalDocuments.get(document.id);

    return {
      ...document,
      id: replaceId(document.id, temporaryIdMap),
      projectId: input.projectId,
      createdAt: originalDocument?.createdAt ?? now
    };
  });
  const metrics: ProjectMetric[] = input.uploadedPackage.metrics.map((metric) => ({
    ...metric,
    id: replaceId(metric.id, temporaryIdMap),
    projectId: input.projectId
  }));

  [phases, milestones, tasks, taskDependencies, risks, documents, metrics].forEach((collection) => {
    if (collection.some((item) => isTempId(item.id))) {
      issues.push(issue("invalid_temporary_id", "Temporary IDs must be resolved before persistence."));
    }
  });

  return { project: resultProject, phases: byId(phases), milestones: byId(milestones), tasks: byId(tasks), taskDependencies: byId(taskDependencies), risks: byId(risks), documents: byId(documents), metrics: byId(metrics) };
}

function validateIdentity(input: ProjectUpdatePlannerInput, issues: ProjectUpdateIssue[]) {
  const { originalPackage, uploadedPackage } = input;

  if (uploadedPackage.baseProjectId !== input.projectId || uploadedPackage.project.id !== input.projectId) {
    issues.push(issue("project_identity_mismatch", "The update file belongs to a different project.", { entityType: "project", entityId: uploadedPackage.baseProjectId }));
  }

  if (originalPackage.baseProjectId !== input.projectId || originalPackage.project.id !== input.projectId) {
    issues.push(issue("project_identity_mismatch", "The source export snapshot does not belong to this project.", { entityType: "project", entityId: originalPackage.baseProjectId }));
  }

  const currentProject = input.currentState.projects.find((project) => project.id === input.projectId);

  if (uploadedPackage.baseRevision !== originalPackage.baseRevision || currentProject?.revision !== originalPackage.baseRevision) {
    issues.push(issue("stale_base_revision", "This update file is not based on the current project revision.", { entityType: "project", entityId: input.projectId }));
  }

  projectImmutableFields.forEach((field) => {
    if (!sameValue(originalPackage.project[field], uploadedPackage.project[field])) {
      issues.push(issue("immutable_field_changed", `Project field ${field} cannot be changed through an update file.`, { entityType: "project", entityId: input.projectId, path: `$.project.${field}` }));
    }
  });

  if (!sameValue(originalPackage.client, uploadedPackage.client)) {
    issues.push(issue("client_identity_mismatch", "Client records cannot be changed through a project update file.", { entityType: "project", entityId: input.projectId, path: "$.client" }));
  }

  if (!sameValue(byId(originalPackage.members), byId(uploadedPackage.members))) {
    issues.push(issue("member_updates_not_supported", "Project membership must be managed through the Team workspace, not through an update file.", { entityType: "project", entityId: input.projectId, path: "$.members" }));
  }
}

function validateExistingIdentity<T extends { id: string; projectId?: string }>(
  entityType: ProjectUpdateEntityType,
  originalItems: T[],
  uploadedItems: T[],
  issues: ProjectUpdateIssue[]
) {
  const originalById = collectionById(originalItems);

  uploadedItems.forEach((item) => {
    const original = originalById.get(item.id);
    if (!original) {
      return;
    }

    if ("projectId" in item && item.projectId !== original.projectId) {
      issues.push(issue("immutable_field_changed", `${entityType} record ${item.id} cannot be reassigned to another project.`, { entityType, entityId: item.id }));
    }
  });
}

function validateResolvedState(input: ProjectUpdatePlannerInput, result: ProjectUpdateResolvedCollections, issues: ProjectUpdateIssue[]) {
  if (!projectStatuses.has(result.project.status) || !projectHealth.has(result.project.health) || !priorities.has(result.project.priority)) {
    issues.push(issue("invalid_project", "Project status, health, or priority is invalid.", { entityType: "project", entityId: result.project.id }));
  }

  if (result.project.startDate > result.project.targetDate || !Number.isFinite(result.project.budget) || result.project.budget < 0 || result.project.currency.trim() === "") {
    issues.push(issue("invalid_project", "Project dates, budget, or currency are invalid.", { entityType: "project", entityId: result.project.id }));
  }

  collectionHasDuplicates("phases", result.phases, issues);
  collectionHasDuplicates("milestones", result.milestones, issues);
  collectionHasDuplicates("tasks", result.tasks, issues);
  collectionHasDuplicates("taskDependencies", result.taskDependencies, issues);
  collectionHasDuplicates("risks", result.risks, issues);
  collectionHasDuplicates("documents", result.documents, issues);
  collectionHasDuplicates("metrics", result.metrics, issues);

  const phaseIds = new Set(result.phases.map((phase) => phase.id));
  const taskIds = new Set(result.tasks.map((task) => task.id));
  const memberUserIds = new Set(input.originalPackage.members.map((member) => member.userId));

  result.phases.forEach((phase) => {
    if (phase.projectId !== input.projectId || !phaseStatuses.has(phase.status) || phase.endDate < phase.startDate || (phase.sortOrder !== undefined && !Number.isFinite(phase.sortOrder))) {
      issues.push(issue("invalid_phase", `Phase "${phase.name}" is invalid.`, { entityType: "phases", entityId: phase.id, entityName: phase.name }));
    }
  });

  result.milestones.forEach((milestone) => {
    if (milestone.projectId !== input.projectId || !milestoneStatuses.has(milestone.status) || milestone.date.trim() === "") {
      issues.push(issue("invalid_milestone", `Milestone "${milestone.name}" is invalid.`, { entityType: "milestones", entityId: milestone.id, entityName: milestone.name }));
    }
    if (milestone.date < result.project.startDate || milestone.date > result.project.targetDate) {
      issues.push(issue("invalid_milestone", `Milestone "${milestone.name}" is outside project dates.`, { severity: "warning", entityType: "milestones", entityId: milestone.id, entityName: milestone.name }));
    }
  });

  result.tasks.forEach((task) => {
    if (task.projectId !== input.projectId || task.title.trim() === "" || !taskStatuses.has(task.status) || !priorities.has(task.priority) || !Number.isFinite(task.estimateHours) || task.estimateHours < 0) {
      issues.push(issue("invalid_task", `Task "${task.title || task.id}" is invalid.`, { entityType: "tasks", entityId: task.id, entityName: task.title }));
    }
    if (task.startDate && task.dueDate && task.dueDate < task.startDate) {
      issues.push(issue("invalid_task", `Task "${task.title}" due date cannot be before start date.`, { entityType: "tasks", entityId: task.id, entityName: task.title }));
    }
    if (!phaseIds.has(task.phaseId)) {
      issues.push(issue("missing_phase_reference", `Task "${task.title}" references a missing phase.`, { entityType: "tasks", entityId: task.id, entityName: task.title }));
    }
    if (task.assigneeId && !memberUserIds.has(task.assigneeId)) {
      issues.push(issue("unknown_assignee", `Task "${task.title}" is assigned to a user who is not a project member.`, { entityType: "tasks", entityId: task.id, entityName: task.title }));
    }
  });

  result.taskDependencies.forEach((dependency) => {
    if (!dependencyTypes.has(dependency.type)) {
      issues.push(issue("invalid_dependency", `Dependency "${dependency.id}" has an invalid type.`, { entityType: "taskDependencies", entityId: dependency.id }));
    }
    if (!taskIds.has(dependency.taskId) || !taskIds.has(dependency.dependsOnTaskId)) {
      issues.push(issue("missing_dependency_target", `Dependency "${dependency.id}" references a missing task.`, { entityType: "taskDependencies", entityId: dependency.id }));
    }
  });

  validateDependencies(result.tasks, result.taskDependencies).filter((item) => item.severity === "fatal").forEach((dependencyIssue) => {
    issues.push(issue(dependencyIssue.code, dependencyIssue.message, { entityType: "taskDependencies", entityId: dependencyIssue.dependencyId }));
  });

  result.risks.forEach((risk) => {
    if (risk.projectId !== input.projectId || risk.title.trim() === "" || !riskSeverity.has(risk.severity) || !riskProbability.has(risk.probability) || !riskStatuses.has(risk.status) || risk.mitigationPlan.trim() === "") {
      issues.push(issue("invalid_risk", `Risk "${risk.title || risk.id}" is invalid.`, { entityType: "risks", entityId: risk.id, entityName: risk.title }));
    }
  });

  result.documents.forEach((document) => {
    if (document.projectId !== input.projectId || document.title.trim() === "" || !documentTypes.has(document.type)) {
      issues.push(issue("invalid_document", `Document "${document.title || document.id}" is invalid.`, { entityType: "documents", entityId: document.id, entityName: document.title }));
    }
    if (!memberUserIds.has(document.ownerId)) {
      issues.push(issue("unknown_document_owner", `Document "${document.title}" owner must be a project member.`, { entityType: "documents", entityId: document.id, entityName: document.title }));
    }
    if (document.url.trim() === "") {
      issues.push(issue("invalid_document", `Document "${document.title}" has a blank URL.`, { severity: "warning", entityType: "documents", entityId: document.id, entityName: document.title }));
    }
  });

  result.metrics.forEach((metric) => {
    if (metric.projectId !== input.projectId || metric.label.trim() === "" || !Number.isFinite(metric.value) || !metricTones.has(metric.tone)) {
      issues.push(issue("invalid_metric", `Metric "${metric.label || metric.id}" is invalid.`, { entityType: "metrics", entityId: metric.id, entityName: metric.label }));
    }
  });
}

function validateRemovals(input: ProjectUpdatePlannerInput, result: ProjectUpdateResolvedCollections, changes: ProjectUpdateChange[], issues: ProjectUpdateIssue[]) {
  const retainedTaskIds = new Set(result.tasks.map((task) => task.id));
  const retainedPhaseIds = new Set(result.phases.map((phase) => phase.id));
  const removedTaskIds = new Set(changes.filter((change) => change.entityType === "tasks" && change.kind === "removed").map((change) => change.entityId));

  removedTaskIds.forEach((taskId) => {
    if (input.currentState.taskComments.some((comment) => comment.taskId === taskId)) {
      issues.push(issue("task_with_comments_cannot_be_removed", `Task ${taskId} has comments and cannot be removed by file update.`, { entityType: "tasks", entityId: taskId }));
    }
  });

  result.taskDependencies.forEach((dependency) => {
    if (!retainedTaskIds.has(dependency.taskId) || !retainedTaskIds.has(dependency.dependsOnTaskId)) {
      issues.push(issue("missing_dependency_target", `Dependency ${dependency.id} references a removed task.`, { entityType: "taskDependencies", entityId: dependency.id }));
    }
  });

  changes.filter((change) => change.entityType === "phases" && change.kind === "removed").forEach((change) => {
    if (input.uploadedPackage.tasks.some((task) => task.phaseId === change.entityId) || result.tasks.some((task) => !retainedPhaseIds.has(task.phaseId))) {
      issues.push(issue("phase_still_in_use", `Phase ${change.entityName} is still referenced by retained tasks.`, { entityType: "phases", entityId: change.entityId, entityName: change.entityName }));
    }
  });
}

function countChanges(changes: ProjectUpdateChange[]): ProjectUpdateChangeCounts {
  const byEntityType: ProjectUpdateChangeCounts["byEntityType"] = {};
  const counts = { added: 0, modified: 0, removed: 0, byEntityType };

  changes.forEach((change) => {
    byEntityType[change.entityType] ??= { added: 0, modified: 0, removed: 0 };
    if (change.kind === "added") {
      counts.added += 1;
      byEntityType[change.entityType].added += 1;
    } else if (change.kind === "modified") {
      counts.modified += 1;
      byEntityType[change.entityType].modified += 1;
    } else {
      counts.removed += 1;
      byEntityType[change.entityType].removed += 1;
    }
  });

  return counts;
}

export async function createProjectUpdatePlan(input: ProjectUpdatePlannerInput): Promise<ProjectUpdatePlan> {
  const issues: ProjectUpdateIssue[] = [];
  const currentProject = input.currentState.projects.find((project) => project.id === input.projectId);

  if (!currentProject) {
    issues.push(issue("project_identity_mismatch", "Selected project was not found.", { entityType: "project", entityId: input.projectId }));
  }

  validateIdentity(input, issues);
  validateExistingIdentity("phases", input.originalPackage.phases, input.uploadedPackage.phases, issues);
  validateExistingIdentity("milestones", input.originalPackage.milestones, input.uploadedPackage.milestones, issues);
  validateExistingIdentity("tasks", input.originalPackage.tasks, input.uploadedPackage.tasks, issues);
  validateExistingIdentity("risks", input.originalPackage.risks, input.uploadedPackage.risks, issues);
  validateExistingIdentity("documents", input.originalPackage.documents, input.uploadedPackage.documents, issues);
  validateExistingIdentity("metrics", input.originalPackage.metrics, input.uploadedPackage.metrics, issues);

  const temporaryIdMap: Record<string, string> = {};
  collectTempIds("phases", input.originalPackage.phases, input.uploadedPackage.phases, input, issues, temporaryIdMap);
  collectTempIds("milestones", input.originalPackage.milestones, input.uploadedPackage.milestones, input, issues, temporaryIdMap);
  collectTempIds("tasks", input.originalPackage.tasks, input.uploadedPackage.tasks, input, issues, temporaryIdMap);
  collectTempIds("taskDependencies", input.originalPackage.taskDependencies, input.uploadedPackage.taskDependencies, input, issues, temporaryIdMap);
  collectTempIds("risks", input.originalPackage.risks, input.uploadedPackage.risks, input, issues, temporaryIdMap);
  collectTempIds("documents", input.originalPackage.documents, input.uploadedPackage.documents, input, issues, temporaryIdMap);
  collectTempIds("metrics", input.originalPackage.metrics, input.uploadedPackage.metrics, input, issues, temporaryIdMap);

  const result = resolveCollections(input, temporaryIdMap, issues);
  validateResolvedState(input, result, issues);

  const changes = [
    ...diffProjectFields(input.originalPackage.project as unknown as Record<string, unknown>, result.project as unknown as Record<string, unknown>),
    ...diffEntityCollection("phases", input.originalPackage.phases, result.phases),
    ...diffEntityCollection("milestones", input.originalPackage.milestones, result.milestones),
    ...diffEntityCollection("tasks", input.originalPackage.tasks, result.tasks),
    ...diffEntityCollection("taskDependencies", input.originalPackage.taskDependencies, result.taskDependencies),
    ...diffEntityCollection("risks", input.originalPackage.risks, result.risks),
    ...diffEntityCollection("documents", input.originalPackage.documents, result.documents),
    ...diffEntityCollection("metrics", input.originalPackage.metrics, result.metrics)
  ];
  validateRemovals(input, result, changes, issues);

  const changeCounts = countChanges(changes);
  const expectedWriteCount = changes.length + 5;

  if (expectedWriteCount > maxAtomicWrites) {
    issues.push(issue("revision_too_large_for_atomic_apply", "This update is too large to apply safely as one atomic project revision."));
  }

  if (changeCounts.added + changeCounts.modified + changeCounts.removed === 0) {
    issues.push(issue("no_project_changes", "This file matches the current project. No update is required.", { severity: "warning" }));
  }

  const resultState: ProjectState = {
    ...input.currentState,
    projects: input.currentState.projects.map((project) => project.id === input.projectId ? result.project : project),
    phases: [...input.currentState.phases.filter((item) => item.projectId !== input.projectId), ...result.phases],
    milestones: [...input.currentState.milestones.filter((item) => item.projectId !== input.projectId), ...result.milestones],
    tasks: [...input.currentState.tasks.filter((item) => item.projectId !== input.projectId), ...result.tasks],
    taskDependencies: [
      ...input.currentState.taskDependencies.filter((dependency) => !input.currentState.tasks.some((task) => task.projectId === input.projectId && task.id === dependency.taskId)),
      ...result.taskDependencies
    ],
    risks: [...input.currentState.risks.filter((item) => item.projectId !== input.projectId), ...result.risks],
    documents: [...input.currentState.documents.filter((item) => item.projectId !== input.projectId), ...result.documents],
    metrics: [...input.currentState.metrics.filter((item) => item.projectId !== input.projectId), ...result.metrics]
  };
  const resultCanonicalPackage: ProjectExportPackage = {
    ...createCanonicalProjectExport(resultState, input.projectId, input.applyTimestamp ?? new Date().toISOString(), {
      schemaVersion: "1.1",
      exportSnapshotId: `result_${input.uploadedFileHash.slice(0, 24)}`
    }),
    baseRevision: input.originalPackage.baseRevision + 1
  };
  const resultPackageJson = stringifyCanonicalProjectExport(resultCanonicalPackage);

  if (new TextEncoder().encode(resultPackageJson).byteLength > maxProjectSnapshotBytes) {
    issues.push(issue("project_snapshot_too_large", "The canonical project snapshot is too large to store safely."));
  }

  const additions = changes.filter((change) => change.kind === "added");
  const modifications = changes.filter((change) => change.kind === "modified");
  const removals = changes.filter((change) => change.kind === "removed");
  const destructiveSummary = Object.fromEntries(
    Object.entries(changeCounts.byEntityType)
      .map(([key, value]) => [key, value.removed] as const)
      .filter(([, removed]) => removed > 0)
  );
  const warnings = issues.filter((item) => item.severity === "warning");

  return {
    projectId: input.projectId,
    baseRevision: input.originalPackage.baseRevision,
    resultRevision: input.originalPackage.baseRevision + 1,
    sourceSnapshotId: input.sourceSnapshot.id,
    sourcePackageId: input.sourceSnapshot.packageId,
    sourceSnapshotHash: input.sourceSnapshot.sourceHash,
    uploadedFileHash: input.uploadedFileHash,
    projectPatch: Object.fromEntries(projectMutableFields.map((field) => [field, result.project[field]])) as Partial<Project>,
    additions,
    modifications,
    removals,
    temporaryIdMap,
    validationIssues: issues,
    warnings,
    destructiveSummary,
    expectedWriteCount,
    changeCounts,
    humanSummary: `Apply ${changeCounts.added} additions, ${changeCounts.modified} modifications, and ${changeCounts.removed} removals.`,
    originalPackage: input.originalPackage,
    uploadedPackage: input.uploadedPackage,
    resultCanonicalPackage,
    resultStateHash: await hashProjectExportStructuralState(resultCanonicalPackage),
    sourceSnapshot: input.sourceSnapshot,
    currentProject: currentProject ?? input.originalPackage.project,
    actor: input.currentUser,
    applyTimestamp: input.applyTimestamp ?? new Date().toISOString()
  };
}
