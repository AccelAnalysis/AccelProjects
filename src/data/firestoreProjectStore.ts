import type { User as FirebaseUser } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
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

function organizationPath() {
  return ["organizations", FIRESTORE_ORGANIZATION_ID];
}

function projectPath(projectId: string) {
  return [...organizationPath(), "projects", projectId];
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

async function readCollection<T extends { id: string }>(pathSegments: string[]) {
  const snapshot = await getDocs(query(collection(requireDb(), ...pathSegments)));
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
  await setDoc(doc(requireDb(), ...pathSegments, value.id), value);
}

async function deleteCollection(pathSegments: string[]) {
  const snapshot = await getDocs(collection(requireDb(), ...pathSegments));
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
}

export async function loadProjectStateFromFirestore(_user: FirebaseUser): Promise<ProjectState> {
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
  const database = requireDb();
  const batch = writeBatch(database);

  batch.set(doc(database, ...organizationPath()), mockOrganization);

  initialState.users.forEach((user) => {
    batch.set(doc(database, ...organizationPath(), rootCollectionMap.users, user.id), user);
  });
  initialState.clients.forEach((client) => {
    batch.set(doc(database, ...organizationPath(), rootCollectionMap.clients, client.id), client);
  });
  initialState.projects.forEach((project) => {
    batch.set(doc(database, ...organizationPath(), rootCollectionMap.projects, project.id), project);
  });

  const writeProjectScoped = <T extends { id: string; projectId: string }>(items: T[], key: ProjectScopedCollectionKey) => {
    items.forEach((item) => {
      batch.set(doc(database, ...projectPath(item.projectId), projectCollectionMap[key], item.id), item);
    });
  };

  writeProjectScoped(initialState.projectMembers, "projectMembers");
  writeProjectScoped(initialState.phases, "phases");
  writeProjectScoped(initialState.milestones, "milestones");
  writeProjectScoped(initialState.tasks, "tasks");
  writeProjectScoped(initialState.taskDependencies, "taskDependencies");
  writeProjectScoped(initialState.risks, "risks");
  writeProjectScoped(initialState.documents, "documents");
  writeProjectScoped(initialState.metrics, "metrics");
  writeProjectScoped(initialState.activityEvents, "activityEvents");

  initialState.taskComments.forEach((comment) => {
    const task = initialState.tasks.find((item) => item.id === comment.taskId);

    if (task) {
      batch.set(doc(database, ...projectPath(task.projectId), projectCollectionMap.tasks, task.id, "comments", comment.id), comment);
    }
  });

  await batch.commit();
}

export async function createTaskInFirestore(task: Omit<Task, "id" | "completedAt">) {
  const newTask: Task = {
    ...task,
    id: createId("task"),
    completedAt: task.status === "done" ? new Date().toISOString() : null
  };

  await writeDocument([...projectPath(newTask.projectId), projectCollectionMap.tasks], newTask);
  return newTask;
}

export async function updateTaskInFirestore(taskId: string, updates: Partial<Task>) {
  const state = await loadProjectStateForCurrentUser();
  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    throw new Error(`Task ${taskId} was not found in Firestore.`);
  }

  await updateDoc(doc(requireDb(), ...projectPath(task.projectId), projectCollectionMap.tasks, taskId), updates);
}

export async function addTaskCommentInFirestore(taskId: string, comment: Omit<TaskComment, "id" | "taskId" | "createdAt">) {
  const state = await loadProjectStateForCurrentUser();
  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    throw new Error(`Task ${taskId} was not found in Firestore.`);
  }

  const newComment: TaskComment = {
    ...comment,
    id: createId("comment"),
    taskId,
    createdAt: new Date().toISOString()
  };

  await writeDocument([...projectPath(task.projectId), projectCollectionMap.tasks, taskId, "comments"], newComment);
  return newComment;
}

export async function createRiskInFirestore(risk: Omit<ProjectRisk, "id">) {
  const newRisk: ProjectRisk = {
    ...risk,
    id: createId("risk")
  };

  await writeDocument([...projectPath(newRisk.projectId), projectCollectionMap.risks], newRisk);
  return newRisk;
}

export async function updateRiskInFirestore(riskId: string, updates: Partial<ProjectRisk>) {
  const state = await loadProjectStateForCurrentUser();
  const risk = state.risks.find((item) => item.id === riskId);

  if (!risk) {
    throw new Error(`Risk ${riskId} was not found in Firestore.`);
  }

  await updateDoc(doc(requireDb(), ...projectPath(risk.projectId), projectCollectionMap.risks, riskId), updates);
}

export async function resetFirestoreProjectState() {
  const currentState = await loadProjectStateForCurrentUser();

  await Promise.all(currentState.projects.map(async (project) => {
    await Promise.all(currentState.tasks
      .filter((task) => task.projectId === project.id)
      .map((task) => deleteCollection([...projectPath(project.id), projectCollectionMap.tasks, task.id, "comments"])));

    await Promise.all(Object.values(projectCollectionMap).map((collectionName) => (
      deleteCollection([...projectPath(project.id), collectionName])
    )));
  }));

  await Promise.all(Object.values(rootCollectionMap).map((collectionName) => (
    deleteCollection([...organizationPath(), collectionName])
  )));

  await deleteDoc(doc(requireDb(), ...organizationPath()));
}

export async function loadProjectStateForCurrentUser() {
  if (!auth?.currentUser) {
    throw new Error("You must be signed in to use Firestore project data.");
  }

  return loadProjectStateFromFirestore(auth.currentUser);
}
