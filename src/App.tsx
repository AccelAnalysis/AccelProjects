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
  Upload,
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
import { ProjectImportPage } from "./pages/ProjectImportPage";
import { SystemTestsPage } from "./pages/SystemTestsPage";
import { TestPage } from "./pages/TestPage";
import {
  GlobalSearchResults,
  NewTaskForm,
  ProjectSelector,
  TaskDetailPanel
} from "./components/project/ProjectWidgets";
import {
  canAddTaskComment,
  canEditTask,
  canUseAdminPreview,
  getProjectPermissions,
  getUserRole
} from "./auth/permissions";
import { demoRoles, initialProjectState } from "./data/projectMockData";
import {
  addTaskCommentInFirestore,
  createRiskInFirestore,
  createTaskInFirestore,
  getFirestorePermissionMessage,
  loadCurrentUserProfileFromFirestore,
  loadProjectStateFromFirestore,
  resetFirestoreProjectState,
  seedProjectStateToFirestore,
  updateRiskInFirestore,
  updateTaskInFirestore
} from "./data/firestoreProjectStore";
import {
  loadAdminPreviewRole,
  loadSelectedProjectId,
  saveAdminPreviewRole,
  saveSelectedProjectId
} from "./data/projectStore";
import type { ProjectRisk, ProjectState, Task, User, UserRole } from "./types";
import accelLogo from "../Accel_GOH_Logo.png";

const navItems = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/projects", label: "Projects", icon: BriefcaseBusiness },
  { href: "/projects/import", label: "Import Project", icon: Upload },
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
  userProfile: User | null;
  canEdit: boolean;
  canManage: boolean;
  canAddTaskComments: boolean;
  canCreateTasks: boolean;
  canEditDocuments: boolean;
  canEditMetrics: boolean;
  canManageRisks: boolean;
  canViewInternal: boolean;
  clientPreview: boolean;
  canEditTask: (task: Task) => boolean;
  canAddTaskComment: (task: Task) => boolean;
  onOpenTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onCreateTask: (task: Omit<Task, "id" | "completedAt">) => void;
  onAddRisk: (risk: Pick<ProjectRisk, "title" | "severity" | "probability" | "status" | "mitigationPlan">) => void;
  onUpdateRisk: (riskId: string, updates: Partial<ProjectRisk>) => void;
  onResetProjectState: () => void;
  onSeedProjectState: () => void;
  onProjectImported: (projectId: string) => Promise<void>;
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

  if (path === "/projects/import") {
    return <ProjectImportPage {...props} />;
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
    </aside>
  );
}

