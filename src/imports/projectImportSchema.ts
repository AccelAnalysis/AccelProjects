import type {
  ImportValidationIssue,
  ProjectImportDocument,
  ProjectImportMetric,
  ProjectImportMilestone,
  ProjectImportPackage,
  ProjectImportPerson,
  ProjectImportPhase,
  ProjectImportRisk,
  ProjectImportTask,
  ProjectImportTaskDependency
} from "./projectImportTypes";

const clientStatuses = ["lead", "active", "paused", "archived"] as const;
const projectStatuses = ["planning", "active", "paused", "complete", "archived"] as const;
const projectHealthValues = ["on_track", "at_risk", "blocked"] as const;
const priorityValues = ["low", "medium", "high", "urgent"] as const;
const userRoles = ["admin", "project_manager", "contributor", "client", "viewer"] as const;
const projectRoles = ["sponsor", "lead", "contributor", "observer"] as const;
const personMatchModes = ["manual", "match_by_email"] as const;
const phaseStatuses = ["planned", "active", "complete", "blocked"] as const;
const milestoneStatuses = ["planned", "at_risk", "complete"] as const;
const taskStatuses = ["not_started", "todo", "in_progress", "waiting_on_client", "blocked", "done"] as const;
const dependencyTypes = ["finish_to_start", "start_to_start", "finish_to_finish"] as const;
const riskSeverities = ["low", "medium", "high", "critical"] as const;
const riskProbabilities = ["low", "medium", "high"] as const;
const riskStatuses = ["monitoring", "mitigating", "resolved"] as const;
const documentTypes = ["brief", "contract", "technical_note", "deliverable", "other"] as const;
const metricTones = ["success", "warning", "danger", "info"] as const;
const databaseFieldNames = ["id", "organizationId", "projectId", "clientId", "phaseId", "taskId", "ownerId", "assigneeId", "createdAt", "updatedAt"];

type MutablePackage = {
  schemaVersion?: ProjectImportPackage["schemaVersion"];
  packageType?: ProjectImportPackage["packageType"];
  packageId?: string;
  source?: ProjectImportPackage["source"];
  client?: ProjectImportPackage["client"];
  project?: ProjectImportPackage["project"];
  people?: ProjectImportPerson[];
  phases?: ProjectImportPhase[];
  milestones?: ProjectImportMilestone[];
  tasks?: ProjectImportTask[];
  risks?: ProjectImportRisk[];
  documents?: ProjectImportDocument[];
  metrics?: ProjectImportMetric[];
  assumptions?: string[];
  warnings?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(
  issues: ImportValidationIssue[],
  severity: ImportValidationIssue["severity"],
  code: string,
  path: string,
  message: string
) {
  issues.push({ severity, code, path, message });
}

function getRecord(value: Record<string, unknown>, key: string, path: string, issues: ImportValidationIssue[]) {
  const child = value[key];

  if (!isRecord(child)) {
    addIssue(issues, "error", "required_object", path, `${path} must be an object.`);
    return null;
  }

  return child;
}

function requireString(record: Record<string, unknown>, key: string, path: string, issues: ImportValidationIssue[]) {
  const value = record[key];

  if (typeof value !== "string" || value.trim() === "") {
    addIssue(issues, "error", "required_string", `${path}.${key}`, `${path}.${key} is required.`);
    return "";
  }

  return value;
}

function optionalNullableString(record: Record<string, unknown>, key: string, path: string, issues: ImportValidationIssue[]) {
  const value = record[key];

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    addIssue(issues, "error", "required_nullable_string", `${path}.${key}`, `${path}.${key} must be a string or null.`);
    return null;
  }

  return value.trim() === "" ? null : value;
}

function requireNumber(record: Record<string, unknown>, key: string, path: string, issues: ImportValidationIssue[], options?: { nonNegative?: boolean; integer?: boolean }) {
  const value = record[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    addIssue(issues, "error", "required_number", `${path}.${key}`, `${path}.${key} must be a finite number.`);
    return 0;
  }

  if (options?.integer && !Number.isInteger(value)) {
    addIssue(issues, "error", "integer_required", `${path}.${key}`, `${path}.${key} must be an integer.`);
  }

  if (options?.nonNegative && value < 0) {
    addIssue(issues, "error", "negative_number", `${path}.${key}`, `${path}.${key} cannot be negative.`);
  }

  return value;
}

