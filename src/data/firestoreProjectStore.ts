import type { User as FirebaseUser } from "firebase/auth";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Transaction
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { initialProjectState, mockOrganization } from "./projectMockData";
import { validateDependencies } from "../scheduling/dependencyGraph";
import {
  assertProjectSnapshotSize,
  hashProjectExportJson,
  stringifyCanonicalProjectExport,
  type ProjectExportPackage
} from "../exports/projectExport";
import type { ProjectUpdatePlan } from "../updates/projectUpdateTypes";
import type {
  Client,
  ClientProgressReport,
  ClientReportArtifact,
  ClientReportSnapshot,
  Milestone,
  Phase,
  Project,
  ProjectActivityEvent,
  ProjectCalendarEvent,
  ProjectCommunication,
  ProjectDocument,
  ProjectExportSnapshot,
  ProjectMember,
  ProjectMetric,
  ProjectRisk,
  ProjectState,
  ProjectUpdateManifest,
  ProjectVersion,
  Task,
  TaskComment,
  TaskDependency,
  User
} from "../types";

export const FIRESTORE_ORGANIZATION_ID = "org_accel_projects";

type CollectionKey = keyof ProjectState;
type ProjectScopedCollectionKey = "projectMembers" | "phases" | "milestones" | "tasks" | "taskDependencies" | "risks" | "documents" | "metrics" | "activityEvents" | "projectCommunications" | "projectCalendarEvents" | "clientProgressReports" | "projectVersions" | "projectExportSnapshots" | "projectUpdateManifests";
type FirestorePath = [string, ...string[]];

const rootCollectionMap = {
  users: "users",
  clients: "clients",
  projects: "projects"
} satisfies Partial<Record<CollectionKey, string>>;

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
  projectCommunications: "communications",
  projectCalendarEvents: "calendarEvents",
  clientProgressReports: "reports",
  projectVersions: "versions",
  projectExportSnapshots: "exportSnapshots",
  projectUpdateManifests: "updateManifests"
} satisfies Record<ProjectScopedCollectionKey, string>;

function requireDb() {
  if (!db) {
    throw new Error("Firebase is not configured. Add the VITE_FIREBASE_* environment values and restart Vite.");
  }

  return db;
}