function TopHeader({
  user,
  role,
  profileRole,
  userProfile,
  adminPreviewRole,
  adminPreviewAvailable,
  onAdminPreviewRoleChange,
  searchQuery,
  onSearchChange,
  onLogout
}: {
  user: FirebaseUser;
  role: UserRole;
  profileRole: UserRole;
  userProfile: User | null;
  adminPreviewRole: UserRole | "off";
  adminPreviewAvailable: boolean;
  onAdminPreviewRoleChange: (role: UserRole | "off") => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onLogout: () => void;
}) {
  const selectedRole = demoRoles.find((item) => item.role === role);
  const profileRoleLabel = demoRoles.find((item) => item.role === profileRole)?.label ?? profileRole;
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
        {adminPreviewAvailable ? (
          <label className="compact-field role-field">
            Admin Preview
            <select value={adminPreviewRole} onChange={(event) => onAdminPreviewRoleChange(event.target.value as UserRole | "off")}>
              <option value="off">Use my role</option>
              {demoRoles.map((item) => (
                <option key={item.role} value={item.role}>{item.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button className="icon-button" type="button" aria-label="Notifications">
          <Bell size={18} aria-hidden="true" />
          <span className="notification-dot" />
        </button>
        <div className="user-chip">
          <span className="user-avatar">{initials}</span>
          <span>
            <strong>{userProfile?.name ?? displayName}</strong>
            <small>
              {selectedRole?.label ?? profileRoleLabel}
              {adminPreviewAvailable && adminPreviewRole !== "off" ? ` admin preview / ${profileRoleLabel}` : ""}
            </small>
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
  const [projectNotice, setProjectNotice] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(loadSelectedProjectId);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [adminPreviewRole, setAdminPreviewRole] = useState<UserRole | "off">(loadAdminPreviewRole);
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
        const [profile, state] = await Promise.all([
          loadCurrentUserProfileFromFirestore(user),
          loadProjectStateFromFirestore(user)
        ]);

        if (!active) {
          return;
        }

        setUserProfile(profile);
        setProjectState(state);
        setSelectedProjectId((current) => (
          current && state.projects.some((project) => project.id === current) ? current : state.projects[0]?.id ?? ""
        ));
        setProjectError("");
      } catch (error) {
        if (active) {
          setProjectError(getFirestorePermissionMessage(error));
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
  const profileRole = getUserRole(userProfile);
  const adminPreviewAvailable = canUseAdminPreview(profileRole);
  const role = adminPreviewAvailable && adminPreviewRole !== "off" ? adminPreviewRole : profileRole;
  const permissions = getProjectPermissions(role, userProfile, selectedProject, projectState);
  const clientPreview = role === "client";
  const editable = permissions.canEditTasks && !clientPreview;
  const manageable = permissions.canManageProjects && !clientPreview;
  const currentPath = window.location.pathname;
  const routeNeedsProjectData = !["/projects/import", "/billing", "/system-tests", "/admin", "/test", "/payment-success", "/payment-cancel"].includes(currentPath);
  const routeUsesProjectHeader = !["/projects/import", "/billing", "/system-tests", "/admin", "/test", "/payment-success", "/payment-cancel"].includes(currentPath);
  const canEditCurrentTask = (task: Task) => canEditTask(role, userProfile, task, projectState);
  const canAddCommentToCurrentTask = (task: Task) => canAddTaskComment(role, userProfile, task, projectState);

  useEffect(() => {
    if (selectedProjectId) {
      saveSelectedProjectId(selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (!adminPreviewAvailable && adminPreviewRole !== "off") {
      setAdminPreviewRole("off");
      return;
    }

    saveAdminPreviewRole(adminPreviewRole);
  }, [adminPreviewAvailable, adminPreviewRole]);

  async function updateTask(taskId: string, updates: Partial<Task>) {
    const task = projectState.tasks.find((item) => item.id === taskId);

    if (!task || !canEditCurrentTask(task)) {
      setProjectError("Your Firestore profile role does not allow editing this task.");
      return;
    }

    try {
      await updateTaskInFirestore(taskId, updates);
      if (user) {
        syncProjectState(await loadProjectStateFromFirestore(user));
      }
      setProjectNotice("Task updated.");
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
    }
  }

  async function createTask(task: Omit<Task, "id" | "completedAt">) {
    if (!permissions.canCreateTasks) {
      setProjectError("Your Firestore profile role does not allow creating tasks for this project.");
      return;
    }

    try {
      const newTask = await createTaskInFirestore(task);
      if (user) {
        syncProjectState(await loadProjectStateFromFirestore(user));
      }
      setSelectedTaskId(newTask.id);
      setShowNewTaskForm(false);
      setProjectNotice("Task created.");
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
    }
  }

  async function addTaskComment(taskId: string, body: string) {
    const task = projectState.tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    if (!canAddCommentToCurrentTask(task)) {
      setProjectError("Your Firestore profile role does not allow adding comments to this task.");
      return;
    }

    if (!user) {
      setProjectError("Sign in before adding task comments.");
      return;
    }

    try {
      await addTaskCommentInFirestore(taskId, {
        authorId: userProfile?.id ?? user.uid,
        body,
        visibility: "internal"
      });

      if (user) {
        syncProjectState(await loadProjectStateFromFirestore(user));
      }
      setProjectNotice("Comment added.");
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
    }
  }

  async function addRisk(risk: Pick<ProjectRisk, "title" | "severity" | "probability" | "status" | "mitigationPlan">) {
    if (!selectedProject) {
      return;
    }

    if (!permissions.canManageRisks) {
      setProjectError("Your Firestore profile role does not allow creating project risks.");
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
      setProjectNotice("Risk created.");
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
    }
  }

  async function updateRisk(riskId: string, updates: Partial<ProjectRisk>) {
    if (!permissions.canManageRisks) {
      setProjectError("Your Firestore profile role does not allow editing project risks.");
      return;
    }

    try {
      await updateRiskInFirestore(riskId, updates);
      if (user) {
        syncProjectState(await loadProjectStateFromFirestore(user));
      }
      setProjectNotice("Risk updated.");
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
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
      setProjectNotice("Demo data reset.");
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
    }
  }

  async function seedProjectState() {
    try {
      await seedProjectStateToFirestore(initialProjectState);

      if (user) {
        syncProjectState(await loadProjectStateFromFirestore(user));
      }
      setProjectNotice("Demo data seeded.");
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
    }
  }

  async function reloadAfterProjectImport(projectId: string) {
    if (!user) {
      return;
    }

    const state = await loadProjectStateFromFirestore(user);
    syncProjectState(state);
    setSelectedProjectId(projectId);
    saveSelectedProjectId(projectId);
    setProjectNotice("Project import completed.");
  }

  const pageProps: ProjectPageProps = {
    projectState,
    selectedProjectId: selectedProject?.id ?? selectedProjectId,
    role,
    userProfile,
    canEdit: editable,
    canManage: manageable,
    canAddTaskComments: permissions.canAddTaskComments,
    canCreateTasks: permissions.canCreateTasks,
    canEditDocuments: permissions.canEditDocuments,
    canEditMetrics: permissions.canEditMetrics,
    canManageRisks: permissions.canManageRisks,
    canViewInternal: permissions.canViewInternal,
    clientPreview,
    canEditTask: canEditCurrentTask,
    canAddTaskComment: canAddCommentToCurrentTask,
    onOpenTask: setSelectedTaskId,
    onUpdateTask: updateTask,
    onCreateTask: createTask,
    onAddRisk: addRisk,
    onUpdateRisk: updateRisk,
    onResetProjectState: resetProjectState,
    onSeedProjectState: seedProjectState,
    onProjectImported: reloadAfterProjectImport
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
            profileRole={profileRole}
            userProfile={userProfile}
            adminPreviewRole={adminPreviewRole}
            adminPreviewAvailable={adminPreviewAvailable}
            onAdminPreviewRoleChange={setAdminPreviewRole}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
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
          profileRole={profileRole}
          userProfile={userProfile}
          adminPreviewRole={adminPreviewRole}
          adminPreviewAvailable={adminPreviewAvailable}
          onAdminPreviewRoleChange={setAdminPreviewRole}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onLogout={() => void logout()}
        />
        <main className="content-area">
          {projectError ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Project Data Error</h2>
                  <p>{projectError}</p>
                </div>
              </div>
            </section>
          ) : null}
          {projectNotice ? (
            <section className="panel notice-panel">
              <p>{projectNotice}</p>
            </section>
          ) : null}
          {projectState.projects.length === 0 && routeNeedsProjectData ? (
            <section className="panel empty-state">
              <div className="panel-header">
                <div>
                  <h1>No project data found.</h1>
                  <p>Seed demo project data to start testing AccelProjects.</p>
                </div>
              </div>
              <button className="action-button" type="button" onClick={() => void seedProjectState()}>
                Seed Demo Data
              </button>
            </section>
          ) : projectState.projects.length === 0 || !routeUsesProjectHeader ? (
            getRoute(pageProps)
          ) : (
            <>
              <ProjectHeader
                projectState={projectState}
                selectedProjectId={selectedProject?.id ?? selectedProjectId}
                onProjectChange={setSelectedProjectId}
                canEdit={permissions.canCreateTasks}
                onNewTask={() => setShowNewTaskForm(true)}
              />
              <GlobalSearchResults
                query={searchQuery}
                tasks={projectTasks}
                documents={projectState.documents.filter((document) => document.projectId === selectedProject?.id)}
                users={projectState.users}
                onOpenTask={setSelectedTaskId}
              />
              {showNewTaskForm && selectedProject && permissions.canCreateTasks ? (
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
          comments={projectState.taskComments.filter((comment) => (
            comment.taskId === selectedTask.id && (!clientPreview || comment.visibility === "client")
          ))}
          canEdit={canEditCurrentTask(selectedTask)}
          canAddComment={canAddCommentToCurrentTask(selectedTask)}
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
