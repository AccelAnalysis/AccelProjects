import type { Client, Project, ProjectDocument, ProjectMetric, ProjectRisk, ProjectState, Task } from "../types";
import { stableStringify } from "../imports/projectImportPlanner";

export type ProjectExportPackage = {
  schemaVersion: "1.0";
  packageType: "accelprojects.project.export";
  packageId: string;
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

export function createCanonicalProjectExport(projectState: ProjectState, projectId: string, exportedAt = new Date().toISOString()): ProjectExportPackage {
  const project = projectState.projects.find((item) => item.id === projectId);

  if (!project) {
    throw new Error(`Project ${projectId} is not available for export.`);
  }

  const projectTasks = projectState.tasks.filter((task) => task.projectId === projectId);
  const taskIds = new Set(projectTasks.map((task) => task.id));
  const documents = projectState.documents.filter((document: ProjectDocument) => document.projectId === projectId);
  const metrics = projectState.metrics.filter((metric: ProjectMetric) => metric.projectId === projectId);
  const risks = projectState.risks.filter((risk: ProjectRisk) => risk.projectId === projectId);

  return {
    schemaVersion: "1.0",
    packageType: "accelprojects.project.export",
    packageId: `export-${projectId}-r${project.revision ?? 1}-${exportedAt.replaceAll(/[:.]/g, "-")}`,
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
  const canonical = stableStringify(projectPackage);

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  let hash = 0;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = (Math.imul(31, hash) + canonical.charCodeAt(index)) | 0;
  }

  return `fallback-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
