import type { ProjectExportPackage } from "../exports/projectExport";
import type { ProjectUpdateIssue, ProjectUpdatePackageValidationResult } from "./projectUpdateTypes";

const supportedExportSchemas = new Set(["1.0", "1.1"]);

function issue(code: ProjectUpdateIssue["code"], message: string, path = "$"): ProjectUpdateIssue {
  return { severity: "error", code, message, path };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, issues: ProjectUpdateIssue[], path: string) {
  if (typeof record[key] !== "string" || (record[key] as string).trim() === "") {
    issues.push(issue("wrong_package_type", `${key} is required.`, `${path}.${key}`));
  }
}

function requireArray(record: Record<string, unknown>, key: string, issues: ProjectUpdateIssue[], path: string) {
  if (!Array.isArray(record[key])) {
    issues.push(issue("wrong_package_type", `${key} must be an array.`, `${path}.${key}`));
  }
}

export function parseProjectUpdateJson(text: string): { value: unknown; issues: ProjectUpdateIssue[] } {
  try {
    return { value: JSON.parse(text), issues: [] };
  } catch {
    return {
      value: null,
      issues: [issue("malformed_json", "The uploaded file is not valid JSON.")]
    };
  }
}

export function validateProjectUpdateExportPackage(value: unknown): ProjectUpdatePackageValidationResult {
  const issues: ProjectUpdateIssue[] = [];

  if (!isRecord(value)) {
    return { package: null, issues: [issue("wrong_package_type", "The uploaded file must contain a project export object.")] };
  }

  if (value.packageType === "accelprojects.project") {
    return {
      package: null,
      issues: [issue("create_package_not_valid_for_update", "Create-project packages cannot be used to update an existing project.")]
    };
  }

  if (value.packageType !== "accelprojects.project.export") {
    issues.push(issue("wrong_package_type", "The uploaded file must be an AccelProjects project export.", "$.packageType"));
  }

  if (typeof value.schemaVersion !== "string" || !supportedExportSchemas.has(value.schemaVersion)) {
    issues.push(issue("unsupported_export_schema", "Supported project export schemas are 1.0 and 1.1.", "$.schemaVersion"));
  }

  if (value.schemaVersion === "1.1" && typeof value.exportSnapshotId !== "string") {
    issues.push(issue("unknown_export_snapshot", "Schema 1.1 update files must include exportSnapshotId.", "$.exportSnapshotId"));
  }

  ["packageId", "exportedAt", "baseProjectId"].forEach((key) => requireString(value, key, issues, "$"));

  if (typeof value.baseRevision !== "number" || !Number.isInteger(value.baseRevision) || value.baseRevision < 1) {
    issues.push(issue("stale_base_revision", "baseRevision must be a positive integer.", "$.baseRevision"));
  }

  if (!isRecord(value.project)) {
    issues.push(issue("project_identity_mismatch", "project is required.", "$.project"));
  }

  if (value.client !== null && !isRecord(value.client)) {
    issues.push(issue("client_identity_mismatch", "client must be an object or null.", "$.client"));
  }

  ["members", "phases", "milestones", "tasks", "taskDependencies", "risks", "documents", "metrics"].forEach((key) => (
    requireArray(value, key, issues, "$")
  ));

  return {
    package: issues.some((item) => item.severity === "error") ? null : value as ProjectExportPackage,
    issues
  };
}

export function parseAndValidateProjectUpdateText(text: string): ProjectUpdatePackageValidationResult {
  const parsed = parseProjectUpdateJson(text);

  if (parsed.issues.length > 0) {
    return { package: null, issues: parsed.issues };
  }

  return validateProjectUpdateExportPackage(parsed.value);
}
