import { stableStringify } from "../imports/projectImportPlanner";
import type { ProjectUpdateChange, ProjectUpdateEntityType, ProjectUpdateFieldChange } from "./projectUpdateTypes";

const displayFieldsByType: Record<ProjectUpdateEntityType, string[]> = {
  project: ["name", "summary", "status", "health", "priority", "startDate", "targetDate", "budget", "currency"],
  phases: ["name", "status", "startDate", "endDate", "sortOrder", "lifecycle"],
  milestones: ["name", "date", "status", "lifecycle"],
  tasks: ["title", "description", "status", "priority", "phaseId", "assigneeId", "startDate", "dueDate", "sortOrder", "estimateHours", "completedAt", "lifecycle"],
  taskDependencies: ["taskId", "dependsOnTaskId", "type", "lifecycle"],
  risks: ["title", "severity", "probability", "status", "mitigationPlan", "lifecycle"],
  documents: ["title", "type", "url", "ownerId", "createdAt", "lifecycle"],
  metrics: ["label", "value", "suffix", "tone", "lifecycle"]
};

function getEntityName(entity: Record<string, unknown>, entityType: ProjectUpdateEntityType) {
  if (entityType === "taskDependencies") {
    return `${String(entity.taskId)} depends on ${String(entity.dependsOnTaskId)}`;
  }

  return String(entity.name ?? entity.title ?? entity.label ?? entity.id);
}

function getFieldChanges(entityType: ProjectUpdateEntityType, before: Record<string, unknown>, after: Record<string, unknown>): ProjectUpdateFieldChange[] {
  return displayFieldsByType[entityType]
    .filter((field) => stableStringify(before[field]) !== stableStringify(after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }));
}

export function diffEntityCollection<T extends { id: string }>(
  entityType: ProjectUpdateEntityType,
  beforeItems: T[],
  afterItems: T[]
): ProjectUpdateChange[] {
  const beforeById = new Map(beforeItems.map((item) => [item.id, item]));
  const afterById = new Map(afterItems.map((item) => [item.id, item]));
  const changes: ProjectUpdateChange[] = [];

  afterItems.forEach((after) => {
    const before = beforeById.get(after.id);

    if (!before) {
      changes.push({
        entityType,
        entityId: after.id,
        entityName: getEntityName(after as Record<string, unknown>, entityType),
        kind: "added",
        fields: []
      });
      return;
    }

    const fields = getFieldChanges(entityType, before as Record<string, unknown>, after as Record<string, unknown>);

    if (fields.length > 0) {
      changes.push({
        entityType,
        entityId: after.id,
        entityName: getEntityName(after as Record<string, unknown>, entityType),
        kind: "modified",
        fields
      });
    }
  });

  beforeItems.forEach((before) => {
    if (!afterById.has(before.id)) {
      changes.push({
        entityType,
        entityId: before.id,
        entityName: getEntityName(before as Record<string, unknown>, entityType),
        kind: "removed",
        fields: []
      });
    }
  });

  return changes;
}

export function diffProjectFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const fields = getFieldChanges("project", before, after);

  return fields.length > 0 ? [{
    entityType: "project" as const,
    entityId: String(after.id),
    entityName: String(after.name),
    kind: "modified" as const,
    fields
  }] : [];
}
