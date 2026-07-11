import type { Client, Project, ProjectDocument, ProjectMetric, ProjectRisk, ProjectState, Task } from "../types";
import { stableStringify } from "../imports/projectImportPlanner";

export const currentProjectExportSchemaVersion = "1.1" as const;
export const maxProjectSnapshotBytes = 700_000;

export type ProjectExportPackage = {
  schemaVersion: "1.0" | "1.1";
  packageType: "accelprojects.project.export";
  packageId: string;
  exportSnapshotId?: string;
  exportedAt: string;
  baseProjectId: string;
  baseRevision: number;
  client: Client | null;
  project: Project;
  members: ProjectState["projectMembers"];
  phases: ProjectState["phases"];
  milestones: ProjectState["milestones"];
  tasks: ProjectState["tasks"];
  taskDependencies: ProjectState["taskDependencies"];
  risks: ProjectState["risks"];
  documents: ProjectState["documents"];
  metrics: ProjectState["metrics"];
};

function byId<T extends { id: string }>(items: T[]) {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    revision: project.revision ?? 1,
    lastStructuralChangeAt: project.lastStructuralChangeAt ?? project.updatedAt
  };
}

export function createProjectExportSnapshotId() {
  return `export_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function createCanonicalProjectExport(
  projectState: ProjectState,
  projectId: string,
  exportedAt = new Date().toISOString(),
  options: { schemaVersion?: ProjectExportPackage["schemaVersion"]; exportSnapshotId?: string } = {}
): ProjectExportPackage {
  const project = projectState.projects.find((item) => item.id === projectId);
  const schemaVersion = options.schemaVersion ?? currentProjectExportSchemaVersion;

  if (!project) {
    throw new Error(`Project ${projectId} is not available for export.`);
  }

  const projectTasks = projectState.tasks.filter((task) => task.projectId === projectId);
  const taskIds = new Set(projectTasks.map((task) => task.id));
  const documents = projectState.documents.filter((document: ProjectDocument) => document.projectId === projectId);
  const metrics = projectState.metrics.filter((metric: ProjectMetric) => metric.projectId === projectId);
  const risks = projectState.risks.filter((risk: ProjectRisk) => risk.projectId === projectId);

  return {
    schemaVersion,
    packageType: "accelprojects.project.export",
    packageId: `export-${projectId}-r${project.revision ?? 1}-${exportedAt.replaceAll(/[:.]/g, "-")}`,
    ...(schemaVersion === "1.1" ? { exportSnapshotId: options.exportSnapshotId ?? createProjectExportSnapshotId() } : {}),
    exportedAt,
    baseProjectId: projectId,
    baseRevision: project.revision ?? 1,
    client: projectState.clients.find((client) => client.id === project.clientId) ?? null,
    project: normalizeProject(project),
    members: byId(projectState.projectMembers.filter((member) => member.projectId === projectId)),
    phases: byId(projectState.phases.filter((phase) => phase.projectId === projectId)),
    milestones: byId(projectState.milestones.filter((milestone) => milestone.projectId === projectId)),
    tasks: byId(projectTasks as Task[]),
    taskDependencies: byId(projectState.taskDependencies.filter((dependency) => taskIds.has(dependency.taskId) && taskIds.has(dependency.dependsOnTaskId))),
    risks: byId(risks),
    documents: byId(documents),
    metrics: byId(metrics)
  };
}

export function stringifyCanonicalProjectExport(projectPackage: ProjectExportPackage) {
  return `${JSON.stringify(JSON.parse(stableStringify(projectPackage)), null, 2)}\n`;
}

export async function hashProjectExport(projectPackage: ProjectExportPackage) {
  return calculateProjectExportHashFromString(stableStringify(projectPackage));
}

export async function calculateProjectExportHashFromString(canonical: string) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 hashing is not available in this environment.");
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashProjectExportJson(packageJson: string) {
  return calculateProjectExportHashFromString(stableStringify(JSON.parse(packageJson)));
}

export function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function assertProjectSnapshotSize(packageJson: string) {
  if (getUtf8ByteLength(packageJson) > maxProjectSnapshotBytes) {
    throw new Error("project_snapshot_too_large");
  }
}

export function getProjectExportStructuralValue(projectPackage: ProjectExportPackage) {
  const { packageId: _packageId, exportSnapshotId: _exportSnapshotId, exportedAt: _exportedAt, ...structuralPackage } = projectPackage;
  return structuralPackage;
}

export async function hashProjectExportStructuralState(projectPackage: ProjectExportPackage) {
  return calculateProjectExportHashFromString(stableStringify(getProjectExportStructuralValue(projectPackage)));
}

export function getProjectExportHashPreview(projectPackage: ProjectExportPackage) {
  const canonical = stableStringify(projectPackage);
  let hash = 0;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = (Math.imul(31, hash) + canonical.charCodeAt(index)) | 0;
  }

  return `fallback-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
