import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { canUseAdminPreview, getUserRole } from "../auth/permissions";
import { auth, db, isFirebaseConfigured } from "../firebase";
import {
  addTaskCommentInFirestore,
  createRiskInFirestore,
  createTaskInFirestore,
  ensureFirestoreUserProfile,
  getFirestorePermissionMessage,
  loadCurrentUserProfileFromFirestore,
  loadProjectStateFromFirestore,
  resetFirestoreProjectState,
  seedProjectStateToFirestore,
  updateRiskInFirestore,
  updateTaskInFirestore
} from "../data/firestoreProjectStore";
import { checkProjectImportDuplicate, importProjectPackageToFirestore } from "../data/firestoreProjectImportStore";
import { initialProjectState } from "../data/projectMockData";
import { createProjectImportPlan, createProjectImportSourceHash } from "../imports/projectImportPlanner";
import { validateProjectImportPackage } from "../imports/projectImportValidator";
import sampleProjectImport from "../imports/fixtures/sampleProjectImport.json";
import type { ProjectRisk, ProjectState, Task, User } from "../types";

export function SystemTestsPage() {
  const { user } = useAuth();
  const [firestoreState, setFirestoreState] = useState<ProjectState | undefined>();
  const [firestoreUserProfile, setFirestoreUserProfile] = useState<User | undefined>();
  const [firestoreTestTaskId, setFirestoreTestTaskId] = useState("");
  const [firestoreTestRiskId, setFirestoreTestRiskId] = useState("");
  const [firebaseResultMessage, setFirebaseResultMessage] = useState("");
  const [importTestMessage, setImportTestMessage] = useState("");
  const effectiveRole = getUserRole(firestoreUserProfile);

  async function runFirebaseTest(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      setFirebaseResultMessage(getFirestorePermissionMessage(error));
    }
  }

  async function loadFirestoreProjectState() {
    if (!user) {
      throw new Error("Sign in before running Firestore tests.");
    }

    const [profile, state] = await Promise.all([
      loadCurrentUserProfileFromFirestore(user),
      loadProjectStateFromFirestore(user)
    ]);
    setFirestoreUserProfile(profile);
    setFirestoreState(state);
    setFirebaseResultMessage(`Loaded ${state.projects.length} projects and ${state.tasks.length} tasks from Firestore as ${profile.role}`);
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

  async function runImportPackageTest(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      setImportTestMessage(getFirestorePermissionMessage(error));
    }
  }

  async function getImportTestState() {
    if (!user) {
      throw new Error("Sign in before running import package tests.");
    }

    return firestoreState ?? loadFirestoreProjectState();
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
                ? `Configured. Auth UID: ${auth?.currentUser?.uid ?? "none"} / email: ${auth?.currentUser?.email ?? "none"} / Firestore: ${db ? "ready" : "not initialized"}`
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
            const profile = await loadCurrentUserProfileFromFirestore(user);
            setFirestoreUserProfile(profile);
            setFirebaseResultMessage(`User profile ready at organizations/org_accel_projects/users/${user.uid} with role ${profile.role}`);
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
          <span>Firebase UID: {user?.uid ?? "not signed in"}</span>
          <span>Firebase email: {user?.email ?? "not signed in"}</span>
          {firestoreUserProfile ? (
            <span>
              Firestore profile: {firestoreUserProfile.name} / {firestoreUserProfile.email} / {firestoreUserProfile.role}
            </span>
          ) : (
            <span>Firestore profile: not loaded</span>
          )}
          <span>Effective role: {effectiveRole}</span>
          <span>Admin preview available: {canUseAdminPreview(effectiveRole) ? "yes" : "no"}</span>
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
            <h2>Import Package Tests</h2>
            <p>Manual checks for the AccelProjects Project Package validator, planner, duplicate protection, and optional Firestore import.</p>
          </div>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => runImportPackageTest(async () => {
            setImportTestMessage(JSON.stringify(sampleProjectImport, null, 2));
          })}>
            Load Sample Fixture
          </button>
          <button type="button" onClick={() => runImportPackageTest(async () => {
            const validation = validateProjectImportPackage(sampleProjectImport);
            const errors = validation.issues.filter((issue) => issue.severity === "error").length;
            const warnings = validation.issues.filter((issue) => issue.severity === "warning").length;
            setImportTestMessage(`Sample validation: ${validation.package ? "valid" : "invalid"} / ${errors} errors / ${warnings} warnings`);
          })}>
            Validate Sample Fixture
          </button>
          <button type="button" onClick={() => runImportPackageTest(async () => {
            const state = await getImportTestState();
            const validation = validateProjectImportPackage(sampleProjectImport);

            if (!validation.package) {
              throw new Error("Sample fixture did not validate.");
            }

            const plan = createProjectImportPlan(validation.package, state);
            setImportTestMessage(`Proposed counts: ${JSON.stringify(plan.proposedCounts)}`);
          })}>
            Display Proposed Counts
          </button>
          <button type="button" onClick={() => runImportPackageTest(async () => {
            const invalidPackage = {
              ...sampleProjectImport,
              tasks: sampleProjectImport.tasks.map((task, index) => (
                index === 0 ? { ...task, phaseKey: "missing-phase" } : task
              ))
            };
            const validation = validateProjectImportPackage(invalidPackage);
            const rejected = validation.issues.some((issue) => issue.code === "missing_phase_reference");
            setImportTestMessage(rejected ? "Invalid fixture rejected for missing phase reference." : "Invalid fixture was not rejected.");
          })}>
            Confirm Invalid Rejection
          </button>
          <button className="danger-button" type="button" onClick={() => runImportPackageTest(async () => {
            if (!user) {
              throw new Error("Sign in before importing the sample fixture.");
            }

            const state = await getImportTestState();
            const validation = validateProjectImportPackage(sampleProjectImport);

            if (!validation.package) {
              throw new Error("Sample fixture did not validate.");
            }

            const plan = createProjectImportPlan(validation.package, state);
            const result = await importProjectPackageToFirestore({
              projectPackage: validation.package,
              projectState: state,
              overrides: {
                createClient: plan.clientResolution.action === "create",
                clientId: plan.clientResolution.selectedClientId,
                personUserIds: Object.fromEntries(plan.personResolutions.map((person) => [person.alias, person.selectedUserId])),
                projectOwnerUserId: plan.projectOwnerUserId
              }
            });
            const reloadedState = await loadFirestoreProjectState();
            const importedProject = reloadedState.projects.find((project) => project.id === result.projectId);
            setImportTestMessage(`WROTE TEST DATA. Imported ${result.projectName}. Reload check: ${importedProject ? "found" : "missing"}.`);
          })}>
            Write Sample Import to Firestore
          </button>
          <button type="button" onClick={() => runImportPackageTest(async () => {
            const state = await getImportTestState();
            const validation = validateProjectImportPackage(sampleProjectImport);

            if (!validation.package) {
              throw new Error("Sample fixture did not validate.");
            }

            const hash = await createProjectImportSourceHash(validation.package);
            const duplicate = await checkProjectImportDuplicate(validation.package, hash, state);
            setImportTestMessage(duplicate.duplicate ? `Duplicate import blocked for ${duplicate.existingManifest?.projectName}.` : "No duplicate manifest found for the sample fixture.");
          })}>
            Confirm Duplicate Block
          </button>
        </div>
        <div className="test-readout">
          <strong>Latest import package result</strong>
          <span>{importTestMessage || "No import package test has run yet."}</span>
        </div>
      </section>
    </div>
  );
}