function requirePathSegment(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing Firestore path segment: ${label}`);
  }

  return value;
}

function requireRecordId(record: { id?: string }, label: string): string {
  return requirePathSegment(record.id, `${label}.id`);
}

function validatePathSegments(pathSegments: unknown[]): FirestorePath {
  const segments = pathSegments.map((segment, index) => requirePathSegment(segment, `path[${index}]`));

  if (segments.length === 0) {
    throw new Error("Missing Firestore path.");
  }

  return [segments[0], ...segments.slice(1)];
}

function organizationPath(): FirestorePath {
  return validatePathSegments([
    requirePathSegment("organizations", "organizations collection"),
    requirePathSegment(FIRESTORE_ORGANIZATION_ID, "organizationId")
  ]);
}

function projectPath(projectId: string): FirestorePath {
  return validatePathSegments([
    ...organizationPath(),
    requirePathSegment("projects", "projects collection"),
    requirePathSegment(projectId, "projectId")
  ]);
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function createProjectUpdateEntityId(prefix: string) {
  return createId(prefix);
}

type ProjectMutationChange = Pick<ProjectVersion, "changeType" | "summary" | "metadata">;

function withProjectRevisionDefaults(project: Project): Project {
  return {
    ...project,
    revision: project.revision ?? 1,
    lastStructuralChangeAt: project.lastStructuralChangeAt ?? project.updatedAt
  };
}

async function commitProjectMutation<T>(
  projectId: string,
  change: ProjectMutationChange,
  write: (transaction: Transaction, database: Firestore) => T | Promise<T>
): Promise<{ result: T; version: ProjectVersion; projectPatch: Pick<Project, "revision" | "updatedAt" | "lastStructuralChangeAt"> }> {
  const safeProjectId = requirePathSegment(projectId, "projectId");
  const database = requireDb();
  const actor = requireCurrentUser();
  const projectRef = doc(database, ...projectPath(safeProjectId));

  return runTransaction(database, async (transaction) => {
    const projectSnapshot = await transaction.get(projectRef);

    if (!projectSnapshot.exists()) {
      throw new Error(`Project ${safeProjectId} was not found in Firestore.`);
    }

    const project = projectSnapshot.data() as Project;
    const previousRevision = project.revision ?? 0;
    const revision = previousRevision + 1;
    const now = new Date().toISOString();
    const version: ProjectVersion = {
      id: createId("version"),
      projectId: safeProjectId,
      revision,
      previousRevision,
      changeType: change.changeType,
      summary: change.summary,
      actorId: actor.uid,
      metadata: change.metadata,
      createdAt: now
    };
    const projectPatch = {
      revision,
      updatedAt: now,
      lastStructuralChangeAt: now
    };
    const result = await write(transaction, database);

    transaction.update(projectRef, projectPatch);
    transaction.set(doc(database, ...projectPath(safeProjectId), projectCollectionMap.projectVersions, version.id), version);

    return { result, version, projectPatch };
  });
}

function requireCurrentUser() {
  if (!auth?.currentUser) {
    throw new Error("You must be signed in to use Firestore project data.");
  }

  return auth.currentUser;
}

function getFatalDependencyValidationMessage(tasks: Task[], dependencies: TaskDependency[]) {
  return validateDependencies(tasks, dependencies)
    .filter((issue) => issue.severity === "fatal")
    .map((issue) => issue.message)
    .join(" ");
}

function getDisplayName(user: FirebaseUser) {
  return user.displayName || user.email?.split("@")[0] || "AccelProjects User";
}

function getInitials(name: string, email: string) {
  const source = name || email || "AP";
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AP";
}

export function getFirestorePermissionMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.toLowerCase().includes("permission")
    || message.toLowerCase().includes("missing or insufficient permissions")
  ) {
    return "Firestore permissions blocked this action. Confirm Firestore rules have been deployed for accelprojects.";
  }

  return error instanceof Error ? error.message : "Unable to complete the Firestore action.";
}

function defaultNotificationPreferences() {
  return {
    taskAssignments: true,
    dueDates: true,
    risks: true,
    projectMessages: false,
    emailDelivery: false
  };
}

export async function ensureFirestoreUserProfile(user: FirebaseUser) {
  const database = requireDb();
  const now = new Date().toISOString();
  const userId = requirePathSegment(user.uid, "auth.uid");
  const orgRef = doc(database, ...organizationPath());
  const userRef = doc(database, ...organizationPath(), rootCollectionMap.users, userId);
  const organization = await getDoc(orgRef);
  const existingUser = await getDoc(userRef);
  const name = getDisplayName(user);
  const email = user.email ?? "";

  if (!organization.exists()) {
    await setDoc(orgRef, mockOrganization);
  }

  if (!existingUser.exists()) {
    await setDoc(userRef, {
      id: userId,
      organizationId: FIRESTORE_ORGANIZATION_ID,
      name,
      email,
      role: "viewer",
      avatarInitials: getInitials(name, email),
      createdAt: now,
      updatedAt: now,
      notificationPreferences: defaultNotificationPreferences()
    } satisfies User);
    return;
  }

  const existing = existingUser.data() as User;
  await updateDoc(userRef, {
    name: existing.name || name,
    avatarInitials: existing.avatarInitials || getInitials(existing.name || name, existing.email || email),
    notificationPreferences: existing.notificationPreferences ?? defaultNotificationPreferences(),
    updatedAt: now
  });
}

export async function loadCurrentUserProfileFromFirestore(user: FirebaseUser, options: { ensureProfile?: boolean } = {}) {
  if (options.ensureProfile ?? true) {
    await ensureFirestoreUserProfile(user);
  }

  const userId = requirePathSegment(user.uid, "auth.uid");
  const userRef = doc(requireDb(), ...organizationPath(), rootCollectionMap.users, userId);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    throw new Error(`User profile was not found at organizations/${FIRESTORE_ORGANIZATION_ID}/users/${userId}.`);
  }

  return snapshot.data() as User;
}

export async function updateOwnUserProfileInFirestore(updates: Pick<Partial<User>, "name" | "avatarInitials" | "notificationPreferences">) {
  const currentUser = requireCurrentUser();
  const userId = requirePathSegment(currentUser.uid, "auth.uid");
  const existing = await loadCurrentUserProfileFromFirestore(currentUser, { ensureProfile: false });
  const patch: Pick<User, "name" | "avatarInitials" | "updatedAt"> & { notificationPreferences?: User["notificationPreferences"] } = {
    name: updates.name?.trim() || existing.name,
    avatarInitials: updates.avatarInitials?.trim().slice(0, 4).toUpperCase() || getInitials(updates.name ?? existing.name, existing.email),
    updatedAt: new Date().toISOString()
  };

  if (updates.notificationPreferences) {
    patch.notificationPreferences = updates.notificationPreferences;
  }

  await updateDoc(doc(requireDb(), ...organizationPath(), rootCollectionMap.users, userId), patch);
  return {
    ...existing,
    ...patch
  };
}

async function readCollection<T extends { id: string }>(pathSegments: string[]) {
  const snapshot = await getDocs(query(collection(requireDb(), ...validatePathSegments(pathSegments))));
  return snapshot.docs.map((item) => item.data() as T);
}

async function readAuthorizedProjects(user: FirebaseUser, profile: User) {
  if (profile.role === "admin") {
    return (await readCollection<Project>([...organizationPath(), rootCollectionMap.projects])).map(withProjectRevisionDefaults);
  }

  if (profile.role === "client") {
    return [];
  }

  const database = requireDb();
  const projectsById = new Map<string, Project>();
  const ownerProjects = profile.role === "project_manager"
    ? await getDocs(query(collection(database, ...organizationPath(), rootCollectionMap.projects), where("ownerId", "==", user.uid)))
    : null;
  const memberDocuments = await getDocs(query(collectionGroup(database, "members"), where("userId", "==", user.uid)));

  ownerProjects?.docs.forEach((item) => {
    projectsById.set(item.id, withProjectRevisionDefaults(item.data() as Project));
  });

  await Promise.all(memberDocuments.docs.map(async (memberDocument) => {
    const projectRef = memberDocument.ref.parent.parent;

    if (!projectRef || projectsById.has(projectRef.id)) {
      return;
    }

    const projectSnapshot = await getDoc(projectRef);

    if (projectSnapshot.exists()) {
      projectsById.set(projectSnapshot.id, withProjectRevisionDefaults(projectSnapshot.data() as Project));
    }
  }));

  return [...projectsById.values()].sort((left, right) => left.name.localeCompare(right.name));
}

async function readProjectCollections<T extends { id: string }>(
  projects: Project[],
  collectionName: string
) {
  const values = await Promise.all(
    projects.map((project) => readCollection<T>([...projectPath(project.id), collectionName]))
  );

  return values.flat();
}

async function writeDocument(pathSegments: string[], value: { id: string }) {
  await setDoc(doc(requireDb(), ...validatePathSegments(pathSegments), requireRecordId(value, "document")), value);
}

async function deleteCollection(pathSegments: string[]) {
  const snapshot = await getDocs(collection(requireDb(), ...validatePathSegments(pathSegments)));
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
}

export async function loadProjectStateFromFirestore(_user: FirebaseUser, options: { ensureProfile?: boolean } = {}): Promise<ProjectState> {
  if (options.ensureProfile ?? true) {
    await ensureFirestoreUserProfile(_user);
  }

  const profile = await loadCurrentUserProfileFromFirestore(_user, { ensureProfile: false });

  if (profile.role === "client") {
    return {
      users: [profile],
      clients: [],
      projects: [],
      projectMembers: [],
      phases: [],
      milestones: [],
      tasks: [],
      taskDependencies: [],
      taskComments: [],
      risks: [],
      documents: [],
      metrics: [],
      activityEvents: [],
      projectCommunications: [],
      projectCalendarEvents: [],
      clientProgressReports: [],
      clientReportSnapshots: [],
      clientReportArtifacts: [],
      projectVersions: []
    };
  }

  const users = await readCollection<User>([...organizationPath(), rootCollectionMap.users]);
  const clients = await readCollection<Client>([...organizationPath(), rootCollectionMap.clients]);
  const projects = await readAuthorizedProjects(_user, profile);

  const [
    projectMembers,
    phases,
    milestones,
    tasks,
    taskDependencies,
    risks,
    documents,
    metrics,
    activityEvents,
    projectCommunications,
    projectCalendarEvents,
    clientProgressReports,
    clientReportSnapshotsByProject,
    clientReportArtifactsByProject,
    projectVersions,
    taskCommentsByProject
  ] = await Promise.all([
    readProjectCollections<ProjectMember>(projects, projectCollectionMap.projectMembers),
    readProjectCollections<Phase>(projects, projectCollectionMap.phases),
    readProjectCollections<Milestone>(projects, projectCollectionMap.milestones),
    readProjectCollections<Task>(projects, projectCollectionMap.tasks),
    readProjectCollections<TaskDependency>(projects, projectCollectionMap.taskDependencies),
    readProjectCollections<ProjectRisk>(projects, projectCollectionMap.risks),
    readProjectCollections<ProjectDocument>(projects, projectCollectionMap.documents),
    readProjectCollections<ProjectMetric>(projects, projectCollectionMap.metrics),
    readProjectCollections<ProjectActivityEvent>(projects, projectCollectionMap.activityEvents),
    readProjectCollections<ProjectCommunication>(projects, projectCollectionMap.projectCommunications),
    readProjectCollections<ProjectCalendarEvent>(projects, projectCollectionMap.projectCalendarEvents),
    readProjectCollections<ClientProgressReport>(projects, projectCollectionMap.clientProgressReports),
    Promise.all(projects.map(async (project) => {
      const reports = await readCollection<ClientProgressReport>([...projectPath(project.id), projectCollectionMap.clientProgressReports]);
      const snapshots = await Promise.all(
        reports.map((report) => readCollection<ClientReportSnapshot>([...projectPath(project.id), projectCollectionMap.clientProgressReports, report.id, "snapshots"]))
      );

      return snapshots.flat();
    })),
    Promise.all(projects.map(async (project) => {
      const reports = await readCollection<ClientProgressReport>([...projectPath(project.id), projectCollectionMap.clientProgressReports]);
      const artifacts = await Promise.all(
        reports.map((report) => readCollection<ClientReportArtifact>([...projectPath(project.id), projectCollectionMap.clientProgressReports, report.id, "artifacts"]))
      );

      return artifacts.flat();
    })),
    readProjectCollections<ProjectVersion>(projects, projectCollectionMap.projectVersions),
    Promise.all(projects.map(async (project) => {
      const projectTasks = await readCollection<Task>([...projectPath(project.id), projectCollectionMap.tasks]);
      const comments = await Promise.all(
        projectTasks.map((task) => readCollection<TaskComment>([...projectPath(project.id), projectCollectionMap.tasks, task.id, "comments"]))
      );

      return comments.flat();
    }))
  ]);

  return {
    users,
    clients,
    projects,
    projectMembers,
    phases,
    milestones,
    tasks,
    taskDependencies,
    taskComments: taskCommentsByProject.flat(),
    risks,
    documents,
    metrics,
    activityEvents,
    projectCommunications,
    projectCalendarEvents,
    clientProgressReports,
    clientReportSnapshots: clientReportSnapshotsByProject.flat(),
    clientReportArtifacts: clientReportArtifactsByProject.flat(),
    projectVersions
  };
}

export async function seedProjectStateToFirestore(initialState: ProjectState = initialProjectState) {
  const currentUser = requireCurrentUser();
  await ensureFirestoreUserProfile(currentUser);

  const database = requireDb();
  const currentUserId = requirePathSegment(currentUser.uid, "auth.uid");
  const currentUserRef = doc(database, ...organizationPath(), rootCollectionMap.users, currentUserId);
  const currentUserProfile = (await getDoc(currentUserRef)).data() as User | undefined;
  const batch = writeBatch(database);

  batch.set(doc(database, ...organizationPath()), mockOrganization);

  initialState.users.forEach((user) => {
    batch.set(
      doc(database, ...organizationPath(), rootCollectionMap.users, requireRecordId(user, "user")),
      user.id === currentUserId && currentUserProfile ? currentUserProfile : user
    );
  });
  initialState.clients.forEach((client) => {
    batch.set(doc(database, ...organizationPath(), rootCollectionMap.clients, requireRecordId(client, "client")), client);
  });
  initialState.projects.forEach((project) => {
    batch.set(doc(database, ...organizationPath(), rootCollectionMap.projects, requireRecordId(project, "project")), withProjectRevisionDefaults(project));
  });

  const writeProjectScoped = <T extends { id: string; projectId: string }>(items: T[], key: ProjectScopedCollectionKey) => {
    items.forEach((item) => {
      const documentId = key === "projectMembers"
        ? requirePathSegment((item as unknown as ProjectMember).userId, "projectMembers.userId")
        : requireRecordId(item, key);

      batch.set(
        doc(
          database,
          ...projectPath(requirePathSegment(item.projectId, `${key}.projectId`)),
          requirePathSegment(projectCollectionMap[key], `${key} collection`),
          documentId
        ),
        item
      );
    });
  };

  const writeTaskDependencies = (dependencies: TaskDependency[]) => {
    dependencies.forEach((dependency) => {
      const taskId = requirePathSegment(dependency.taskId, "taskDependencies.taskId");
      const task = initialState.tasks.find((item) => item.id === taskId);

      if (!task) {
        throw new Error(`Missing task for task dependency: ${requireRecordId(dependency, "taskDependency")}`);
      }

      batch.set(
        doc(
          database,
          ...projectPath(requirePathSegment(task.projectId, "taskDependencies.task.projectId")),
          projectCollectionMap.taskDependencies,
          requireRecordId(dependency, "taskDependency")
        ),
        dependency
      );
    });
  };

  writeProjectScoped(initialState.projectMembers, "projectMembers");
  writeProjectScoped(initialState.phases, "phases");
  writeProjectScoped(initialState.milestones, "milestones");
  writeProjectScoped(initialState.tasks, "tasks");
  writeTaskDependencies(initialState.taskDependencies);
  writeProjectScoped(initialState.risks, "risks");
  writeProjectScoped(initialState.documents, "documents");
  writeProjectScoped(initialState.metrics, "metrics");
  writeProjectScoped(initialState.activityEvents, "activityEvents");
  writeProjectScoped(initialState.projectCommunications, "projectCommunications");
  writeProjectScoped(initialState.projectCalendarEvents, "projectCalendarEvents");
  writeProjectScoped(initialState.clientProgressReports, "clientProgressReports");
  writeProjectScoped(initialState.projectVersions, "projectVersions");

  initialState.taskComments.forEach((comment) => {
    const taskId = requirePathSegment(comment.taskId, "taskComments.taskId");
    const task = initialState.tasks.find((item) => item.id === taskId);

    if (!task) {
      throw new Error(`Missing task for task comment: ${requireRecordId(comment, "taskComment")}`);
    }

    batch.set(
      doc(
        database,
        ...projectPath(requirePathSegment(task.projectId, "taskComments.task.projectId")),
        projectCollectionMap.tasks,
        requireRecordId(task, "task"),
        "comments",
        requireRecordId(comment, "taskComment")
      ),
      comment
    );
  });

  await batch.commit();
  await ensureFirestoreUserProfile(currentUser);
}

export async function createTaskInFirestore(task: Omit<Task, "id" | "completedAt">) {
  const newTask: Task = {
    ...task,
    id: createId("task"),
    completedAt: task.status === "done" ? new Date().toISOString() : null
  };

  await commitProjectMutation(newTask.projectId, {
    changeType: "task_created",
    summary: `Created task ${newTask.title}.`,
    metadata: { taskId: newTask.id }
  }, (transaction, database) => {
    transaction.set(doc(database, ...projectPath(requirePathSegment(newTask.projectId, "task.projectId")), projectCollectionMap.tasks, newTask.id), newTask);
  });
  return newTask;
}

export async function updateTaskInFirestore(taskId: string, updates: Partial<Task>, projectId?: string) {
  const safeTaskId = requirePathSegment(taskId, "taskId");
  const state = projectId ? null : await loadProjectStateForCurrentUser();
  const task = state?.tasks.find((item) => item.id === safeTaskId);
  const safeProjectId = projectId ?? task?.projectId;

  if (!safeProjectId) {
    throw new Error(`Task ${safeTaskId} was not found in Firestore.`);
  }

  await commitProjectMutation(safeProjectId, {
    changeType: "task_updated",
    summary: "Updated task.",
    metadata: { taskId: safeTaskId, updates }
  }, (transaction, database) => {
    transaction.update(doc(database, ...projectPath(safeProjectId), projectCollectionMap.tasks, safeTaskId), updates);
  });
}

export async function updateTaskScheduleInFirestore(
  taskId: string,
  updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId">
) {
  await updateTaskInFirestore(taskId, updates);
}

export async function batchUpdateTaskSchedulesInFirestore(
  updates: Array<{ taskId: string; updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId" | "assigneeId" | "status" | "priority"> }>,
  projectId?: string
) {
  const state = projectId ? null : await loadProjectStateForCurrentUser();
  const safeProjectId = projectId ?? state?.tasks.find((task) => task.id === updates[0]?.taskId)?.projectId;

  if (!safeProjectId) {
    throw new Error("Unable to resolve project for batch task update.");
  }

  if (state && updates.some((item) => !state.tasks.some((task) => task.id === item.taskId && task.projectId === safeProjectId))) {
    throw new Error("One or more tasks were not found in Firestore.");
  }

  await commitProjectMutation(safeProjectId, {
    changeType: "tasks_batch_updated",
    summary: `Updated ${updates.length} task schedules.`,
    metadata: { taskCount: updates.length, taskIds: updates.map((item) => item.taskId) }
  }, (transaction, database) => {
    updates.forEach((item) => {
      const safeTaskId = requirePathSegment(item.taskId, "taskId");
      transaction.update(doc(database, ...projectPath(safeProjectId), projectCollectionMap.tasks, safeTaskId), item.updates);
    });
  });
}

export async function createMilestoneInFirestore(milestone: Omit<Milestone, "id">) {
  const newMilestone: Milestone = {
    ...milestone,
    id: createId("milestone")
  };

  await commitProjectMutation(newMilestone.projectId, {
    changeType: "milestone_created",
    summary: `Created milestone ${newMilestone.name}.`,
    metadata: { milestoneId: newMilestone.id }
  }, (transaction, database) => {
    transaction.set(doc(database, ...projectPath(requirePathSegment(newMilestone.projectId, "milestone.projectId")), projectCollectionMap.milestones, newMilestone.id), newMilestone);
  });
  return newMilestone;
}

export async function updateMilestoneInFirestore(milestoneId: string, updates: Partial<Milestone>, projectId?: string) {
  const safeMilestoneId = requirePathSegment(milestoneId, "milestoneId");
  const state = projectId ? null : await loadProjectStateForCurrentUser();
  const milestone = state?.milestones.find((item) => item.id === safeMilestoneId);
  const safeProjectId = projectId ?? milestone?.projectId;

  if (!safeProjectId) {
    throw new Error(`Milestone ${safeMilestoneId} was not found in Firestore.`);
  }

  await commitProjectMutation(safeProjectId, {
    changeType: "milestone_updated",
    summary: "Updated milestone.",
    metadata: { milestoneId: safeMilestoneId, updates }
  }, (transaction, database) => {
    transaction.update(doc(database, ...projectPath(safeProjectId), projectCollectionMap.milestones, safeMilestoneId), updates);
  });
}

export async function deleteMilestoneInFirestore(milestoneId: string, projectId?: string) {
  const safeMilestoneId = requirePathSegment(milestoneId, "milestoneId");
  const state = projectId ? null : await loadProjectStateForCurrentUser();
  const milestone = state?.milestones.find((item) => item.id === safeMilestoneId);
  const safeProjectId = projectId ?? milestone?.projectId;

  if (!safeProjectId) {
    throw new Error(`Milestone ${safeMilestoneId} was not found in Firestore.`);
  }

  await commitProjectMutation(safeProjectId, {
    changeType: "milestone_deleted",
    summary: "Deleted milestone.",
    metadata: { milestoneId: safeMilestoneId }
  }, (transaction, database) => {
    transaction.delete(doc(database, ...projectPath(safeProjectId), projectCollectionMap.milestones, safeMilestoneId));
  });
}

export async function createTaskDependencyInFirestore(dependency: Omit<TaskDependency, "id">, projectId?: string) {
  const state = await loadProjectStateForCurrentUser();
  const task = state.tasks.find((item) => item.id === requirePathSegment(dependency.taskId, "dependency.taskId"));
  const predecessor = state.tasks.find((item) => item.id === requirePathSegment(dependency.dependsOnTaskId, "dependency.dependsOnTaskId"));

  if (!task || !predecessor) {
    throw new Error("Both dependency tasks must exist.");
  }

  if (task.projectId !== predecessor.projectId) {
    throw new Error("Dependencies cannot cross projects.");
  }

  const safeProjectId = projectId ?? task.projectId;

  if (safeProjectId !== task.projectId) {
    throw new Error("Dependency project scope does not match the endpoint task project.");
  }

  const newDependency: TaskDependency = {
    ...dependency,
    id: createId("dependency")
  };
  const validationMessage = getFatalDependencyValidationMessage(state.tasks, [...state.taskDependencies, newDependency]);

  if (validationMessage) {
    throw new Error(validationMessage);
  }

  await commitProjectMutation(safeProjectId, {
    changeType: "dependency_created",
    summary: "Created task dependency.",
    metadata: { dependencyId: newDependency.id, taskId: dependency.taskId, dependsOnTaskId: dependency.dependsOnTaskId, type: dependency.type }
  }, (transaction, database) => {
    transaction.set(doc(database, ...projectPath(safeProjectId), projectCollectionMap.taskDependencies, newDependency.id), newDependency);
  });
  return newDependency;
}

export async function updateTaskDependencyInFirestore(dependencyId: string, updates: Partial<TaskDependency>, projectId?: string) {
  const safeDependencyId = requirePathSegment(dependencyId, "dependencyId");
  const state = await loadProjectStateForCurrentUser();
  const dependency = state.taskDependencies.find((item) => item.id === safeDependencyId);
  const updatedDependency = dependency ? { ...dependency, ...updates } : undefined;
  const task = updatedDependency ? state.tasks.find((item) => item.id === updatedDependency.taskId) : undefined;
  const predecessor = updatedDependency ? state.tasks.find((item) => item.id === updatedDependency.dependsOnTaskId) : undefined;
  const safeProjectId = projectId ?? task?.projectId;

  if (!dependency || !updatedDependency || !safeProjectId) {
    throw new Error(`Dependency ${safeDependencyId} was not found in Firestore.`);
  }

  if (!task || !predecessor) {
    throw new Error("Both dependency tasks must exist.");
  }

  if (safeProjectId !== task.projectId) {
    throw new Error("Dependency project scope does not match the endpoint task project.");
  }

  const nextDependencies = state.taskDependencies.map((item) => item.id === safeDependencyId ? updatedDependency : item);
  const validationMessage = getFatalDependencyValidationMessage(state.tasks, nextDependencies);

  if (validationMessage) {
    throw new Error(validationMessage);
  }

  await commitProjectMutation(safeProjectId, {
    changeType: "dependency_updated",
    summary: "Updated task dependency.",
    metadata: { dependencyId: safeDependencyId, updates }
  }, (transaction, database) => {
    transaction.update(doc(database, ...projectPath(safeProjectId), projectCollectionMap.taskDependencies, safeDependencyId), updates);
  });
}

export async function deleteTaskDependencyInFirestore(dependencyId: string, projectId?: string) {
  const safeDependencyId = requirePathSegment(dependencyId, "dependencyId");
  const state = await loadProjectStateForCurrentUser();
  const dependency = state.taskDependencies.find((item) => item.id === safeDependencyId);
  const task = dependency ? state.tasks.find((item) => item.id === dependency.taskId) : undefined;
  const safeProjectId = projectId ?? task?.projectId;

  if (!dependency || !safeProjectId) {
    throw new Error(`Dependency ${safeDependencyId} was not found in Firestore.`);
  }

  await commitProjectMutation(safeProjectId, {
    changeType: "dependency_deleted",
    summary: "Deleted task dependency.",
    metadata: { dependencyId: safeDependencyId }
  }, (transaction, database) => {
    transaction.delete(doc(database, ...projectPath(safeProjectId), projectCollectionMap.taskDependencies, safeDependencyId));
  });
}

export async function createScheduleActivityEventInFirestore(event: Omit<ProjectActivityEvent, "id" | "createdAt">) {
  const newEvent: ProjectActivityEvent = {
    ...event,
    id: createId("event"),
    createdAt: new Date().toISOString()
  };

  await writeDocument([...projectPath(requirePathSegment(newEvent.projectId, "activityEvent.projectId")), projectCollectionMap.activityEvents], newEvent);
  return newEvent;
}

export async function createProjectExportSnapshotInFirestore({
  projectId,
  sourceHash,
  packageJson,
  projectPackage,
  snapshotType = "manual_export",
  resultRevision,
  sourceUpdateHash,
  sourceSnapshotId,
  resultStateHash
}: Pick<ProjectExportSnapshot, "projectId" | "sourceHash" | "packageJson"> & {
  projectPackage: ProjectExportPackage;
  snapshotType?: ProjectExportSnapshot["snapshotType"];
  resultRevision?: number;
  sourceUpdateHash?: string;
  sourceSnapshotId?: string;
  resultStateHash?: string;
}) {
  const safeProjectId = requirePathSegment(projectId, "projectId");
  const actor = requireCurrentUser();
  const database = requireDb();
  const projectRef = doc(database, ...projectPath(safeProjectId));
  const packageHash = await hashProjectExportJson(packageJson);

  if (packageHash !== sourceHash) {
    throw new Error("source_snapshot_hash_mismatch");
  }

  assertProjectSnapshotSize(packageJson);

  return runTransaction(database, async (transaction) => {
    const projectSnapshot = await transaction.get(projectRef);

    if (!projectSnapshot.exists()) {
      throw new Error(`Project ${safeProjectId} was not found in Firestore.`);
    }

    const project = withProjectRevisionDefaults(projectSnapshot.data() as Project);

    if (project.revision !== projectPackage.baseRevision) {
      throw new Error("The project changed while the export was being prepared. Export the project again.");
    }

    if (
      projectPackage.baseProjectId !== safeProjectId
      || projectPackage.project.id !== safeProjectId
      || projectPackage.project.organizationId !== project.organizationId
    ) {
      throw new Error("project_identity_mismatch");
    }

    const snapshot: ProjectExportSnapshot = {
      id: projectPackage.exportSnapshotId ?? createId("export"),
      projectId: safeProjectId,
      baseRevision: projectPackage.baseRevision,
      ...(typeof resultRevision === "number" ? { resultRevision } : {}),
      packageId: projectPackage.packageId,
      sourceHash,
      ...(sourceUpdateHash ? { sourceUpdateHash } : {}),
      ...(sourceSnapshotId ? { sourceSnapshotId } : {}),
      ...(resultStateHash ? { resultStateHash } : {}),
      snapshotType,
      packageJson,
      createdBy: actor.uid,
      createdAt: new Date().toISOString()
    };

    transaction.set(doc(database, ...projectPath(safeProjectId), projectCollectionMap.projectExportSnapshots, snapshot.id), snapshot);
    return snapshot;
  });
}

export async function loadProjectExportSnapshotsFromFirestore(projectId: string) {
  return readCollection<ProjectExportSnapshot>([
    ...projectPath(requirePathSegment(projectId, "projectId")),
    projectCollectionMap.projectExportSnapshots
  ]);
}

export async function loadProjectUpdateManifestFromFirestore(projectId: string, uploadedFileHash: string) {
  const snapshot = await getDoc(doc(
    requireDb(),
    ...projectPath(requirePathSegment(projectId, "projectId")),
    projectCollectionMap.projectUpdateManifests,
    requirePathSegment(uploadedFileHash, "uploadedFileHash")
  ));

  return snapshot.exists() ? snapshot.data() as ProjectUpdateManifest : null;
}

function collectionEntityMap(projectPackage: ProjectExportPackage) {
  return {
    phases: projectPackage.phases,
    milestones: projectPackage.milestones,
    tasks: projectPackage.tasks,
    taskDependencies: projectPackage.taskDependencies,
    risks: projectPackage.risks,
    documents: projectPackage.documents,
    metrics: projectPackage.metrics
  };
}

function projectCollectionKeyForEntity(entityType: string): ProjectScopedCollectionKey {
  if (entityType === "taskDependencies") {
    return "taskDependencies";
  }
  return entityType as ProjectScopedCollectionKey;
}

export async function applyProjectUpdateFromExportInFirestore(plan: ProjectUpdatePlan) {
  const safeProjectId = requirePathSegment(plan.projectId, "projectId");
  const actor = requireCurrentUser();
  const database = requireDb();
  const now = new Date().toISOString();
  const resultPackageJson = stringifyCanonicalProjectExport(plan.resultCanonicalPackage);
  const resultSourceHash = await hashProjectExportJson(resultPackageJson);
  const sourceSnapshotHash = await hashProjectExportJson(plan.sourceSnapshot.packageJson);

  if (sourceSnapshotHash !== plan.sourceSnapshotHash) {
    throw new Error("source_snapshot_hash_mismatch");
  }

  assertProjectSnapshotSize(resultPackageJson);

  const fatalIssues = plan.validationIssues.filter((item) => item.severity === "error");
  if (fatalIssues.length > 0) {
    throw new Error(fatalIssues.map((item) => item.code).join(", "));
  }

  const resultTasks = plan.resultCanonicalPackage.tasks;
  const resultDependencies = plan.resultCanonicalPackage.taskDependencies;
  const dependencyIssue = getFatalDependencyValidationMessage(resultTasks, resultDependencies);

  if (dependencyIssue) {
    throw new Error(dependencyIssue);
  }

  return runTransaction(database, async (transaction) => {
    const projectRef = doc(database, ...projectPath(safeProjectId));
    const sourceSnapshotRef = doc(database, ...projectPath(safeProjectId), projectCollectionMap.projectExportSnapshots, plan.sourceSnapshotId);
    const updateManifestRef = doc(database, ...projectPath(safeProjectId), projectCollectionMap.projectUpdateManifests, plan.uploadedFileHash);
    const [projectSnapshot, sourceSnapshot, updateManifest] = await Promise.all([
      transaction.get(projectRef),
      transaction.get(sourceSnapshotRef),
      transaction.get(updateManifestRef)
    ]);

    if (!projectSnapshot.exists()) {
      throw new Error(`Project ${safeProjectId} was not found in Firestore.`);
    }

    const project = withProjectRevisionDefaults(projectSnapshot.data() as Project);

    if (
      project.revision !== plan.baseRevision
      || project.lastStructuralChangeAt !== plan.currentProject.lastStructuralChangeAt
    ) {
      throw new Error("This project changed after the update preview was created. No changes were applied. Export the current project again and regenerate the update.");
    }

    if (!sourceSnapshot.exists()) {
      throw new Error("unknown_export_snapshot");
    }

    const storedSourceSnapshot = sourceSnapshot.data() as ProjectExportSnapshot;
    if (
      storedSourceSnapshot.projectId !== safeProjectId
      || storedSourceSnapshot.packageId !== plan.sourcePackageId
      || storedSourceSnapshot.baseRevision !== plan.baseRevision
      || storedSourceSnapshot.sourceHash !== plan.sourceSnapshotHash
    ) {
      throw new Error("source_snapshot_hash_mismatch");
    }

    if (updateManifest.exists()) {
      throw new Error("This update file has already been applied to this project.");
    }

    const resultRevision = plan.baseRevision + 1;
    const version: ProjectVersion = {
      id: createId("version"),
      projectId: safeProjectId,
      revision: resultRevision,
      previousRevision: plan.baseRevision,
      changeType: "project_file_updated",
      summary: plan.humanSummary,
      actorId: actor.uid,
      metadata: {
        sourceSnapshotId: plan.sourceSnapshotId,
        sourcePackageId: plan.sourcePackageId,
        baseRevision: plan.baseRevision,
        uploadedFileHash: plan.uploadedFileHash,
        resultStateHash: plan.resultStateHash,
        addedCount: plan.changeCounts.added,
        modifiedCount: plan.changeCounts.modified,
        removedCount: plan.changeCounts.removed,
        countsByEntityType: plan.changeCounts.byEntityType,
        temporaryIdMap: plan.temporaryIdMap,
        warningCount: plan.warnings.length,
        resultSnapshotId: plan.resultCanonicalPackage.exportSnapshotId
      },
      createdAt: now
    };
    const activity: ProjectActivityEvent = {
      id: createId("event"),
      projectId: safeProjectId,
      actorId: actor.uid,
      type: "project_file_updated",
      message: plan.humanSummary,
      metadata: {
        versionId: version.id,
        uploadedFileHash: plan.uploadedFileHash,
        resultStateHash: plan.resultStateHash
      },
      createdAt: now
    };
    const manifest: ProjectUpdateManifest = {
      id: plan.uploadedFileHash,
      organizationId: FIRESTORE_ORGANIZATION_ID,
      projectId: safeProjectId,
      sourceSnapshotId: plan.sourceSnapshotId,
      sourcePackageId: plan.sourcePackageId,
      sourceSnapshotHash: plan.sourceSnapshotHash,
      uploadedFileHash: plan.uploadedFileHash,
      resultStateHash: plan.resultStateHash,
      baseRevision: plan.baseRevision,
      resultRevision,
      versionId: version.id,
      actorId: actor.uid,
      appliedAt: now,
      changeCounts: plan.changeCounts
    };
    const resultSnapshotRecord: ProjectExportSnapshot = {
      id: plan.resultCanonicalPackage.exportSnapshotId ?? createId("result"),
      projectId: safeProjectId,
      baseRevision: resultRevision,
      resultRevision,
      packageId: plan.resultCanonicalPackage.packageId,
      sourceHash: resultSourceHash,
      sourceUpdateHash: plan.uploadedFileHash,
      sourceSnapshotId: plan.sourceSnapshotId,
      resultStateHash: plan.resultStateHash,
      snapshotType: "revision_result",
      createdBy: actor.uid,
      createdAt: now,
      packageJson: resultPackageJson
    };
    const resultCollections = collectionEntityMap(plan.resultCanonicalPackage);
    const originalCollections = collectionEntityMap(plan.originalPackage);

    transaction.update(projectRef, {
      ...plan.projectPatch,
      revision: resultRevision,
      updatedAt: now,
      lastStructuralChangeAt: now
    });

    Object.entries(resultCollections).forEach(([entityType, items]) => {
      const key = projectCollectionKeyForEntity(entityType);
      items.forEach((item) => {
        transaction.set(doc(database, ...projectPath(safeProjectId), projectCollectionMap[key], item.id), item);
      });
    });

    Object.entries(originalCollections).forEach(([entityType, items]) => {
      const key = projectCollectionKeyForEntity(entityType);
      const retainedIds = new Set((resultCollections as Record<string, Array<{ id: string }>>)[entityType].map((item) => item.id));
      items.forEach((item) => {
        if (!retainedIds.has(item.id)) {
          transaction.delete(doc(database, ...projectPath(safeProjectId), projectCollectionMap[key], item.id));
        }
      });
    });

    transaction.set(doc(database, ...projectPath(safeProjectId), projectCollectionMap.projectVersions, version.id), version);
    transaction.set(doc(database, ...projectPath(safeProjectId), projectCollectionMap.activityEvents, activity.id), activity);
    transaction.set(updateManifestRef, manifest);
    transaction.set(doc(database, ...projectPath(safeProjectId), projectCollectionMap.projectExportSnapshots, resultSnapshotRecord.id), resultSnapshotRecord);

    return { version, manifest, resultSnapshot: resultSnapshotRecord, activity };
  });
}

export async function addTaskCommentInFirestore(taskId: string, comment: Omit<TaskComment, "id" | "taskId" | "createdAt">) {
  const safeTaskId = requirePathSegment(taskId, "taskId");
  const state = await loadProjectStateForCurrentUser();
  const task = state.tasks.find((item) => item.id === safeTaskId);

  if (!task) {
    throw new Error(`Task ${safeTaskId} was not found in Firestore.`);
  }

  const newComment: TaskComment = {
    ...comment,
    id: createId("comment"),
    taskId: safeTaskId,
    createdAt: new Date().toISOString()
  };

  await writeDocument([...projectPath(task.projectId), projectCollectionMap.tasks, safeTaskId, "comments"], newComment);
  return newComment;
}

export async function createRiskInFirestore(risk: Omit<ProjectRisk, "id">) {
  const newRisk: ProjectRisk = {
    ...risk,
    id: createId("risk")
  };

  await commitProjectMutation(newRisk.projectId, {
    changeType: "risk_created",
    summary: `Created risk ${newRisk.title}.`,
    metadata: { riskId: newRisk.id }
  }, (transaction, database) => {
    transaction.set(doc(database, ...projectPath(requirePathSegment(newRisk.projectId, "risk.projectId")), projectCollectionMap.risks, newRisk.id), newRisk);
  });
  return newRisk;
}

export async function updateRiskInFirestore(riskId: string, updates: Partial<ProjectRisk>, projectId?: string) {
  const safeRiskId = requirePathSegment(riskId, "riskId");
  const state = projectId ? null : await loadProjectStateForCurrentUser();
  const risk = state?.risks.find((item) => item.id === safeRiskId);
  const safeProjectId = projectId ?? risk?.projectId;

  if (!safeProjectId) {
    throw new Error(`Risk ${safeRiskId} was not found in Firestore.`);
  }

  await commitProjectMutation(safeProjectId, {
    changeType: "risk_updated",
    summary: "Updated risk.",
    metadata: { riskId: safeRiskId, updates }
  }, (transaction, database) => {
    transaction.update(doc(database, ...projectPath(safeProjectId), projectCollectionMap.risks, safeRiskId), updates);
  });
}

export async function resetFirestoreProjectState() {
  const currentUser = requireCurrentUser();
  await ensureFirestoreUserProfile(currentUser);
  const currentState = await loadProjectStateFromFirestore(currentUser);

  await Promise.all(currentState.projects.map(async (project) => {
    await Promise.all(currentState.tasks
      .filter((task) => task.projectId === project.id)
      .map((task) => deleteCollection([...projectPath(project.id), projectCollectionMap.tasks, requireRecordId(task, "task"), "comments"])));

    await Promise.all(Object.values(projectCollectionMap).map((collectionName) => (
      deleteCollection([...projectPath(project.id), collectionName])
    )));
  }));

  await Promise.all([
    deleteCollection([...organizationPath(), rootCollectionMap.clients]),
    deleteCollection([...organizationPath(), rootCollectionMap.projects]),
    Promise.all(initialProjectState.users
      .filter((user) => user.id !== currentUser.uid)
      .map((user) => deleteDoc(doc(requireDb(), ...organizationPath(), rootCollectionMap.users, requireRecordId(user, "user")))))
  ]);

  await setDoc(doc(requireDb(), ...organizationPath()), mockOrganization, { merge: true });
  await ensureFirestoreUserProfile(currentUser);
}

export async function loadProjectStateForCurrentUser() {
  return loadProjectStateFromFirestore(requireCurrentUser());
}
