import { parseProjectImportJson, validateProjectImportSchema } from "./projectImportSchema";
import type { ImportValidationIssue, ImportValidationResult, ProjectImportPackage } from "./projectImportTypes";

function addIssue(
  issues: ImportValidationIssue[],
  severity: ImportValidationIssue["severity"],
  code: string,
  path: string,
  message: string
) {
  issues.push({ severity, code, path, message });
}

function compareDates(left: string, right: string) {
  return left.localeCompare(right);
}

function hasFatalIssues(issues: ImportValidationIssue[]) {
  return issues.some((issue) => issue.severity === "error");
}

function validateTaskCycles(projectPackage: ProjectImportPackage, issues: ImportValidationIssue[]) {
  const adjacency = new Map<string, string[]>();

  projectPackage.tasks.forEach((task) => {
    adjacency.set(task.key, task.dependencies.map((dependency) => dependency.dependsOnTaskKey));
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(taskKey: string, path: string[]) {
    if (visiting.has(taskKey)) {
      addIssue(
        issues,
        "error",
        "circular_dependency",
        "$.tasks",
        `Task dependencies contain a cycle: ${[...path, taskKey].join(" -> ")}.`
      );
      return;
    }

    if (visited.has(taskKey)) {
      return;
    }

    visiting.add(taskKey);
    (adjacency.get(taskKey) ?? []).forEach((dependencyKey) => visit(dependencyKey, [...path, taskKey]));
    visiting.delete(taskKey);
    visited.add(taskKey);
  }

  projectPackage.tasks.forEach((task) => visit(task.key, []));
}

export function validateProjectImportSemantics(projectPackage: ProjectImportPackage): ImportValidationIssue[] {
  const issues: ImportValidationIssue[] = [];
  const people = new Map(projectPackage.people.map((person) => [person.alias, person]));
  const phases = new Map(projectPackage.phases.map((phase) => [phase.key, phase]));
  const tasks = new Map(projectPackage.tasks.map((task) => [task.key, task]));

  if (projectPackage.project.ownerAlias && !people.has(projectPackage.project.ownerAlias)) {
    addIssue(
      issues,
      "error",
      "missing_project_owner_alias",
      "$.project.ownerAlias",
      `Project owner alias "${projectPackage.project.ownerAlias}" does not exist in people.`
    );
  }

  if (!projectPackage.project.ownerAlias) {
    addIssue(issues, "warning", "project_owner_required", "$.project.ownerAlias", "A project owner must be selected before import.");
  }

  if (compareDates(projectPackage.project.targetDate, projectPackage.project.startDate) < 0) {
    addIssue(issues, "error", "invalid_project_date_order", "$.project.targetDate", "Project target date cannot be before start date.");
  }

  projectPackage.phases.forEach((phase, index) => {
    if (compareDates(phase.endDate, phase.startDate) < 0) {
      addIssue(issues, "error", "invalid_phase_date_order", `$.phases[${index}].endDate`, `Phase "${phase.name}" end date cannot be before start date.`);
    }
  });

  projectPackage.milestones.forEach((milestone, index) => {
    if (
      compareDates(milestone.date, projectPackage.project.startDate) < 0
      || compareDates(milestone.date, projectPackage.project.targetDate) > 0
    ) {
      addIssue(issues, "warning", "milestone_outside_project_dates", `$.milestones[${index}].date`, `Milestone "${milestone.name}" falls outside the project date range.`);
    }
  });

  projectPackage.tasks.forEach((task, index) => {
    const taskPath = `$.tasks[${index}]`;
    const phase = phases.get(task.phaseKey);

    if (!phase) {
      addIssue(issues, "error", "missing_phase_reference", `${taskPath}.phaseKey`, `Task "${task.title}" references missing phase key "${task.phaseKey}".`);
    }

    if (task.assigneeAlias && !people.has(task.assigneeAlias)) {
      addIssue(issues, "error", "missing_assignee_alias", `${taskPath}.assigneeAlias`, `Task "${task.title}" references missing person alias "${task.assigneeAlias}".`);
    }

    if (!task.assigneeAlias) {
      addIssue(issues, "warning", "missing_assignee", `${taskPath}.assigneeAlias`, `Task "${task.title}" has no assignee and will import as unassigned.`);
    }

    if (compareDates(task.dueDate, task.startDate) < 0) {
      addIssue(issues, "error", "invalid_task_date_order", `${taskPath}.dueDate`, `Task "${task.title}" due date cannot be before start date.`);
    }

    if (
      compareDates(task.startDate, projectPackage.project.startDate) < 0
      || compareDates(task.dueDate, projectPackage.project.targetDate) > 0
    ) {
      addIssue(issues, "warning", "task_outside_project_dates", `${taskPath}.startDate`, `Task "${task.title}" falls outside the project date range.`);
    }

    if (phase && (compareDates(task.startDate, phase.startDate) < 0 || compareDates(task.dueDate, phase.endDate) > 0)) {
      addIssue(issues, "warning", "task_outside_phase_dates", `${taskPath}.startDate`, `Task "${task.title}" falls outside the date range for phase "${phase.name}".`);
    }

    const dependencyKeys = new Set<string>();
    task.dependencies.forEach((dependency, dependencyIndex) => {
      const dependencyPath = `${taskPath}.dependencies[${dependencyIndex}]`;
      const duplicateKey = `${dependency.dependsOnTaskKey}:${dependency.type}`;

      if (!tasks.has(dependency.dependsOnTaskKey)) {
        addIssue(issues, "error", "missing_dependency_target", `${dependencyPath}.dependsOnTaskKey`, `Task "${task.title}" depends on missing task key "${dependency.dependsOnTaskKey}".`);
      }

      if (dependency.dependsOnTaskKey === task.key) {
        addIssue(issues, "error", "self_dependency", `${dependencyPath}.dependsOnTaskKey`, `Task "${task.title}" cannot depend on itself.`);
      }

      if (dependencyKeys.has(duplicateKey)) {
        addIssue(issues, "error", "duplicate_dependency", dependencyPath, `Task "${task.title}" has a duplicate dependency on "${dependency.dependsOnTaskKey}".`);
      }

      dependencyKeys.add(duplicateKey);
    });
  });

  projectPackage.documents.forEach((document, index) => {
    if (document.ownerAlias && !people.has(document.ownerAlias)) {
      addIssue(issues, "error", "missing_document_owner_alias", `$.documents[${index}].ownerAlias`, `Document "${document.title}" references missing owner alias "${document.ownerAlias}".`);
    }

    if (document.url.trim() === "") {
      addIssue(issues, "warning", "empty_document_url", `$.documents[${index}].url`, `Document "${document.title}" has an empty URL.`);
    }
  });

  validateTaskCycles(projectPackage, issues);

  projectPackage.assumptions.forEach((assumption, index) => {
    addIssue(issues, "warning", "package_assumption", `$.assumptions[${index}]`, assumption);
  });

  projectPackage.warnings.forEach((warning, index) => {
    addIssue(issues, "warning", "package_warning", `$.warnings[${index}]`, warning);
  });

  return issues;
}

export function validateProjectImportPackage(value: unknown): ImportValidationResult {
  const schemaResult = validateProjectImportSchema(value);

  if (!schemaResult.package) {
    return schemaResult;
  }

  const semanticIssues = validateProjectImportSemantics(schemaResult.package);

  return {
    package: hasFatalIssues(semanticIssues) ? null : schemaResult.package,
    issues: [...schemaResult.issues, ...semanticIssues]
  };
}

export function parseAndValidateProjectImportText(text: string): ImportValidationResult {
  const parsed = parseProjectImportJson(text);

  if (parsed.issues.length > 0) {
    return { package: null, issues: parsed.issues };
  }

  return validateProjectImportPackage(parsed.value);
}

export function splitImportIssues(issues: ImportValidationIssue[]) {
  return {
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning")
  };
}