function requireEnum<const T extends readonly string[]>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  values: T,
  issues: ImportValidationIssue[]
): T[number] {
  const value = record[key];

  if (typeof value !== "string" || !values.includes(value)) {
    addIssue(issues, "error", "invalid_enum", `${path}.${key}`, `${path}.${key} must be one of: ${values.join(", ")}.`);
    return values[0];
  }

  return value;
}

function requireExact<const T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  expected: T,
  issues: ImportValidationIssue[],
  code = "invalid_literal"
): T {
  const value = record[key];

  if (value !== expected) {
    addIssue(issues, "error", code, `${path}.${key}`, `${path}.${key} must be exactly "${expected}".`);
  }

  return expected;
}

function requireArray<T>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ImportValidationIssue[],
  mapItem: (item: Record<string, unknown>, itemPath: string) => T
) {
  const value = record[key];

  if (!Array.isArray(value)) {
    addIssue(issues, "error", "required_array", `${path}.${key}`, `${path}.${key} must be an array.`);
    return [];
  }

  return value.flatMap((item, index) => {
    const itemPath = `${path}.${key}[${index}]`;

    if (!isRecord(item)) {
      addIssue(issues, "error", "required_object", itemPath, `${itemPath} must be an object.`);
      return [];
    }

    checkDatabaseFields(item, itemPath, issues);
    return [mapItem(item, itemPath)];
  });
}

function requireStringArray(record: Record<string, unknown>, key: string, path: string, issues: ImportValidationIssue[]) {
  const value = record[key];

  if (!Array.isArray(value)) {
    addIssue(issues, "error", "required_array", `${path}.${key}`, `${path}.${key} must be an array.`);
    return [];
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      addIssue(issues, "error", "required_string", `${path}.${key}[${index}]`, `${path}.${key}[${index}] must be a string.`);
      return "";
    }

    return item;
  });
}

function requireDateOnly(value: string, path: string, issues: ImportValidationIssue[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    addIssue(issues, "error", "invalid_date", path, `${path} must use YYYY-MM-DD format.`);
    return;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    addIssue(issues, "error", "invalid_date", path, `${path} must be a real calendar date.`);
  }
}

function requireTimestamp(value: string, path: string, issues: ImportValidationIssue[]) {
  if (Number.isNaN(Date.parse(value))) {
    addIssue(issues, "error", "invalid_timestamp", path, `${path} must be a valid timestamp.`);
  }
}

function checkUnique(items: Array<{ value: string; path: string }>, label: string, issues: ImportValidationIssue[]) {
  const seen = new Map<string, string>();

  items.forEach((item) => {
    const normalized = item.value.trim().toLowerCase();

    if (!normalized) {
      addIssue(issues, "error", "empty_key", item.path, `${label} values cannot be empty.`);
      return;
    }

    const existingPath = seen.get(normalized);

    if (existingPath) {
      addIssue(issues, "error", "duplicate_key", item.path, `${label} "${item.value}" duplicates ${existingPath}.`);
      return;
    }

    seen.set(normalized, item.path);
  });
}

function checkDatabaseFields(record: Record<string, unknown>, path: string, issues: ImportValidationIssue[]) {
  databaseFieldNames.forEach((fieldName) => {
    if (fieldName in record) {
      addIssue(issues, "error", "database_field_not_allowed", `${path}.${fieldName}`, `${path}.${fieldName} is not allowed in an import package.`);
    }
  });
}

function validateDateFields(packageDraft: MutablePackage, issues: ImportValidationIssue[]) {
  const generatedAt = packageDraft.source?.generatedAt;

  if (generatedAt) {
    requireTimestamp(generatedAt, "$.source.generatedAt", issues);
  }

  if (packageDraft.project) {
    requireDateOnly(packageDraft.project.startDate, "$.project.startDate", issues);
    requireDateOnly(packageDraft.project.targetDate, "$.project.targetDate", issues);
  }

  packageDraft.phases?.forEach((phase, index) => {
    requireDateOnly(phase.startDate, `$.phases[${index}].startDate`, issues);
    requireDateOnly(phase.endDate, `$.phases[${index}].endDate`, issues);
  });
  packageDraft.milestones?.forEach((milestone, index) => requireDateOnly(milestone.date, `$.milestones[${index}].date`, issues));
  packageDraft.tasks?.forEach((task, index) => {
    requireDateOnly(task.startDate, `$.tasks[${index}].startDate`, issues);
    requireDateOnly(task.dueDate, `$.tasks[${index}].dueDate`, issues);
  });
}

