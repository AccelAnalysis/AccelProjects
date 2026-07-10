import {
  hashProjectExportJson,
  hashProjectExportStructuralState,
  type ProjectExportPackage
} from "../exports/projectExport";
import { stableStringify } from "../imports/projectImportPlanner";
import type { ProjectExportSnapshot, ProjectState } from "../types";
import { parseAndValidateProjectUpdateText } from "./projectUpdateSchema";
import type { ProjectUpdateIssue, ProjectUpdatePackageValidationResult } from "./projectUpdateTypes";

export type ProjectUpdateSourceVerification = {
  uploadedPackage: ProjectExportPackage | null;
  sourceSnapshot: ProjectExportSnapshot | null;
  originalPackage: ProjectExportPackage | null;
  uploadedFileHash: string;
  issues: ProjectUpdateIssue[];
};

function issue(code: ProjectUpdateIssue["code"], message: string, path = "$"): ProjectUpdateIssue {
  return { severity: "error", code, message, path };
}

function parseSnapshotPackage(snapshot: ProjectExportSnapshot): ProjectUpdatePackageValidationResult {
  try {
    return parseAndValidateProjectUpdateText(snapshot.packageJson);
  } catch {
    return { package: null, issues: [issue("source_snapshot_hash_mismatch", "The stored source snapshot cannot be parsed.")] };
  }
}

function findSnapshot(projectId: string, uploadedPackage: ProjectExportPackage, snapshots: ProjectExportSnapshot[], issues: ProjectUpdateIssue[]) {
  const projectSnapshots = snapshots.filter((snapshot) => snapshot.projectId === projectId);

  if (uploadedPackage.schemaVersion === "1.1") {
    const snapshot = projectSnapshots.find((item) => item.id === uploadedPackage.exportSnapshotId);

    if (!snapshot) {
      issues.push(issue("unknown_export_snapshot", "No trusted export snapshot exists for this update file.", "$.exportSnapshotId"));
    }

    return snapshot ?? null;
  }

  const matches = projectSnapshots.filter((item) => item.packageId === uploadedPackage.packageId);

  if (matches.length === 0) {
    issues.push(issue("unknown_export_snapshot", "No trusted legacy export snapshot exists for this package ID.", "$.packageId"));
    return null;
  }

  if (matches.length > 1) {
    issues.push(issue("duplicate_export_snapshot", "Multiple export snapshots match this legacy package ID.", "$.packageId"));
    return null;
  }

  return matches[0];
}

export async function verifyProjectUpdateSource({
  projectId,
  rawText,
  snapshots,
  currentState
}: {
  projectId: string;
  rawText: string;
  snapshots: ProjectExportSnapshot[];
  currentState: ProjectState;
}): Promise<ProjectUpdateSourceVerification> {
  const parsed = parseAndValidateProjectUpdateText(rawText);
  const issues = [...parsed.issues];
  const uploadedFileHash = parsed.package ? await hashProjectExportJson(rawText) : "";
  const uploadedPackage = parsed.package;

  if (!uploadedPackage) {
    return { uploadedPackage: null, sourceSnapshot: null, originalPackage: null, uploadedFileHash, issues };
  }

  if (uploadedPackage.baseProjectId !== projectId || uploadedPackage.project.id !== projectId) {
    issues.push(issue("project_identity_mismatch", "The update file belongs to a different project.", "$.baseProjectId"));
  }

  const currentProject = currentState.projects.find((project) => project.id === projectId);

  if (currentProject && currentProject.revision !== uploadedPackage.baseRevision) {
    issues.push(issue("stale_base_revision", "This update file is based on an older project revision.", "$.baseRevision"));
  }

  const sourceSnapshot = findSnapshot(projectId, uploadedPackage, snapshots, issues);

  if (!sourceSnapshot) {
    return { uploadedPackage, sourceSnapshot: null, originalPackage: null, uploadedFileHash, issues };
  }

  const storedSnapshotHash = await hashProjectExportJson(sourceSnapshot.packageJson);

  if (storedSnapshotHash !== sourceSnapshot.sourceHash) {
    issues.push(issue("source_snapshot_hash_mismatch", "The stored export snapshot hash no longer verifies."));
  }

  const snapshotParsed = parseSnapshotPackage(sourceSnapshot);
  issues.push(...snapshotParsed.issues);
  const originalPackage = snapshotParsed.package;

  if (!originalPackage) {
    return { uploadedPackage, sourceSnapshot, originalPackage: null, uploadedFileHash, issues };
  }

  if (
    sourceSnapshot.packageId !== originalPackage.packageId
    || sourceSnapshot.baseRevision !== originalPackage.baseRevision
    || sourceSnapshot.projectId !== projectId
    || originalPackage.baseProjectId !== projectId
  ) {
    issues.push(issue("project_identity_mismatch", "The export snapshot does not match the selected project."));
  }

  const currentComparablePackage = createComparableCurrentPackage(currentState, projectId, originalPackage);
  const originalStructuralHash = await hashProjectExportStructuralState(originalPackage);
  const currentStructuralHash = await hashProjectExportStructuralState(currentComparablePackage);

  if (originalStructuralHash !== currentStructuralHash) {
    issues.push(issue("stale_base_revision", "The current project no longer matches the selected export snapshot."));
  }

  if (stableStringify(uploadedPackage) === stableStringify(originalPackage)) {
    issues.push({ severity: "warning", code: "no_project_changes", message: "This file matches the current project. No update is required." });
  }

  return { uploadedPackage, sourceSnapshot, originalPackage, uploadedFileHash, issues };
}

function createComparableCurrentPackage(projectState: ProjectState, projectId: string, originalPackage: ProjectExportPackage): ProjectExportPackage {
  const currentProject = projectState.projects.find((project) => project.id === projectId);

  if (!currentProject) {
    return originalPackage;
  }

  return {
    ...originalPackage,
    client: projectState.clients.find((client) => client.id === currentProject.clientId) ?? null,
    project: currentProject,
    members: projectState.projectMembers.filter((member) => member.projectId === projectId).sort((left, right) => left.id.localeCompare(right.id)),
    phases: projectState.phases.filter((phase) => phase.projectId === projectId).sort((left, right) => left.id.localeCompare(right.id)),
    milestones: projectState.milestones.filter((milestone) => milestone.projectId === projectId).sort((left, right) => left.id.localeCompare(right.id)),
    tasks: projectState.tasks.filter((task) => task.projectId === projectId).sort((left, right) => left.id.localeCompare(right.id)),
    taskDependencies: projectState.taskDependencies.filter((dependency) => (
      projectState.tasks.some((task) => task.projectId === projectId && task.id === dependency.taskId)
    )).sort((left, right) => left.id.localeCompare(right.id)),
    risks: projectState.risks.filter((risk) => risk.projectId === projectId).sort((left, right) => left.id.localeCompare(right.id)),
    documents: projectState.documents.filter((document) => document.projectId === projectId).sort((left, right) => left.id.localeCompare(right.id)),
    metrics: projectState.metrics.filter((metric) => metric.projectId === projectId).sort((left, right) => left.id.localeCompare(right.id))
  };
}
