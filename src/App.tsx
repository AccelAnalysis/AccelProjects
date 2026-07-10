import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  Gauge,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Users
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginPage } from "./auth/LoginPage";
import { AdminPage } from "./pages/AdminPage";
import { CustomerOrderPage } from "./pages/CustomerOrderPage";
import { DashboardPage } from "./pages/DashboardPage";
import {
  ClientsPage,
  DocumentsPage,
  MetricsPage,
  MessagesPage,
  ProjectsPage,
  SettingsPage,
  TasksPage,
  TimelinePage
} from "./pages/ProjectModulePages";
import { PaymentCancelPage } from "./pages/PaymentCancelPage";
import { PaymentSuccessPage } from "./pages/PaymentSuccessPage";
import { SystemTestsPage } from "./pages/SystemTestsPage";
import { TestPage } from "./pages/TestPage";
import {
  canEditProjects,
  canManageProjects,
  GlobalSearchResults,
  NewTaskForm,
  ProjectSelector,
  TaskDetailPanel
} from "./components/project/ProjectWidgets";
import { demoRoles, initialProjectState } from "./data/projectMockData";
import {
  addTaskCommentInFirestore,
  createRiskInFirestore,
  createTaskInFirestore,
  loadProjectStateFromFirestore,
  resetFirestoreProjectState,
  seedProjectStateToFirestore,
  updateRiskInFirestore,
  updateTaskInFirestore
} from "./data/firestoreProjectStore";
import {
  loadClientPreview,
  loadSelectedProjectId,
  loadSelectedRole,
  saveClientPreview,
  saveSelectedProjectId,
  saveSelectedRole
} from "./data/projectStore";
import type { ProjectRisk, ProjectState, Task, UserRole } from "./types";
import accelLogo from "../Accel_GOH_Logo.png";

const navItems = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/projects", label: "Projects", icon: BriefcaseBusiness },
  { href: "/tasks", label: "Tasks & Phases", icon: ClipboardList },
  { href: "/timeline", label: "Gantt & Timeline", icon: CalendarDays },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/documents", label: "Document Hub", icon: FileText },
  { href: "/metrics", label: "Metrics & Reports", icon: BarChart3 },
  { href: "/billing", label: "Billing", icon: ClipboardList },
  { href: "/system-tests", label: "System Tests", icon: FlaskConical },
  { href: "/settings", label: "Settings", icon: Settings }
];

export type ProjectPageProps = {
  projectState: ProjectState;
  selectedProjectId: string;
  role: UserRole;
  canEdit: boolean;
  canManage: boolean;
  clientPreview: boolean;
  onOpenTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onCreateTask: (task: Omit<Task, "id" | "completedAt">) => void;
  onAddRisk: (risk: Pick<ProjectRisk, "title" | "severity" | "probability" | "status" | "mitigationPlan">) => void;
  onUpdateRisk: (riskId: string, updates: Partial<ProjectRisk>) => void;
  onResetProjectState: () => void;
  onSeedProjectState: () => void;
};

const emptyProjectState: ProjectState = {
  users: [],
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
  activityEvents: []
};

function getRoute(props: ProjectPageProps) {
  const path = window.location.pathname;

  if (path === "/") {
    return <DashboardPage {...props} />;
  }

  if (path === "/projects") {
    return <ProjectsPage {...props} />;
  }

  if (path === "/tasks") {
    return <TasksPage {...props} />;
  }

  if (path === "/timeline") {
    return <TimelinePage {...props} />;
  }

  if (path === "/messages") {
    return <MessagesPage {...props} />;
  }

  if (path === "/clients") {
    return <ClientsPage {...props} />;
  }

  if (path === "/documents") {
    return <DocumentsPage {...props} />;
  }

  if (path === "/metrics") {
    return <MetricsPage {...props} />;
  }

  if (path === "/billing") {
    return <CustomerOrderPage />;
  }

  if (path === "/settings") {
    return <SettingsPage {...props} />;
  }

  if (path === "/system-tests") {
    return <SystemTestsPage />;
  }

  if (path === "/admin") {
    return <AdminPage />;
  }

  if (path === "/test") {
    return <TestPage />;
  }

  if (path === "/payment-success") {
    return <PaymentSuccessPage />;
  }

  if (path === "/payment-cancel") {
    return <PaymentCancelPage />;
  }

  return <DashboardPage {...props} />;
}