export function parseProjectImportJson(text: string) {
  try {
    return {
      value: JSON.parse(text) as unknown,
      issues: [] as ImportValidationIssue[]
    };
  } catch (error) {
    return {
      value: null,
      issues: [{
        severity: "error",
        code: "malformed_json",
        path: "$",
        message: error instanceof Error ? `Malformed JSON: ${error.message}` : "Malformed JSON."
      }] satisfies ImportValidationIssue[]
    };
  }
}

export function validateProjectImportSchema(value: unknown): { package: ProjectImportPackage | null; issues: ImportValidationIssue[] } {
  const issues: ImportValidationIssue[] = [];

  if (!isRecord(value)) {
    addIssue(issues, "error", "root_not_object", "$", "The import JSON root must be an object.");
    return { package: null, issues };
  }

  checkDatabaseFields(value, "$", issues);

  const draft: MutablePackage = {
    schemaVersion: requireExact(value, "schemaVersion", "$", "1.0", issues, "unsupported_schema_version"),
    packageType: requireExact(value, "packageType", "$", "accelprojects.project", issues),
    packageId: requireString(value, "packageId", "$", issues)
  };

  const source = getRecord(value, "source", "$.source", issues);
  if (source) {
    draft.source = {
      name: requireString(source, "name", "$.source", issues),
      description: requireString(source, "description", "$.source", issues),
      generatedAt: requireString(source, "generatedAt", "$.source", issues),
      references: requireStringArray(source, "references", "$.source", issues)
    };
  }

  const client = getRecord(value, "client", "$.client", issues);
  if (client) {
    draft.client = {
      externalKey: requireString(client, "externalKey", "$.client", issues),
      matchMode: requireEnum(client, "matchMode", "$.client", ["match_or_create"] as const, issues),
      name: requireString(client, "name", "$.client", issues),
      contactName: requireString(client, "contactName", "$.client", issues),
      email: requireString(client, "email", "$.client", issues),
      phone: requireString(client, "phone", "$.client", issues),
      status: requireEnum(client, "status", "$.client", clientStatuses, issues)
    };
  }

  const project = getRecord(value, "project", "$.project", issues);
  if (project) {
    draft.project = {
      externalKey: requireString(project, "externalKey", "$.project", issues),
      name: requireString(project, "name", "$.project", issues),
      summary: requireString(project, "summary", "$.project", issues),
      status: requireEnum(project, "status", "$.project", projectStatuses, issues),
      health: requireEnum(project, "health", "$.project", projectHealthValues, issues),
      priority: requireEnum(project, "priority", "$.project", priorityValues, issues),
      startDate: requireString(project, "startDate", "$.project", issues),
      targetDate: requireString(project, "targetDate", "$.project", issues),
      budget: requireNumber(project, "budget", "$.project", issues, { nonNegative: true }),
      currency: requireString(project, "currency", "$.project", issues),
      ownerAlias: optionalNullableString(project, "ownerAlias", "$.project", issues)
    };
  }

  draft.people = requireArray(value, "people", "$", issues, (person, path) => ({
    alias: requireString(person, "alias", path, issues),
    name: requireString(person, "name", path, issues),
    email: requireString(person, "email", path, issues),
    organizationRole: requireEnum(person, "organizationRole", path, userRoles, issues),
    projectRole: requireEnum(person, "projectRole", path, projectRoles, issues),
    matchMode: requireEnum(person, "matchMode", path, personMatchModes, issues)
  }));

  draft.phases = requireArray(value, "phases", "$", issues, (phase, path) => ({
    key: requireString(phase, "key", path, issues),
    name: requireString(phase, "name", path, issues),
    status: requireEnum(phase, "status", path, phaseStatuses, issues),
    startDate: requireString(phase, "startDate", path, issues),
    endDate: requireString(phase, "endDate", path, issues),
    sortOrder: requireNumber(phase, "sortOrder", path, issues, { integer: true })
  }));

  draft.milestones = requireArray(value, "milestones", "$", issues, (milestone, path) => ({
    key: requireString(milestone, "key", path, issues),
    name: requireString(milestone, "name", path, issues),
    date: requireString(milestone, "date", path, issues),
    status: requireEnum(milestone, "status", path, milestoneStatuses, issues)
  }));

  draft.tasks = requireArray(value, "tasks", "$", issues, (task, path) => ({
    key: requireString(task, "key", path, issues),
    phaseKey: requireString(task, "phaseKey", path, issues),
    title: requireString(task, "title", path, issues),
    description: requireString(task, "description", path, issues),
    status: requireEnum(task, "status", path, taskStatuses, issues),
    priority: requireEnum(task, "priority", path, priorityValues, issues),
    assigneeAlias: optionalNullableString(task, "assigneeAlias", path, issues),
    startDate: requireString(task, "startDate", path, issues),
    dueDate: requireString(task, "dueDate", path, issues),
    estimateHours: requireNumber(task, "estimateHours", path, issues, { nonNegative: true }),
    dependencies: requireArray(task, "dependencies", path, issues, (dependency, dependencyPath): ProjectImportTaskDependency => ({
      dependsOnTaskKey: requireString(dependency, "dependsOnTaskKey", dependencyPath, issues),
      type: requireEnum(dependency, "type", dependencyPath, dependencyTypes, issues)
    }))
  }));

  draft.risks = requireArray(value, "risks", "$", issues, (risk, path) => ({
    key: requireString(risk, "key", path, issues),
    title: requireString(risk, "title", path, issues),
    severity: requireEnum(risk, "severity", path, riskSeverities, issues),
    probability: requireEnum(risk, "probability", path, riskProbabilities, issues),
    status: requireEnum(risk, "status", path, riskStatuses, issues),
    mitigationPlan: requireString(risk, "mitigationPlan", path, issues)
  }));

  draft.documents = requireArray(value, "documents", "$", issues, (document, path) => ({
    key: requireString(document, "key", path, issues),
    title: requireString(document, "title", path, issues),
    type: requireEnum(document, "type", path, documentTypes, issues),
    url: typeof document.url === "string" ? document.url : requireString(document, "url", path, issues),
    ownerAlias: optionalNullableString(document, "ownerAlias", path, issues)
  }));

  draft.metrics = requireArray(value, "metrics", "$", issues, (metric, path) => ({
    key: requireString(metric, "key", path, issues),
    label: requireString(metric, "label", path, issues),
    value: requireNumber(metric, "value", path, issues),
    suffix: typeof metric.suffix === "string" ? metric.suffix : requireString(metric, "suffix", path, issues),
    tone: requireEnum(metric, "tone", path, metricTones, issues)
  }));

  draft.assumptions = requireStringArray(value, "assumptions", "$", issues);
  draft.warnings = requireStringArray(value, "warnings", "$", issues);

  validateDateFields(draft, issues);
  checkUnique((draft.people ?? []).map((person, index) => ({ value: person.alias, path: `$.people[${index}].alias` })), "Person aliases", issues);
  checkUnique((draft.phases ?? []).map((phase, index) => ({ value: phase.key, path: `$.phases[${index}].key` })), "Phase keys", issues);
  checkUnique((draft.milestones ?? []).map((milestone, index) => ({ value: milestone.key, path: `$.milestones[${index}].key` })), "Milestone keys", issues);
  checkUnique((draft.tasks ?? []).map((task, index) => ({ value: task.key, path: `$.tasks[${index}].key` })), "Task keys", issues);
  checkUnique((draft.risks ?? []).map((risk, index) => ({ value: risk.key, path: `$.risks[${index}].key` })), "Risk keys", issues);
  checkUnique((draft.documents ?? []).map((document, index) => ({ value: document.key, path: `$.documents[${index}].key` })), "Document keys", issues);
  checkUnique((draft.metrics ?? []).map((metric, index) => ({ value: metric.key, path: `$.metrics[${index}].key` })), "Metric keys", issues);

  if (issues.some((issue) => issue.severity === "error")) {
    return { package: null, issues };
  }

  return { package: draft as ProjectImportPackage, issues };
}
