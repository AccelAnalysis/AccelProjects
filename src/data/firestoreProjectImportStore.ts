import type { User as FirebaseUser } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference
} from "firebase/firestore";
import { auth, db } from "../firebase";
import type {
  Client,
  Milestone,
  Phase,
  Project,
  ProjectActivityEvent,
  ProjectDocument,
  ProjectMember,
  ProjectMetric,
  ProjectRisk,
  ProjectState,
  ProjectVersion,
  Task,
  TaskDependency,
  User
} from "../types";
import { FIRESTORE_ORGANIZATION_ID, ensureFirestoreUserProfile, loadCurrentUserProfileFromFirestore } from "./firestoreProjectStore";
import { createProjectImportPlan, createProjectImportSourceHash } from "../imports/projectImportPlanner";
import { validateProjectImportSemantics } from "../imports/projectImportValidator";
import { normalizePhaseSortOrder } from "../utils/phaseOrdering";
import type {
  ExistingImportManifestSummary,
  PersonResolution,
  ProjectImportDuplicateCheck,
  ProjectImportManifest,
  ProjectImportPackage,
  ProjectImportPlan,
  ProjectImportResult,
  ProjectImportOverrides
} from "../imports/projectImportTypes";

const importCollectionName = "imports";
const rootCollectionMap = {
  users: "users",
  clients: "clients",
  projects: "projects"
};
const projectCollectionMap = {
  projectMembers: "members",
  phases: "phases",
  milestones: "milestones",
  tasks: "tasks",
  taskDependencies: "taskDependencies",
  risks: "risks",
  documents: "documents",
  metrics: "metrics",
  activityEvents: "activityEvents",
  projectVersions: "versions"
};
const maxBatchWrites = 450;
type FirestorePath = [string, ...string[]];

type WriteOperation = {
  ref: DocumentReference<DocumentData>;
  value: Record<string, unknown>;
};

function requireDb() {
  if (!db) {
    throw new Error("Firebase is not configured. Add the VITE_FIREBASE_* environment values and restart Vite.");
  }

  return db;
}

function requireCurrentUser() {
  if (!auth?.currentUser) {
    throw new Error("You must be signed in to import projects.");
  }

  return auth.currentUser;
}