function isActiveRoute(href: string) {
  const path = window.location.pathname;

  if (href === "/") {
    return path === "/";
  }

  return path === href || (href === "/system-tests" && (path === "/admin" || path === "/test"));
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <a className="sidebar-brand" href="/">
        <span className="brand-logo">
          <img src={accelLogo} alt="AccelProjects" />
        </span>
        <span>
          <strong>AccelProjects</strong>
          <small>Project Operations</small>
        </span>
      </a>
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActiveRoute(item.href);

          return (
            <a className={active ? "sidebar-link active" : "sidebar-link"} href={item.href} key={item.href}>
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <span>Firebase Mode</span>
        <strong>Project edits persist through Firestore. Preview role and client-safe preferences stay in this browser.</strong>
      </div>
    </aside>
  );
}

function TopHeader({
  user,
  role,
  onRoleChange,
  searchQuery,
  onSearchChange,
  clientPreview,
  onClientPreviewChange,
  onLogout
}: {
  user: FirebaseUser;
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  clientPreview: boolean;
  onClientPreviewChange: (value: boolean) => void;
  onLogout: () => void;
}) {
  const selectedRole = demoRoles.find((item) => item.role === role);
  const displayName = user.displayName || user.email || "Signed-in user";
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AP";

  return (
    <header className="top-header">
      <label className="search-box" aria-label="Search">
        <Search size={18} aria-hidden="true" />
        <input
          placeholder="Search tasks, files, projects, or people..."
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <div className="top-header-actions">
        <label className="compact-field role-field">
          Preview Role
          <select value={role} onChange={(event) => onRoleChange(event.target.value as UserRole)}>
            {demoRoles.map((item) => (
              <option key={item.role} value={item.role}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="toggle-field">
          <input type="checkbox" checked={clientPreview} onChange={(event) => onClientPreviewChange(event.target.checked)} />
          Client-safe preview
        </label>
        <button className="icon-button" type="button" aria-label="Notifications">
          <Bell size={18} aria-hidden="true" />
          <span className="notification-dot" />
        </button>
        <div className="user-chip">
          <span className="user-avatar">{initials}</span>
          <span>
            <strong>{displayName}</strong>
            <small>{selectedRole?.label ?? "Project Manager"} preview</small>
          </span>
        </div>
        <button className="icon-button" type="button" aria-label="Sign out" onClick={onLogout}>
          <LogOut size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function ProjectHeader({
  projectState,
  selectedProjectId,
  onProjectChange,
  canEdit,
  onNewTask
}: {
  projectState: ProjectState;
  selectedProjectId: string;
  onProjectChange: (projectId: string) => void;
  canEdit: boolean;
  onNewTask: () => void;
}) {
  const project = projectState.projects.find((item) => item.id === selectedProjectId) ?? projectState.projects[0];
  const client = projectState.clients.find((item) => item.id === project.clientId);
  const owner = projectState.users.find((item) => item.id === project.ownerId);
  const tasks = projectState.tasks.filter((task) => task.projectId === project.id);
  const completeTasks = tasks.filter((task) => task.status === "done").length;
  const progress = tasks.length > 0 ? Math.round((completeTasks / tasks.length) * 100) : 0;

  return (
    <section className="project-header">
      <div>
        <p className="eyebrow">{client?.name ?? "Client"}</p>
        <div className="project-title-row">
          <h1>{project.name}</h1>
          <span className={`status-badge ${project.health === "at_risk" ? "warning" : "success"}`}>
            {project.health.replace("_", " ")}
          </span>
        </div>
        <p>{owner?.name ?? "Project owner"} owns delivery. {completeTasks}/{tasks.length} tasks complete.</p>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="project-header-actions">
        <ProjectSelector
          clients={projectState.clients}
          projects={projectState.projects}
          selectedProjectId={selectedProjectId}
          onProjectChange={onProjectChange}
        />
        {canEdit ? (
          <button className="action-button" type="button" onClick={onNewTask}>
            <Plus size={18} aria-hidden="true" />
            New Task
          </button>
        ) : null}
      </div>
    </section>
  );
}

function AppShell() {
  const { loading: authLoading, logout, user } = useAuth();
  const [projectState, setProjectState] = useState<ProjectState>(emptyProjectState);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(loadSelectedProjectId);
  const [role, setRole] = useState<UserRole>(loadSelectedRole);
  const [clientPreview, setClientPreview] = useState(loadClientPreview);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    let active = true;

    async function loadState() {
      try {
        const state = await loadProjectStateFromFirestore(user);

        if (!active) {
          return;
        }

        setProjectState(state);
        setSelectedProjectId((current) => (
          current && state.projects.some((project) => project.id === current) ? current : state.projects[0]?.id ?? ""
        ));
        setProjectError("");
      } catch (error) {
        if (active) {
          setProjectError(error instanceof Error ? error.message : "Unable to load project data from Firestore");
        }
      } finally {
        if (active) {
          setProjectLoading(false);
        }
      }
    }

    loadState();

    return () => {
      active = false;
    };
  }, [user]);

  function syncProjectState(state: ProjectState) {
    setProjectState(state);
    setSelectedProjectId((current) => (
      current && state.projects.some((project) => project.id === current) ? current : state.projects[0]?.id ?? ""
    ));
    setProjectError("");
  }

  const selectedProject = projectState.projects.find((project) => project.id === selectedProjectId) ?? projectState.projects[0];
  const projectPhases = useMemo(
    () => projectState.phases.filter((phase) => phase.projectId === selectedProject?.id),
    [projectState.phases, selectedProject?.id]
  );
  const projectTasks = useMemo(
    () => projectState.tasks.filter((task) => task.projectId === selectedProject?.id),
    [projectState.tasks, selectedProject?.id]
  );
  const selectedTask = selectedTaskId ? projectState.tasks.find((task) => task.id === selectedTaskId) : undefined;
  const editable = canEditProjects(role) && !clientPreview;
  const manageable = canManageProjects(role) && !clientPreview;
  const currentPath = window.location.pathname;
  const routeNeedsProjectData = !["/billing", "/system-tests", "/admin", "/test", "/payment-success", "/payment-cancel"].includes(currentPath);

  useEffect(() => {
    if (selectedProjectId) {
      saveSelectedProjectId(selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    saveSelectedRole(role);
  }, [role]);

  useEffect(() => {
    saveClientPreview(clientPreview);
  }, [clientPreview]);

  async function updateTask(taskId: string, updates: Partial<Task>) {
    try {
      await updateTaskInFirestore(taskId, updates);
      if (user) {
        syncProjectState(await loadProjectStateFromFirestore(user));
      }
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Unable to update task");
    }
  }

  async function createTask(task: Omit<Task, "id" | "completedAt">) {
    try {
      const newTask = await createTaskInFirestore(task);
      if (user) {
        syncProjectState(await loadProjectStateFromFirestore(user));
      }
      setSelectedTaskId(newTask.id);
      setShowNewTaskForm(false);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Unable to create task");
    }
  }

  async function addTaskComment(taskId: string, body: string) {
    const task = projectState.tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    try {
      await addTaskCommentInFirestore(taskId, {
        authorId: role === "client" ? "user_dana" : "user_sarah",
        body,
        visibility: role === "client" ? "client" : "internal"
      });

      if (user) {
        syncProjectState(await loadProjectStateFromFirestore(user));
      }
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Unable to add task comment");
    }
  }

  async function addRisk(risk: Pick<ProjectRisk, "title" | "severity" | "probability" | "status" | "mitigationPlan">) {
    if (!selectedProject) {
      return;
    }

    try {
      await createRiskInFirestore({
        projectId: selectedProject.id,
        ...risk
      });

      if (user) {
        syncProjectState(await loadProjectStateFromFirestore(user));
      }
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Unable to create risk");
    }
  }

  async function updateRisk(riskId: string, updates: Partial<ProjectRisk>) {
    try {
      await updateRiskInFirestore(riskId, updates);
      if (user) {
        syncProjectState(await loadProjectStateFromFirestore(user));
      }
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Unable to update risk");
    }
  }

  async function resetProjectState() {
    try {
      await resetFirestoreProjectState();
      await seedProjectStateToFirestore(initialProjectState);

      if (user) {
        syncProjectState(await loadProjectStateFromFirestore(user));
      }

      setSelectedTaskId(undefined);
      setShowNewTaskForm(false);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Unable to reset project state");
    }
  }

  async function seedProjectState() {
    try {
      await seedProjectStateToFirestore(initialProjectState);

      if (user) {
        syncProjectState(await loadProjectStateFromFirestore(user));
      }
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Unable to seed Firestore project data");
    }
  }

  const pageProps: ProjectPageProps = {
    projectState,
    selectedProjectId: selectedProject?.id ?? selectedProjectId,
    role,
    canEdit: editable,
    canManage: manageable,
    clientPreview,
    onOpenTask: setSelectedTaskId,
    onUpdateTask: updateTask,
    onCreateTask: createTask,
    onAddRisk: addRisk,
    onUpdateRisk: updateRisk,
    onResetProjectState: resetProjectState,
    onSeedProjectState: seedProjectState
  };

  if (authLoading) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <h1>Loading AccelProjects</h1>
          <p>Checking Firebase authentication status.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (projectLoading) {
    return (
      <div className="app-shell">
        <Sidebar />
        <div className="main-shell">
          <TopHeader
            user={user}
            role={role}
            onRoleChange={setRole}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            clientPreview={clientPreview}
            onClientPreviewChange={setClientPreview}
            onLogout={() => void logout()}
          />
          <main className="content-area">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h1>Loading project data</h1>
                  <p>Loading AccelProjects data from Firestore.</p>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-shell">
        <TopHeader
          user={user}
          role={role}
          onRoleChange={setRole}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          clientPreview={clientPreview}
          onClientPreviewChange={setClientPreview}
          onLogout={() => void logout()}
        />
        <main className="content-area">
          {projectError ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Firestore Project Data Error</h2>
                  <p>{projectError}</p>
                </div>
              </div>
            </section>
          ) : null}
          {projectState.projects.length === 0 && routeNeedsProjectData ? (
            <section className="panel empty-state">
              <div className="panel-header">
                <div>
                  <h1>No Firestore project data yet</h1>
                  <p>Seed the AccelProjects demo dataset to create the organization, clients, projects, tasks, comments, risks, documents, metrics, and activity records.</p>
                </div>
              </div>
              <button className="action-button" type="button" onClick={() => void seedProjectState()}>
                Seed Firestore Demo Data
              </button>
            </section>
          ) : projectState.projects.length === 0 ? (
            getRoute(pageProps)
          ) : (
            <>
              <ProjectHeader
                projectState={projectState}
                selectedProjectId={selectedProject?.id ?? selectedProjectId}
                onProjectChange={setSelectedProjectId}
                canEdit={editable}
                onNewTask={() => setShowNewTaskForm(true)}
              />
              <GlobalSearchResults
                query={searchQuery}
                tasks={projectTasks}
                documents={projectState.documents.filter((document) => document.projectId === selectedProject?.id)}
                users={projectState.users}
                onOpenTask={setSelectedTaskId}
              />
              {showNewTaskForm && selectedProject ? (
                <NewTaskForm
                  projectId={selectedProject.id}
                  phases={projectPhases}
                  users={projectState.users}
                  onCreateTask={createTask}
                  onCancel={() => setShowNewTaskForm(false)}
                />
              ) : null}
              {getRoute(pageProps)}
            </>
          )}
        </main>
      </div>
      {selectedTask ? (
        <TaskDetailPanel
          task={selectedTask}
          phases={projectState.phases}
          users={projectState.users}
          comments={projectState.taskComments.filter((comment) => comment.taskId === selectedTask.id)}
          canEdit={editable}
          onClose={() => setSelectedTaskId(undefined)}
          onUpdateTask={updateTask}
          onAddComment={addTaskComment}
        />
      ) : null}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export { App };
export default App;
