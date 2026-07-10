import { useState } from "react";
import {
  addTaskComment,
  createRisk,
  createTask,
  getProjectState,
  resetProjectStateOnServer,
  updateTask
} from "../data/projectApi";
import { useAuth } from "../auth/AuthProvider";
import { auth, db, isFirebaseConfigured } from "../firebase";
import {
  addTaskCommentInFirestore,
  createRiskInFirestore,
  createTaskInFirestore,
  ensureFirestoreUserProfile,
  getFirestorePermissionMessage,
  loadProjectStateFromFirestore,
  resetFirestoreProjectState,
  seedProjectStateToFirestore,
  updateRiskInFirestore,
  updateTaskInFirestore
} from "../data/firestoreProjectStore";
import { initialProjectState } from "../data/projectMockData";
import type { ProjectRisk, ProjectState, Task } from "../types";

export function SystemTestsPage() {
  const { user } = useAuth();
  const [projectState, setProjectState] = useState<ProjectState | undefined>();
  const [firestoreState, setFirestoreState] = useState<ProjectState | undefined>();
  const [testTaskId, setTestTaskId] = useState("");
  const [firestoreTestTaskId, setFirestoreTestTaskId] = useState("");
  const [firestoreTestRiskId, setFirestoreTestRiskId] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [firebaseResultMessage, setFirebaseResultMessage] = useState("");

  async function runProjectTest(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : "Project API test failed");
    }
  }

  async function runFirebaseTest(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      setFirebaseResultMessage(getFirestorePermissionMessage(error));
    }
  }

  async function loadProjectState() {
    const state = await getProjectState();
    setProjectState(state);
    setResultMessage(`Loaded ${state.projects.length} projects and ${state.tasks.length} tasks from /api/project-state`);
    return state;
  }

  async function getCurrentProjectState() {
    return projectState ?? loadProjectState();
  }

  async function getOrCreateTestTask() {
    const state = await getCurrentProjectState();
    const existingTask = testTaskId ? state.tasks.find((task) => task.id === testTaskId) : undefined;

    if (existingTask) {
      return existingTask;
    }

    const project = state.projects[0];
    const phase = state.phases.find((item) => item.projectId === project.id) ?? state.phases[0];
    const result = await createTask({
      projectId: project.id,
      phaseId: phase.id,
      title: "System test task",
      description: "Created from the System Tests project API panel.",
      status: "not_started",
      priority: "medium",
      assigneeId: "user_sarah",
      startDate: "2026-07-09",
      dueDate: "2026-07-16",
      estimateHours: 2
    });

    setProjectState(result.state);
    setTestTaskId(result.task.id);
    return result.task;
  }

  async function loadFirestoreProjectState() {
    if (!user) {
      throw new Error("Sign in before running Firestore tests.");
    }

    const state = await loadProjectStateFromFirestore(user);
    setFirestoreState(state);
    setFirebaseResultMessage(`Loaded ${state.projects.length} projects and ${state.tasks.length} tasks from Firestore`);
    return state;
  }

  async function getCurrentFirestoreProjectState() {
    return firestoreState ?? loadFirestoreProjectState();
  }

  async function getOrCreateFirestoreTestTask() {
    const state = await getCurrentFirestoreProjectState();
    const existingTask = firestoreTestTaskId ? state.tasks.find((task) => task.id === firestoreTestTaskId) : undefined;

    if (existingTask) {
      return existingTask;
    }

    const project = state.projects[0];

    if (!project) {
      throw new Error("Seed Firestore demo data before creating a test task.");
    }

    const phase = state.phases.find((item) => item.projectId === project.id) ?? state.phases[0];
    const task = await createTaskInFirestore({
      projectId: project.id,
      phaseId: phase.id,
      title: "Firestore system test task",
      description: "Created from the System Tests Firebase panel.",
      status: "not_started",
      priority: "medium",
      assigneeId: "user_sarah",
      startDate: "2026-07-09",
      dueDate: "2026-07-16",
      estimateHours: 2
    });

    if (user) {
      setFirestoreState(await loadProjectStateFromFirestore(user));
    }
    setFirestoreTestTaskId(task.id);
    return task;
  }

  async function getOrCreateFirestoreTestRisk() {
    const state = await getCurrentFirestoreProjectState();
    const existingRisk = firestoreTestRiskId ? state.risks.find((risk) => risk.id === firestoreTestRiskId) : undefined;

    if (existingRisk) {
      return existingRisk;
    }

    const project = state.projects[0];

    if (!project) {
      throw new Error("Seed Firestore demo data before creating a test risk.");
    }

    const risk = await createRiskInFirestore({
      projectId: project.id,
      title: "Firestore system test risk",
      severity: "medium",
      probability: "medium",
      status: "monitoring",
      mitigationPlan: "Validate through manual System Tests before next phase."
    });

    if (user) {
      setFirestoreState(await loadProjectStateFromFirestore(user));
    }
    setFirestoreTestRiskId(risk.id);
    return risk;
  }

  function countTasksByStatus(state: ProjectState, status: Task["status"]) {
    return state.tasks.filter((task) => task.status === status).length;
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>System Tests</h1>
            <p>Operational tools for validating backend routes, integrations, logs, billing, email, SMS, payments, and project APIs.</p>
          </div>
        </div>
        <div className="page-grid three">
          <a className="system-card" href="/test">
            <strong>Integration Test Center</strong>
            <span>Manual API, email, SMS, Stripe, and log checks</span>
          </a>
          <a className="system-card" href="/admin">
            <strong>Operations Dashboard</strong>
            <span>Orders, email logs, SMS logs, payment logs, and actions</span>
          </a>
          <a className="system-card" href="/billing">
            <strong>Billing / Order Test Flows</strong>
            <span>Create draft orders and verify billing module behavior</span>
          </a>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Firebase Tests</h2>
            <p>Manual checks for Firebase Auth, Firestore connection, seeded project state, task comments, risks, and reset flow.</p>
          </div>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => runFirebaseTest(async () => {
            setFirebaseResultMessage(
              isFirebaseConfigured
                ? `Configured. Auth user: ${auth?.currentUser?.email ?? "none"} / Firestore: ${db ? "ready" : "not initialized"}`
                : "Firebase environment variables are missing."
            );
          })}>
            Auth Status
          </button>
          <button type="button" onClick={() => runFirebaseTest(async () => {
            if (!user) {
              throw new Error("Sign in before bootstrapping a Firestore profile.");
            }

            await ensureFirestoreUserProfile(user);
            setFirebaseResultMessage(`User profile ready at organizations/org_accel_projects/users/${user.uid}`);
          })}>
            Bootstrap User Profile
          </button>
          <button type="button" onClick={() => runFirebaseTest(async () => {
            await loadFirestoreProjectState();
          })}>
            Load Project State
          </button>
          <button type="button" onClick={() => runFirebaseTest(async () => {
            await seedProjectStateToFirestore(initialProjectState);
            await loadFirestoreProjectState();
            setFirebaseResultMessage("Seeded Firestore demo data");
          })}>
            Seed Demo Data
          </button>
          <button type="button" onClick={() => runFirebaseTest(async () => {
            const task = await getOrCreateFirestoreTestTask();
            setFirebaseResultMessage(`Created Firestore test task ${task.id}`);
          })}>
            Create Test Task
          </button>
          <button type="button" onClick={() => runFirebaseTest(async () => {
            const task = await getOrCreateFirestoreTestTask();
            await updateTaskInFirestore(task.id, { status: "in_progress" });
            const state = await loadFirestoreProjectState();
            const updatedTask = state.tasks.find((item) => item.id === task.id);
            setFirebaseResultMessage(`Updated ${task.id} to ${updatedTask?.status ?? "unknown"}`);
          })}>
            Update Test Task
          </button>
          <button type="button" onClick={() => runFirebaseTest(async () => {
            const task = await getOrCreateFirestoreTestTask();
            const comment = await addTaskCommentInFirestore(task.id, {
              authorId: "user_sarah",
              body: "System test comment added through Firestore.",
              visibility: "internal"
            });

            if (user) {
              setFirestoreState(await loadProjectStateFromFirestore(user));
            }
            setFirebaseResultMessage(`Added Firestore comment ${comment.id} to ${task.id}`);
          })}>
            Add Test Comment
          </button>
          <button type="button" onClick={() => runFirebaseTest(async () => {
            const risk = await getOrCreateFirestoreTestRisk();
            setFirebaseResultMessage(`Created Firestore risk ${risk.id}`);
          })}>
            Create Test Risk
          </button>
          <button type="button" onClick={() => runFirebaseTest(async () => {
            const risk = await getOrCreateFirestoreTestRisk();
            await updateRiskInFirestore(risk.id, { status: "mitigating", severity: "high" });
            const state = await loadFirestoreProjectState();
            const updatedRisk = state.risks.find((item: ProjectRisk) => item.id === risk.id);
            setFirebaseResultMessage(`Updated ${risk.id} to ${updatedRisk?.status ?? "unknown"} / ${updatedRisk?.severity ?? "unknown"}`);
          })}>
            Update Test Risk
          </button>
          <button type="button" onClick={() => runFirebaseTest(async () => {
            await resetFirestoreProjectState();
            await seedProjectStateToFirestore(initialProjectState);
            await loadFirestoreProjectState();
            setFirestoreTestTaskId("");
            setFirestoreTestRiskId("");
            setFirebaseResultMessage("Firestore demo data reset to seed data");
          })}>
            Reset Demo Data
          </button>
        </div>
        <div className="test-readout">
          <strong>Latest Firebase result</strong>
          <span>{firebaseResultMessage || "No Firebase test has run yet."}</span>
          {firestoreState ? (
            <span>
              {firestoreState.projects.length} projects / {firestoreState.tasks.length} tasks /
              {" "}{countTasksByStatus(firestoreState, "in_progress")} in progress /
              {" "}{firestoreState.risks.length} risks
            </span>
          ) : null}
          {firestoreTestTaskId ? <span>Current Firestore test task: {firestoreTestTaskId}</span> : null}
          {firestoreTestRiskId ? <span>Current Firestore test risk: {firestoreTestRiskId}</span> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Project API Tests</h2>
            <p>Manual checks for server-backed project state, task, comment, risk, and reset routes.</p>
          </div>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => runProjectTest(async () => {
            await loadProjectState();
          })}>
            Check Project API Data Load
          </button>
          <button
            type="button"
            onClick={() => runProjectTest(async () => {
              const task = await getOrCreateTestTask();
              setResultMessage(`Created test task ${task.id}`);
            })}
          >
            Create Test Task
          </button>
          <button
            type="button"
            onClick={() => runProjectTest(async () => {
              const task = await getOrCreateTestTask();
              const result = await updateTask(task.id, { status: "in_progress" });

              setProjectState(result.state);
              setTestTaskId(result.task.id);
              setResultMessage(`Updated ${result.task.id} to ${result.task.status}`);
            })}
          >
            Update Test Task Status
          </button>
          <button
            type="button"
            onClick={() => runProjectTest(async () => {
              const task = await getOrCreateTestTask();
              const result = await addTaskComment(task.id, {
                authorId: "user_sarah",
                body: "System test comment added through the project API.",
                visibility: "internal"
              });

              setProjectState(result.state);
              setResultMessage(`Added comment ${result.comment.id} to ${task.id}`);
            })}
          >
            Add Test Comment
          </button>
          <button
            type="button"
            onClick={() => runProjectTest(async () => {
              const state = await getCurrentProjectState();
              const result = await createRisk({
                projectId: state.projects[0].id,
                title: "System test risk",
                severity: "medium",
                probability: "medium",
                status: "monitoring",
                mitigationPlan: "Validate through manual System Tests before next phase."
              });

              setProjectState(result.state);
              setResultMessage(`Created risk ${result.risk.id}`);
            })}
          >
            Create Test Risk
          </button>
          <button
            type="button"
            onClick={() => runProjectTest(async () => {
              const result = await resetProjectStateOnServer();

              setProjectState(result.state);
              setTestTaskId("");
              setResultMessage("Server project state reset to seed data");
            })}
          >
            Reset Server Project State
          </button>
        </div>
        <div className="test-readout">
          <strong>Latest project API result</strong>
          <span>{resultMessage || "No project API test has run yet."}</span>
          {projectState ? (
            <span>
              {projectState.projects.length} projects / {projectState.tasks.length} tasks /
              {" "}{countTasksByStatus(projectState, "in_progress")} in progress /
              {" "}{projectState.risks.length} risks
            </span>
          ) : null}
          {testTaskId ? <span>Current test task: {testTaskId}</span> : null}
        </div>
      </section>
    </div>
  );
}