function requirePathSegment(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing Firestore path segment: ${label}`);
  }

  return value;
}

function validatePathSegments(pathSegments: unknown[]): FirestorePath {
  const segments = pathSegments.map((segment, index) => requirePathSegment(segment, `path[${index}]`));

  if (segments.length === 0) {
    throw new Error("Missing Firestore path.");
  }

  return [segments[0], ...segments.slice(1)];
}

function organizationPath(): FirestorePath {
  return validatePathSegments(["organizations", FIRESTORE_ORGANIZATION_ID]);
}

function projectPath(projectId: string): FirestorePath {
  return validatePathSegments([...organizationPath(), rootCollectionMap.projects, requirePathSegment(projectId, "projectId")]);
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function getImportManifestRef(importId: string) {
  return doc(requireDb(), ...organizationPath(), importCollectionName, requirePathSegment(importId, "importId"));
}

function getImportManifestCollection() {
  return collection(requireDb(), ...organizationPath(), importCollectionName);
}

function getSelectedUserIds(plan: ProjectImportPlan) {
  return new Set(plan.personResolutions.map((person) => person.selectedUserId).filter((userId): userId is string => Boolean(userId)));
}

function findUserById(users: User[], userId: string | null) {
  return userId ? users.find((user) => user.id === userId) : undefined;
}

function findBlockingManifest(manifests: ProjectImportManifest[], packageId: string, sourceHash: string): ProjectImportManifest | undefined {
  return manifests.find((manifest) => (
    (manifest.packageId === packageId || manifest.sourceHash === sourceHash)
    && (manifest.status === "processing" || manifest.status === "completed")
  ));
}

function manifestSummary(manifest: ProjectImportManifest, projectState?: ProjectState): ExistingImportManifestSummary {
  const project = projectState?.projects.find((item) => item.id === manifest.projectId);

  return {
    id: manifest.id,
    packageId: manifest.packageId,
    sourceHash: manifest.sourceHash,
    projectId: manifest.projectId,
    projectName: project?.name ?? manifest.projectId,
    status: manifest.status,
    createdAt: manifest.createdAt
  };
}

async function commitChunkedWrites(writes: WriteOperation[]) {
  for (let index = 0; index < writes.length; index += maxBatchWrites) {
    const batch = writeBatch(requireDb());
    writes.slice(index, index + maxBatchWrites).forEach((operation) => {
      batch.set(operation.ref, operation.value);
    });
    await batch.commit();
  }
}

function collectWarnings(projectPackage: ProjectImportPackage, plan: ProjectImportPlan) {
  return [
    ...projectPackage.assumptions.map((assumption) => `Assumption: ${assumption}`),
    ...projectPackage.warnings.map((warning) => `Package warning: ${warning}`),
    ...plan.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message)
  ];
}

export function hasDuplicateProjectImport(manifests: ProjectImportManifest[], packageId: string, sourceHash: string) {
  return Boolean(findBlockingManifest(manifests, packageId, sourceHash));
}

export async function checkProjectImportDuplicate(
  projectPackage: ProjectImportPackage,
  sourceHash: string,
  projectState?: ProjectState
): Promise<ProjectImportDuplicateCheck> {
  const importsRef = getImportManifestCollection();
  const [packageSnapshot, hashSnapshot] = await Promise.all([
    getDocs(query(importsRef, where("packageId", "==", projectPackage.packageId))),
    getDocs(query(importsRef, where("sourceHash", "==", sourceHash)))
  ]);
  const manifests = [...packageSnapshot.docs, ...hashSnapshot.docs].map((snapshot) => snapshot.data() as ProjectImportManifest);
  const blockingManifest = findBlockingManifest(manifests, projectPackage.packageId, sourceHash);

  return {
    duplicate: Boolean(blockingManifest),
    existingManifest: blockingManifest ? manifestSummary(blockingManifest, projectState) : null
  };
}

async function requireImportPermission(user: FirebaseUser) {
  await ensureFirestoreUserProfile(user);
  const profile = await loadCurrentUserProfileFromFirestore(user);

  if (profile.role !== "admin" && profile.role !== "project_manager") {
    throw new Error("Your Firestore profile role does not allow importing projects.");
  }

  return profile;
}

export async function importProjectPackageToFirestore({
  projectPackage,
  projectState,
  overrides
}: {
  projectPackage: ProjectImportPackage;
  projectState: ProjectState;
  overrides: ProjectImportOverrides;
}): Promise<ProjectImportResult> {
  const currentUser = requireCurrentUser();
  const profile = await requireImportPermission(currentUser);
  const semanticIssues = validateProjectImportSemantics(projectPackage);

  if (semanticIssues.some((issue) => issue.severity === "error")) {
    throw new Error("Import package has validation errors. Revalidate the package before importing.");
  }

  const sourceHash = await createProjectImportSourceHash(projectPackage);
  const duplicateCheck = await checkProjectImportDuplicate(projectPackage, sourceHash, projectState);

  if (duplicateCheck.duplicate) {
    throw new Error(`This package was already imported or is processing for project ${duplicateCheck.existingManifest?.projectName ?? duplicateCheck.existingManifest?.projectId ?? "unknown"}.`);
  }

  const plan = createProjectImportPlan(projectPackage, projectState, overrides);

  if (plan.mode !== "create") {
    throw new Error("Only create-mode project imports are supported.");
  }

  if (plan.issues.some((issue) => issue.severity === "error")) {
    throw new Error("Resolve the project owner and fatal import issues before importing.");
  }

  const now = new Date().toISOString();
  const importId = createId("import");
  const clientId = plan.clientResolution.action === "create"
    ? createId("client")
    : requirePathSegment(plan.clientResolution.selectedClientId, "selectedClientId");
  const projectId = createId("project");
  const projectOwnerId = requirePathSegment(plan.projectOwnerUserId, "projectOwnerUserId");
  const phaseIds = Object.fromEntries(projectPackage.phases.map((phase) => [phase.key, createId("phase")]));
  const milestoneIds = Object.fromEntries(projectPackage.milestones.map((milestone) => [milestone.key, createId("milestone")]));
  const taskIds = Object.fromEntries(projectPackage.tasks.map((task) => [task.key, createId("task")]));
  const riskIds = Object.fromEntries(projectPackage.risks.map((risk) => [risk.key, createId("risk")]));
  const documentIds = Object.fromEntries(projectPackage.documents.map((document) => [document.key, createId("doc")]));
  const metricIds = Object.fromEntries(projectPackage.metrics.map((metric) => [metric.key, createId("metric")]));
  const personUserIds = Object.fromEntries(plan.personResolutions.map((person) => [person.alias, person.selectedUserId]));
  const warnings = collectWarnings(projectPackage, plan);
  const manifest: ProjectImportManifest = {
    id: importId,
    organizationId: FIRESTORE_ORGANIZATION_ID,
    packageId: projectPackage.packageId,
    packageType: projectPackage.packageType,
    schemaVersion: projectPackage.schemaVersion,
    projectId,
    clientId,
    mode: "create",
    sourceHash,
    projectRevision: 1,
    status: "processing",
    createdBy: profile.id,
    createdAt: now,
    completedAt: null,
    entityMap: {
      clientExternalKey: projectPackage.client.externalKey,
      projectExternalKey: projectPackage.project.externalKey,
      phaseIds,
      milestoneIds,
      taskIds,
      riskIds,
      documentIds,
      metricIds,
      personUserIds
    },
    counts: plan.proposedCounts,
    warnings,
    errorMessage: ""
  };
  const writes: WriteOperation[] = [];
  const personResolutionByAlias = new Map(plan.personResolutions.map((person) => [person.alias, person]));
  const selectedUserIds = getSelectedUserIds(plan);
  const unresolvedPeople = plan.personResolutions.filter((person) => !person.selectedUserId);
  const unassignedTaskCount = projectPackage.tasks.filter((task) => !task.assigneeAlias || !personResolutionByAlias.get(task.assigneeAlias)?.selectedUserId).length;
  const importedClientName = plan.clientResolution.action === "create"
    ? projectPackage.client.name
    : projectState.clients.find((client) => client.id === clientId)?.name ?? plan.clientResolution.clientName;

  if (plan.clientResolution.action === "create") {
    const client: Client = {
      id: clientId,
      organizationId: FIRESTORE_ORGANIZATION_ID,
      name: projectPackage.client.name,
      contactName: projectPackage.client.contactName,
      email: projectPackage.client.email,
      phone: projectPackage.client.phone,
      status: projectPackage.client.status
    };
    writes.push({ ref: doc(requireDb(), ...organizationPath(), rootCollectionMap.clients, clientId), value: client });
  }

  const project: Project = {
    id: projectId,
    organizationId: FIRESTORE_ORGANIZATION_ID,
    clientId,
    name: projectPackage.project.name,
    summary: projectPackage.project.summary,
    status: projectPackage.project.status,
    health: projectPackage.project.health,
    priority: projectPackage.project.priority,
    startDate: projectPackage.project.startDate,
    targetDate: projectPackage.project.targetDate,
    budget: projectPackage.project.budget,
    currency: projectPackage.project.currency,
    ownerId: projectOwnerId,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    lastStructuralChangeAt: now
  };
  writes.push({ ref: doc(requireDb(), ...organizationPath(), rootCollectionMap.projects, projectId), value: project });

  selectedUserIds.forEach((userId) => {
    const resolution = plan.personResolutions.find((person) => person.selectedUserId === userId);
    const member: ProjectMember = {
      id: createId("member"),
      projectId,
      userId,
      role: resolution?.projectRole ?? "contributor"
    };
    writes.push({ ref: doc(requireDb(), ...projectPath(projectId), projectCollectionMap.projectMembers, userId), value: member });
  });

  const normalizedImportPhases = normalizePhaseSortOrder(projectPackage.phases.map((phase) => ({
    id: requirePathSegment(phaseIds[phase.key], "phaseId"),
    projectId,
    name: phase.name,
    status: phase.status,
    startDate: phase.startDate,
    endDate: phase.endDate,
    sortOrder: phase.sortOrder
  } satisfies Phase)));

  normalizedImportPhases.forEach((phase) => {
    const value: Phase = {
      id: phase.id,
      projectId: phase.projectId,
      name: phase.name,
      status: phase.status,
      startDate: phase.startDate,
      endDate: phase.endDate,
      sortOrder: phase.sortOrder
    };
    writes.push({ ref: doc(requireDb(), ...projectPath(projectId), projectCollectionMap.phases, value.id), value });
  });

  projectPackage.milestones.forEach((milestone) => {
    const value: Milestone = {
      id: requirePathSegment(milestoneIds[milestone.key], "milestoneId"),
      projectId,
      name: milestone.name,
      date: milestone.date,
      status: milestone.status
    };
    writes.push({ ref: doc(requireDb(), ...projectPath(projectId), projectCollectionMap.milestones, value.id), value });
  });

  projectPackage.tasks.forEach((task) => {
    const assigneeResolution = task.assigneeAlias ? personResolutionByAlias.get(task.assigneeAlias) : undefined;
    const value: Task = {
      id: requirePathSegment(taskIds[task.key], "taskId"),
      projectId,
      phaseId: requirePathSegment(phaseIds[task.phaseKey], `phaseId for ${task.phaseKey}`),
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigneeId: assigneeResolution?.selectedUserId ?? null,
      startDate: task.startDate,
      dueDate: task.dueDate,
      estimateHours: task.estimateHours,
      completedAt: task.status === "done" ? now : null
    };
    writes.push({ ref: doc(requireDb(), ...projectPath(projectId), projectCollectionMap.tasks, value.id), value });
  });

  projectPackage.tasks.forEach((task) => {
    task.dependencies.forEach((dependency) => {
      const dependencyRecord: TaskDependency = {
        id: createId("dependency"),
        taskId: requirePathSegment(taskIds[task.key], "dependency.taskId"),
        dependsOnTaskId: requirePathSegment(taskIds[dependency.dependsOnTaskKey], "dependency.dependsOnTaskId"),
        type: dependency.type
      };
      writes.push({ ref: doc(requireDb(), ...projectPath(projectId), projectCollectionMap.taskDependencies, dependencyRecord.id), value: dependencyRecord });
    });
  });

  projectPackage.risks.forEach((risk) => {
    const value: ProjectRisk = {
      id: requirePathSegment(riskIds[risk.key], "riskId"),
      projectId,
      title: risk.title,
      severity: risk.severity,
      probability: risk.probability,
      status: risk.status,
      mitigationPlan: risk.mitigationPlan
    };
    writes.push({ ref: doc(requireDb(), ...projectPath(projectId), projectCollectionMap.risks, value.id), value });
  });

  projectPackage.documents.forEach((document) => {
    const ownerResolution = document.ownerAlias ? personResolutionByAlias.get(document.ownerAlias) : undefined;
    const value: ProjectDocument = {
      id: requirePathSegment(documentIds[document.key], "documentId"),
      projectId,
      title: document.title,
      type: document.type,
      url: document.url,
      ownerId: ownerResolution?.selectedUserId ?? projectOwnerId,
      createdAt: now
    };
    writes.push({ ref: doc(requireDb(), ...projectPath(projectId), projectCollectionMap.documents, value.id), value });
  });

  projectPackage.metrics.forEach((metric) => {
    const value: ProjectMetric = {
      id: requirePathSegment(metricIds[metric.key], "metricId"),
      projectId,
      label: metric.label,
      value: metric.value,
      suffix: metric.suffix,
      tone: metric.tone
    };
    writes.push({ ref: doc(requireDb(), ...projectPath(projectId), projectCollectionMap.metrics, value.id), value });
  });

  const event: ProjectActivityEvent = {
    id: createId("event"),
    projectId,
    actorId: profile.id,
    type: "project_import_completed",
    message: `Imported project package ${projectPackage.packageId}.`,
    metadata: {
      packageId: projectPackage.packageId,
      sourceHash,
      sourceName: projectPackage.source.name
    },
    createdAt: now
  };
  writes.push({ ref: doc(requireDb(), ...projectPath(projectId), projectCollectionMap.activityEvents, event.id), value: event });

  const version: ProjectVersion = {
    id: createId("version"),
    projectId,
    revision: 1,
    previousRevision: 0,
    changeType: "project_imported",
    summary: `Imported project package ${projectPackage.packageId}.`,
    actorId: profile.id,
    metadata: {
      packageId: projectPackage.packageId,
      sourceHash,
      sourceName: projectPackage.source.name
    },
    createdAt: now
  };
  writes.push({ ref: doc(requireDb(), ...projectPath(projectId), projectCollectionMap.projectVersions, version.id), value: version });

  await setDoc(getImportManifestRef(importId), manifest);

  try {
    await commitChunkedWrites(writes);
    const completedManifest: ProjectImportManifest = {
      ...manifest,
      status: "completed",
      completedAt: new Date().toISOString()
    };
    await updateDoc(getImportManifestRef(importId), {
      status: completedManifest.status,
      completedAt: completedManifest.completedAt
    });

    return {
      manifest: completedManifest,
      projectId,
      projectName: projectPackage.project.name,
      clientId,
      clientName: importedClientName,
      counts: plan.proposedCounts,
      unresolvedPeople,
      unassignedTaskCount,
      warnings
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Firestore import failure.";
    await updateDoc(getImportManifestRef(importId), {
      status: "failed",
      completedAt: new Date().toISOString(),
      errorMessage: `Import failed after creating manifest ${importId}; partial project ${projectId} may exist. ${errorMessage}`
    });
    throw new Error(`Import failed after creating partial project ${projectId}. ${errorMessage}`);
  }
}
