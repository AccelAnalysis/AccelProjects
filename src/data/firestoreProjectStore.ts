import type { User as FirebaseUser } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { initialProjectState, mockOrganization } from "./projectMockData";
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
  Task,
  TaskComment,
  TaskDependency,
  User
} from "../types";

export const FIRESTORE_ORGANIZATION_ID = "org_accel_projects";

type CollectionKey = keyof ProjectState;
type ProjectScopedCollectionKey = "projectMembers" | "phases" | "milestones" | "tasks" | "taskDependencies" | "risks" | "documents" | "metrics" | "activityEvents";

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
  activityEvents: "activityEvents"
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

function validatePathSegments(pathSegments: unknown[]) {
  return pathSegments.map((segment, index) => requirePathSegment(segment, `path[${index}]`));
}

function organizationPath() {
  return [
    requirePathSegment("organizations", "organizations collection"),
    requirePathSegment(FIRESTORE_ORGANIZATION_ID, "organizationId")
  ];
}

function projectPath(projectId: string) {
  return [
    ...organizationPath(),
    requirePathSegment("projects", "projects collection"),
    requirePathSegment(projectId, "projectId")
  ];
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function requireCurrentUser() {
  if (!auth?.currentUser) {
    throw new Error("You must be signed in to use Firestore project data.");
  }

  return auth.currentUser;
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

export async function ensureFirestoreUserProfile(user: FirebaseUser) {
  const database = requireDb();
  const now = new Date().toISOString();
  const userId = requirePathSegment(user.uid, "auth.uid");
  const userRef = doc(database, ...organizationPath(), rootCollectionMap.users, userId);
  const existingUser = await getDoc(userRef);
  const name = getDisplayName(user);
  const email = user.email ?? "";

  await setDoc(doc(database, ...organizationPath()), mockOrganization, { merge: true });
  await setDoc(userRef, {
    id: userId,
    organizationId: FIRESTORE_ORGANIZATION_ID,
    name,
    email,
    role: existingUser.exists() ? (existingUser.data().role ?? "project_manager") : "project_manager",
    avatarInitials: getInitials(name, email),
    createdAt: existingUser.exists() ? (existingUser.data().createdAt ?? now) : now,
    updatedAt: now
  } satisfies User, { merge: true });
}

async function readCollection<T extends { id: string }>(pathSegments: string[]) {
  const snapshot = await getDocs(query(collection(requireDb(), ...validatePathSegments(pathSegments))));
  return snapshot.docs.map((item) => item.data() as T);
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

export async function loadProjectStateFromFirestore(_user: FirebaseUser): Promise<ProjectState> {
  await ensureFirestoreUserProfile(_user);

  const users = await readCollection<User>([...organizationPath(), rootCollectionMap.users]);
  const clients = await readCollection<Client>([...organizationPath(), rootCollectionMap.clients]);
  const projects = await readCollection<Project>([...organizationPath(), rootCollectionMap.projects]);

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
    activityEvents
  };
}

export async function seedProjectStateToFirestore(initialState: ProjectState = initialProjectState) {
  const currentUser = requireCurrentUser();
  await ensureFirestoreUserProfile(currentUser);

  const database = requireDb();
  const batch = writeBatch(database);

  batch.set(doc(database, ...organizationPath()), mockOrganization);

  initialState.users.forEach((user) => {
    batch.set(doc(database, ...organizationPath(), rootCollectionMap.users, requireRecordId(user, "user")), user);
  });
  initialState.clients.forEach((client) => {
    batch.set(doc(database, ...organizationPath(), rootCollectionMap.clients, requireRecordId(client, "client")), client);
  });
  initialState.projects.forEach((project) => {
    batch.set(doc(database, ...organizationPath(), rootCollectionMap.projects, requireRecordId(project, "project")), project);
  });

  const writeProjectScoped = <T extends { id: string; projectId: string }>(items: T[], key: ProjectScopedCollectionKey) => {
    items.forEach((item) => {
      batch.set(
        doc(
          database,
          ...projectPath(requirePathSegment(item.projectId, `${key}.projectId`)),
          requirePathSegment(projectCollectionMap[key], `${key} collection`),
          requireRecordId(item, key)
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

  await writeDocument([...projectPath(requirePathSegment(newTask.projectId, "task.projectId")), projectCollectionMap.tasks], newTask);
  return newTask;
}

export async function updateTaskInFirestore(taskId: string, updates: Partial<Task>) {
  const safeTaskId = requirePathSegment(taskId, "taskId");
  const state = await loadProjectStateForCurrentUser();
  const task = state.tasks.find((item) => item.id === safeTaskId);

  if (!task) {
    throw new Error(`Task ${safeTaskId} was not found in Firestore.`);
  }

  await updateDoc(doc(requireDb(), ...projectPath(task.projectId), projectCollectionMap.tasks, safeTaskId), updates);
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

  await writeDocument([...projectPath(requirePathSegment(newRisk.projectId, "risk.projectId")), projectCollectionMap.risks], newRisk);
  return newRisk;
}

export async function updateRiskInFirestore(riskId: string, updates: Partial<ProjectRisk>) {
  const safeRiskId = requirePathSegment(riskId, "riskId");
  const state = await loadProjectStateForCurrentUser();
  const risk = state.risks.find((item) => item.id === safeRiskId);

  if (!risk) {
    throw new Error(`Risk ${safeRiskId} was not found in Firestore.`);
  }

  await updateDoc(doc(requireDb(), ...projectPath(risk.projectId), projectCollectionMap.risks, safeRiskId), updates);
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
