import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardList,
  Download,
  FlaskConical,
  Gauge,
  History,
  Home,
  Inbox,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserCircle,
  Users
} from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginPage } from "./auth/LoginPage";
import { AdminPage } from "./pages/AdminPage";
import { CustomerOrderPage } from "./pages/CustomerOrderPage";
import { HomePage } from "./pages/HomePage";
import {
  ClientsPage,
  DocumentsPage,
  LegacyProjectRoutePage,
  MetricsPage,
  MessagesPage,
  OverviewPage,
  PlaceholderPage,
  PlanPage,
  ProjectSettingsPage,
  ProjectsPage,
  RisksPage,
  SettingsPage,
  TasksPage,
  TeamPage,
  VersionHistoryPage
} from "./pages/ProjectModulePages";
import { PaymentCancelPage } from "./pages/PaymentCancelPage";
import { PaymentSuccessPage } from "./pages/PaymentSuccessPage";
import { ProjectImportPage } from "./pages/ProjectImportPage";
import { ProjectUpdatePage } from "./pages/ProjectUpdatePage";
import { SystemTestsPage } from "./pages/SystemTestsPage";
import { TestPage } from "./pages/TestPage";
import {
  GlobalSearchResults,
  NewTaskForm,
  TaskDetailPanel
} from "./components/project/ProjectWidgets";
import { GlobalNavigation } from "./components/layout/GlobalNavigation";
import {
  buildProjectPath,
  buildProjectUpdatePath,
  buildProjectVersionHistoryPath,
  defaultProjectTab,
  legacyProjectRouteMap,
  parseProjectRoute,
  projectTabs,
  type ProjectTabId
} from "./routing/projectRoutes";
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
  batchUpdateTaskSchedulesInFirestore,
  createMilestoneInFirestore,
  createProjectExportSnapshotInFirestore,
  createRiskInFirestore,
  createScheduleActivityEventInFirestore,
  createTaskInFirestore,
  createTaskDependencyInFirestore,
  deleteMilestoneInFirestore,
  deleteTaskDependencyInFirestore,
  ensureFirestoreUserProfile,
  getFirestorePermissionMessage,
  loadCurrentUserProfileFromFirestore,
  loadProjectStateFromFirestore,
  resetFirestoreProjectState,
  seedProjectStateToFirestore,
  updateMilestoneInFirestore,
  updateRiskInFirestore,
  updateTaskDependencyInFirestore,
  updateTaskInFirestore
} from "./data/firestoreProjectStore";
import {
  createCanonicalProjectExport,
  createProjectExportSnapshotId,
  hashProjectExport,
  stringifyCanonicalProjectExport
} from "./exports/projectExport";
import {
  loadAdminPreviewRole,
  loadSelectedProjectId,
  saveAdminPreviewRole,
  saveSelectedProjectId
} from "./data/projectStore";
import { validateDependencies } from "./scheduling/dependencyGraph";
import type { Milestone, ProjectActivityEvent, ProjectRisk, ProjectState, Task, TaskDependency, User, UserRole } from "./types";
import { formatDateOnly } from "./utils/dateOnly";
import accelLogo from "../Accel_GOH_Logo.png";

const primaryNavItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/my-work", label: "My Work", icon: ClipboardList },
  { href: "/projects", label: "Projects", icon: BriefcaseBusiness },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/portfolio", label: "Portfolio", icon: Gauge },
  { href: "/notifications", label: "Notifications", icon: Inbox }
];

const utilityNavItems = [
  { href: "/billing", label: "Billing", icon: ClipboardList },
  { href: "/system-tests", label: "System Tests", icon: FlaskConical },
  { href: "/settings", label: "Settings", icon: Settings }
];

export type ProjectPageProps = {
  projectState: ProjectState;
  selectedProjectId: string;
  activeProjectTab: ProjectTabId;
  role: UserRole;
  userProfile: User | null;
  canEdit: boolean;
  canManage: boolean;
  canAddTaskComments: boolean;
  canCreateTasks: boolean;
  canEditDocuments: boolean;
  canEditMetrics: boolean;
  canManageRisks: boolean;
  canManageSchedule: boolean;
  canViewInternal: boolean;
  clientPreview: boolean;
  canEditTask: (task: Task) => boolean;
  canAddTaskComment: (task: Task) => boolean;
  onOpenTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onCreateTask: (task: Omit<Task, "id" | "completedAt">) => void;
  onUpdateTaskSchedule: (taskId: string, updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId">) => Promise<void>;
  onBatchUpdateTaskSchedules: (updates: Array<{ taskId: string; updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId" | "assigneeId" | "status" | "priority"> }>, activityMessage: string) => Promise<void>;
  onCreateMilestone: (milestone: Omit<Milestone, "id">) => Promise<Milestone | null>;
  onUpdateMilestone: (milestoneId: string, updates: Partial<Milestone>) => Promise<void>;
  onDeleteMilestone: (milestoneId: string) => Promise<void>;
  onCreateDependency: (dependency: Omit<TaskDependency, "id">) => Promise<TaskDependency | null>;
  onUpdateDependency: (dependencyId: string, updates: Partial<TaskDependency>) => Promise<void>;
  onDeleteDependency: (dependencyId: string) => Promise<void>;
  onAddRisk: (risk: Pick<ProjectRisk, "title" | "severity" | "probability" | "status" | "mitigationPlan">) => void;
  onUpdateRisk: (riskId: string, updates: Partial<ProjectRisk>) => void;
  onResetProjectState: () => void;
  onSeedProjectState: () => void;
  onProjectImported: (projectId: string) => Promise<void>;
  onProjectUpdated: (projectId: string) => Promise<void>;
  onExportProject: (projectId: string) => Promise<void>;
  onNavigate: (path: string, options?: { replace?: boolean }) => void;
  onProjectChange: (projectId: string) => void;
  onNewTask: () => void;
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
  activityEvents: [],
  projectVersions: []
};

function getFatalDependencyValidationMessage(tasks: Task[], dependencies: TaskDependency[]) {
  return validateDependencies(tasks, dependencies)
    .filter((issue) => issue.severity === "fatal")
    .map((issue) => issue.message)
    .join(" ");
}

function getRoute(props: ProjectPageProps, pathname: string) {
  const path = pathname;
  const projectRoute = parseProjectRoute(path);

  if (projectRoute.type === "portfolio") {
    return <ProjectsPage {...props} />;
  }

  if (projectRoute.type === "import") {
    return <ProjectImportPage {...props} />;
  }

  if (projectRoute.type === "update") {
    return <ProjectUpdatePage {...props} />;
  }

  if (projectRoute.type === "legacy-project-import") {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Project import route changed</h1>
            <p>Selected-project file workflows now use Update via File. Import New Project remains available from the portfolio.</p>
          </div>
          <button className="action-button" type="button" onClick={() => props.onNavigate(buildProjectUpdatePath(projectRoute.projectId ?? props.selectedProjectId), { replace: true })}>
            Open Update via File
          </button>
        </div>
      </section>
    );
  }

  if (projectRoute.type === "version-history") {
    return <VersionHistoryPage {...props} />;
  }

  if (projectRoute.type === "invalid-tab") {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Project area not found</h1>
            <p>{projectRoute.attemptedTab ? `"${projectRoute.attemptedTab}" is not a supported project tab.` : "This project area is unavailable."}</p>
          </div>
          <button className="action-button" type="button" onClick={() => props.onNavigate(buildProjectPath(projectRoute.projectId ?? props.selectedProjectId, "plan"), { replace: true })}>
            Open Plan
          </button>
        </div>
      </section>
    );
  }

  if (projectRoute.type === "workspace") {
    if (!props.projectState.projects.some((project) => project.id === projectRoute.projectId)) {
      return (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h1>Project unavailable</h1>
              <p>This project was deleted, is inaccessible, or is not part of your workspace.</p>
            </div>
            <button className="action-button" type="button" onClick={() => props.onNavigate("/projects")}>
              Return to Projects
            </button>
          </div>
        </section>
      );
    }

    if (projectRoute.tab === "plan") {
      return <PlanPage {...props} />;
    }

    if (projectRoute.tab === "overview") {
      return <OverviewPage {...props} />;
    }

    if (projectRoute.tab === "tasks") {
      return <TasksPage {...props} />;
    }

    if (projectRoute.tab === "risks") {
      return <RisksPage {...props} />;
    }

    if (projectRoute.tab === "messages") {
      return <MessagesPage {...props} />;
    }

    if (projectRoute.tab === "files") {
      return <DocumentsPage {...props} />;
    }

    if (projectRoute.tab === "metrics") {
      return <MetricsPage {...props} />;
    }

    if (projectRoute.tab === "team") {
      return <TeamPage {...props} />;
    }

    if (projectRoute.tab === "settings") {
      return <ProjectSettingsPage {...props} />;
    }
  }

  if (path in legacyProjectRouteMap) {
    return <LegacyProjectRoutePage {...props} targetTab={legacyProjectRouteMap[path]} />;
  }

  if (path === "/") {
    return <HomePage {...props} />;
  }

  if (path === "/clients") {
    return <ClientsPage {...props} />;
  }

  if (path === "/my-work") {
    return <PlaceholderPage title="My Work" description="A cross-project view of assigned work will live here. For now, open a project Plan to manage tasks." />;
  }

  if (path === "/portfolio") {
    return <PlaceholderPage title="Portfolio" description="Portfolio-level reporting will expand here. Projects remains the entry point for individual project workspaces." />;
  }

  if (path === "/notifications") {
    return <PlaceholderPage title="Notifications" description="Project notifications and delivery alerts will be managed here in a later phase." />;
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

  return <HomePage {...props} />;
}

export function TopHeader({
  user,
  role,
  profileRole,
  userProfile,
  adminPreviewRole,
  adminPreviewAvailable,
  onAdminPreviewRoleChange,
  searchQuery,
  onSearchChange,
  onNavigate,
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
  onNavigate: (path: string) => void;
  onLogout: () => void;
}) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedRole = demoRoles.find((item) => item.role === role);
  const profileRoleLabel = demoRoles.find((item) => item.role === profileRole)?.label ?? profileRole;
  const displayName = user.displayName || user.email || "Signed-in user";
  const displayEmail = user.email ?? userProfile?.email ?? "";
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AP";

  useEffect(() => {
    if (!profileMenuOpen) {
      return undefined;
    }

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [profileMenuOpen]);

  function navigateFromProfileMenu(path: string) {
    setProfileMenuOpen(false);
    onNavigate(path);
  }

  function logoutFromProfileMenu() {
    setProfileMenuOpen(false);
    onLogout();
  }

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
        <button className="icon-button" type="button" aria-label="Notifications" onClick={() => onNavigate("/notifications")}>
          <Bell size={18} aria-hidden="true" />
          <span className="notification-dot" />
        </button>
        <div className="profile-menu-anchor" ref={menuRef}>
          <button
            className="user-chip profile-menu-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            onClick={() => setProfileMenuOpen((open) => !open)}
          >
            <span className="user-avatar">{initials}</span>
            <span>
              <strong>{userProfile?.name ?? displayName}</strong>
              <small>
                {selectedRole?.label ?? profileRoleLabel}
                {adminPreviewAvailable && adminPreviewRole !== "off" ? ` admin preview / ${profileRoleLabel}` : ""}
              </small>
            </span>
          </button>
          {profileMenuOpen ? (
            <div className="profile-menu" role="menu" aria-label="Profile menu">
              <div className="profile-menu-summary">
                <strong>{userProfile?.name ?? displayName}</strong>
                {displayEmail ? <span>{displayEmail}</span> : null}
              </div>
              <button type="button" role="menuitem" onClick={() => navigateFromProfileMenu("/settings")}>
                <UserCircle size={16} aria-hidden="true" />
                View or Edit Profile
              </button>
              <button type="button" role="menuitem" onClick={() => navigateFromProfileMenu("/settings")}>
                <Settings size={16} aria-hidden="true" />
                Account Settings
              </button>
              {role !== "client" ? (
                <button type="button" role="menuitem" onClick={() => navigateFromProfileMenu("/settings")}>
                  <ShieldCheck size={16} aria-hidden="true" />
                  Access Settings
                </button>
              ) : null}
              <button type="button" role="menuitem" onClick={() => navigateFromProfileMenu("/notifications")}>
                <Bell size={16} aria-hidden="true" />
                Notification Preferences
              </button>
              <div className="profile-menu-separator" />
              <button className="danger-menu-item" type="button" role="menuitem" onClick={logoutFromProfileMenu}>
                <LogOut size={16} aria-hidden="true" />
                Log Out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function ProjectContextBar({
  projectState,
  selectedProjectId,
  onProjectChange,
  activeTab,
  canCreateTasks,
  canManage,
  onNewTask,
  onExportProject,
  onNavigate
}: {
  projectState: ProjectState;
  selectedProjectId: string;
  onProjectChange: (projectId: string) => void;
  activeTab: ProjectTabId;
  canCreateTasks: boolean;
  canManage: boolean;
  onNewTask: () => void;
  onExportProject: (projectId: string) => Promise<void>;
  onNavigate: (path: string) => void;
}) {
  const project = projectState.projects.find((item) => item.id === selectedProjectId) ?? projectState.projects[0];
  const client = projectState.clients.find((item) => item.id === project.clientId);
  const owner = projectState.users.find((item) => item.id === project.ownerId);
  const tasks = projectState.tasks.filter((task) => task.projectId === project.id);
  const completeTasks = tasks.filter((task) => task.status === "done").length;
  const progress = tasks.length > 0 ? Math.round((completeTasks / tasks.length) * 100) : 0;
  const healthTone = project.health === "blocked" ? "danger" : project.health === "at_risk" ? "warning" : "success";
  const healthLabel = project.health === "blocked" ? "Blocked" : project.health === "at_risk" ? "At risk" : "On track";
  const switcherLabel = `Switch project from ${project.name}`;

  return (
    <section className="project-context-bar">
      <div className="project-context-main">
        <p className="project-breadcrumb">{client?.name ?? "Client"} / Project</p>
        <div className="project-title-row">
          <h1>{project.name}</h1>
          <details className="project-switcher-menu">
            <summary aria-label={switcherLabel} title="Switch project">
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <div className="project-switcher-popover" role="menu" aria-label="Switch project">
              {projectState.projects.map((candidate) => {
                const candidateClient = projectState.clients.find((item) => item.id === candidate.clientId);
                const selected = candidate.id === project.id;

                return (
                  <button
                    aria-current={selected ? "page" : undefined}
                    className={selected ? "active" : undefined}
                    key={candidate.id}
                    role="menuitem"
                    type="button"
                    onClick={() => onProjectChange(candidate.id)}
                  >
                    <span>{candidate.name}</span>
                    <small>{candidateClient?.name ?? "Client unavailable"}</small>
                  </button>
                );
              })}
            </div>
          </details>
          <span className={`status-badge ${healthTone}`}>
            {healthLabel}
          </span>
        </div>
        <p>{progress}% complete · Target {formatDateOnly(project.targetDate)} · Owner {owner?.name ?? "unassigned"}</p>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="project-header-actions">
        {canCreateTasks ? (
          <button className="action-button" type="button" onClick={onNewTask} title="Create a new task">
            <Plus size={18} aria-hidden="true" />
            New Task
          </button>
        ) : null}
        <details className="project-actions-menu">
          <summary aria-label="More project actions">
            <MoreHorizontal size={18} aria-hidden="true" />
          </summary>
          <div className="project-actions-popover">
            <button type="button" onClick={() => onNavigate(buildProjectPath(project.id, "settings"))}>Project Settings</button>
            <button type="button" onClick={() => onNavigate("/projects")}>Return to Projects</button>
            {canManage ? (
              <button type="button" onClick={() => void onExportProject(project.id)}>
                <Download size={16} aria-hidden="true" />
                Export Project
              </button>
            ) : null}
            <button type="button" onClick={() => onNavigate(buildProjectVersionHistoryPath(project.id))}>
              <History size={16} aria-hidden="true" />
              Version History
            </button>
            {canManage ? (
              <button type="button" onClick={() => onNavigate(buildProjectUpdatePath(project.id))}>
                Update via File
              </button>
            ) : null}
          </div>
        </details>
      </div>
    </section>
  );
}

function ProjectTabs({
  projectId,
  activeTab,
  onNavigate
}: {
  projectId: string;
  activeTab?: ProjectTabId;
  onNavigate: (path: string) => void;
}) {
  return (
    <nav className="project-tabs" aria-label="Project navigation">
      {projectTabs.map((tab) => (
        <a
          aria-current={tab.id === activeTab ? "page" : undefined}
          className={tab.id === activeTab ? "project-tab active" : "project-tab"}
          href={buildProjectPath(projectId, tab.id)}
          key={tab.id}
          onClick={(event) => {
            event.preventDefault();
            onNavigate(buildProjectPath(projectId, tab.id));
          }}
        >
          {tab.label}
        </a>
      ))}
    </nav>
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
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [globalNavCollapsed, setGlobalNavCollapsed] = useState(() => window.matchMedia?.("(max-width: 1180px)").matches ?? false);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(path: string, options?: { replace?: boolean }) {
    if (path === window.location.pathname) {
      return;
    }

    if (options?.replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    setPathname(window.location.pathname);
  }

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    let active = true;

    async function loadState() {
      try {
        await ensureFirestoreUserProfile(user);
        const [profile, state] = await Promise.all([
          loadCurrentUserProfileFromFirestore(user, { ensureProfile: false }),
          loadProjectStateFromFirestore(user, { ensureProfile: false })
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

  function withLocalProjectRevision(current: ProjectState, projectId: string): Pick<ProjectState, "projects"> {
    const now = new Date().toISOString();

    return {
      projects: current.projects.map((project) => (
        project.id === projectId
          ? {
            ...project,
            revision: (project.revision ?? 1) + 1,
            updatedAt: now,
            lastStructuralChangeAt: now
          }
          : project
      ))
    };
  }

  const projectRoute = parseProjectRoute(pathname);
  const routeProjectId = (projectRoute.type === "workspace" || projectRoute.type === "version-history" || projectRoute.type === "update" || projectRoute.type === "legacy-project-import" || projectRoute.type === "import" || projectRoute.type === "invalid-tab") ? projectRoute.projectId : undefined;
  const routeProject = routeProjectId ? projectState.projects.find((project) => project.id === routeProjectId) : undefined;
  const selectedProject = routeProject ?? projectState.projects.find((project) => project.id === selectedProjectId) ?? projectState.projects[0];
  const activeProjectTab = projectRoute.type === "workspace" ? projectRoute.tab ?? defaultProjectTab : defaultProjectTab;
  const routeIsValidProjectWorkspace = (projectRoute.type === "workspace" || projectRoute.type === "version-history" || projectRoute.type === "update" || projectRoute.type === "legacy-project-import") && Boolean(routeProject);
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
  const routeNeedsProjectData = projectRoute.type === "workspace" || projectRoute.type === "version-history" || projectRoute.type === "update" || projectRoute.type === "legacy-project-import" || projectRoute.type === "invalid-tab" || pathname in legacyProjectRouteMap;
  const canEditCurrentTask = (task: Task) => canEditTask(role, userProfile, task, projectState);
  const canAddCommentToCurrentTask = (task: Task) => canAddTaskComment(role, userProfile, task, projectState);

  useEffect(() => {
    if (selectedProjectId) {
      saveSelectedProjectId(selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (projectLoading || projectState.projects.length === 0) {
      return;
    }

    if (routeProject && routeProject.id !== selectedProjectId) {
      setSelectedProjectId(routeProject.id);
      saveSelectedProjectId(routeProject.id);
    }

    if (projectRoute.type === "workspace" && routeProject && !pathname.endsWith(`/${projectRoute.tab ?? defaultProjectTab}`)) {
      navigate(buildProjectPath(routeProject.id, projectRoute.tab ?? defaultProjectTab), { replace: true });
    }

    if (pathname in legacyProjectRouteMap && selectedProject?.id) {
      navigate(buildProjectPath(selectedProject.id, legacyProjectRouteMap[pathname]), { replace: true });
    }
  }, [pathname, projectLoading, projectRoute, projectState.projects.length, routeProject, selectedProject?.id, selectedProjectId]);

  useEffect(() => {
    setSelectedTaskId(undefined);
    setShowNewTaskForm(false);
  }, [routeIsValidProjectWorkspace ? selectedProject?.id : "no-project-workspace"]);

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
      await updateTaskInFirestore(taskId, updates, task.projectId);
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

  async function logScheduleActivity(projectId: string, message: string, metadata: Record<string, unknown> = {}) {
    if (!user) {
      return null;
    }

    return createScheduleActivityEventInFirestore({
      projectId,
      actorId: userProfile?.id ?? user.uid,
      type: "schedule_updated",
      message,
      metadata
    });
  }

  async function updateTaskSchedule(taskId: string, updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId">) {
    const task = projectState.tasks.find((item) => item.id === taskId);

    if (!task || !canEditCurrentTask(task)) {
      setProjectError("Your Firestore profile role does not allow scheduling this task.");
      throw new Error("Task schedule permission denied.");
    }

    try {
      await updateTaskInFirestore(taskId, updates, task.projectId);
      const event = await logScheduleActivity(task.projectId, `Updated schedule for ${task.title}.`, { taskId, updates });
      setProjectState((current) => ({
        ...current,
        ...withLocalProjectRevision(current, task.projectId),
        tasks: current.tasks.map((item) => item.id === taskId ? { ...item, ...updates } : item),
        activityEvents: event ? [...current.activityEvents, event] : current.activityEvents
      }));
      setProjectNotice("Schedule updated.");
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
      throw error;
    }
  }

  async function batchUpdateTaskSchedules(
    updates: Array<{ taskId: string; updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId" | "assigneeId" | "status" | "priority"> }>,
    activityMessage: string
  ) {
    const tasks = updates.map((item) => projectState.tasks.find((task) => task.id === item.taskId));

    if (tasks.some((task) => !task || !canEditCurrentTask(task))) {
      setProjectError("Your Firestore profile role does not allow one or more selected task updates.");
      throw new Error("Bulk schedule permission denied.");
    }

    const projectId = tasks.find(Boolean)?.projectId;

    try {
      await batchUpdateTaskSchedulesInFirestore(updates, projectId);
      const event = projectId ? await logScheduleActivity(projectId, activityMessage, { taskCount: updates.length }) : null;
      setProjectState((current) => ({
        ...current,
        ...(projectId ? withLocalProjectRevision(current, projectId) : {}),
        tasks: current.tasks.map((task) => {
          const update = updates.find((item) => item.taskId === task.id);
          return update ? { ...task, ...update.updates } : task;
        }),
        activityEvents: event ? [...current.activityEvents, event] : current.activityEvents
      }));
      setProjectNotice(activityMessage);
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
      throw error;
    }
  }

  async function createMilestone(milestone: Omit<Milestone, "id">) {
    if (!permissions.canManageSchedule) {
      setProjectError("Your Firestore profile role does not allow managing milestones.");
      return null;
    }

    try {
      const created = await createMilestoneInFirestore(milestone);
      const event = await logScheduleActivity(milestone.projectId, `Created milestone ${milestone.name}.`, { milestoneId: created.id });
      setProjectState((current) => ({
        ...current,
        ...withLocalProjectRevision(current, milestone.projectId),
        milestones: [...current.milestones, created],
        activityEvents: event ? [...current.activityEvents, event] : current.activityEvents
      }));
      setProjectNotice("Milestone created.");
      return created;
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
      return null;
    }
  }

  async function updateMilestone(milestoneId: string, updates: Partial<Milestone>) {
    const milestone = projectState.milestones.find((item) => item.id === milestoneId);

    if (!permissions.canManageSchedule || !milestone) {
      setProjectError("Your Firestore profile role does not allow managing milestones.");
      throw new Error("Milestone permission denied.");
    }

    try {
      await updateMilestoneInFirestore(milestoneId, updates, milestone.projectId);
      const event = await logScheduleActivity(milestone.projectId, `Updated milestone ${milestone.name}.`, { milestoneId, updates });
      setProjectState((current) => ({
        ...current,
        ...withLocalProjectRevision(current, milestone.projectId),
        milestones: current.milestones.map((item) => item.id === milestoneId ? { ...item, ...updates } : item),
        activityEvents: event ? [...current.activityEvents, event] : current.activityEvents
      }));
      setProjectNotice("Milestone updated.");
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
      throw error;
    }
  }

  async function deleteMilestone(milestoneId: string) {
    const milestone = projectState.milestones.find((item) => item.id === milestoneId);

    if (!permissions.canManageSchedule || !milestone) {
      setProjectError("Your Firestore profile role does not allow managing milestones.");
      throw new Error("Milestone permission denied.");
    }

    try {
      await deleteMilestoneInFirestore(milestoneId, milestone.projectId);
      const event = await logScheduleActivity(milestone.projectId, `Deleted milestone ${milestone.name}.`, { milestoneId });
      setProjectState((current) => ({
        ...current,
        ...withLocalProjectRevision(current, milestone.projectId),
        milestones: current.milestones.filter((item) => item.id !== milestoneId),
        activityEvents: event ? [...current.activityEvents, event] : current.activityEvents
      }));
      setProjectNotice("Milestone deleted.");
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
      throw error;
    }
  }

  async function createDependency(dependency: Omit<TaskDependency, "id">) {
    if (!permissions.canManageSchedule) {
      setProjectError("Your Firestore profile role does not allow managing dependencies.");
      return null;
    }

    try {
      const proposedDependency: TaskDependency = { id: "pending_dependency", ...dependency };
      const validationMessage = getFatalDependencyValidationMessage(projectState.tasks, [...projectState.taskDependencies, proposedDependency]);

      if (validationMessage) {
        setProjectError(validationMessage);
        return null;
      }

      const task = projectState.tasks.find((item) => item.id === dependency.taskId);
      const created = await createTaskDependencyInFirestore(dependency, task?.projectId);
      const event = task ? await logScheduleActivity(task.projectId, "Created task dependency.", { dependencyId: created.id }) : null;
      setProjectState((current) => ({
        ...current,
        ...(task ? withLocalProjectRevision(current, task.projectId) : {}),
        taskDependencies: [...current.taskDependencies, created],
        activityEvents: event ? [...current.activityEvents, event] : current.activityEvents
      }));
      setProjectNotice("Dependency created.");
      return created;
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
      return null;
    }
  }

  async function updateDependency(dependencyId: string, updates: Partial<TaskDependency>) {
    if (!permissions.canManageSchedule) {
      setProjectError("Your Firestore profile role does not allow managing dependencies.");
      throw new Error("Dependency permission denied.");
    }

    const dependency = projectState.taskDependencies.find((item) => item.id === dependencyId);

    if (!dependency) {
      setProjectError("Dependency no longer exists.");
      throw new Error("Dependency not found.");
    }

    const updatedDependency = { ...dependency, ...updates };
    const task = projectState.tasks.find((item) => item.id === updatedDependency.taskId);

    try {
      const nextDependencies = projectState.taskDependencies.map((item) => item.id === dependencyId ? updatedDependency : item);
      const validationMessage = getFatalDependencyValidationMessage(projectState.tasks, nextDependencies);

      if (validationMessage) {
        setProjectError(validationMessage);
        throw new Error(validationMessage);
      }

      await updateTaskDependencyInFirestore(dependencyId, updates, task?.projectId);
      const event = task ? await logScheduleActivity(task.projectId, "Updated task dependency.", { dependencyId, updates }) : null;
      setProjectState((current) => ({
        ...current,
        ...(task ? withLocalProjectRevision(current, task.projectId) : {}),
        taskDependencies: current.taskDependencies.map((item) => item.id === dependencyId ? { ...item, ...updates } : item),
        activityEvents: event ? [...current.activityEvents, event] : current.activityEvents
      }));
      setProjectNotice("Dependency updated.");
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
      throw error;
    }
  }

  async function deleteDependency(dependencyId: string) {
    if (!permissions.canManageSchedule) {
      setProjectError("Your Firestore profile role does not allow managing dependencies.");
      throw new Error("Dependency permission denied.");
    }

    const dependency = projectState.taskDependencies.find((item) => item.id === dependencyId);
    const task = dependency ? projectState.tasks.find((item) => item.id === dependency.taskId) : undefined;

    try {
      await deleteTaskDependencyInFirestore(dependencyId, task?.projectId);
      const event = task ? await logScheduleActivity(task.projectId, "Deleted task dependency.", { dependencyId }) : null;
      setProjectState((current) => ({
        ...current,
        ...(task ? withLocalProjectRevision(current, task.projectId) : {}),
        taskDependencies: current.taskDependencies.filter((item) => item.id !== dependencyId),
        activityEvents: event ? [...current.activityEvents, event] : current.activityEvents
      }));
      setProjectNotice("Dependency deleted.");
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
      throw error;
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
      const risk = projectState.risks.find((item) => item.id === riskId);
      await updateRiskInFirestore(riskId, updates, risk?.projectId);
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
    navigate(buildProjectPath(projectId, "plan"));
    setProjectNotice("Project import completed.");
  }

  async function reloadAfterProjectUpdate(projectId: string) {
    if (!user) {
      return;
    }

    const state = await loadProjectStateFromFirestore(user);
    syncProjectState(state);
    setSelectedProjectId(projectId);
    saveSelectedProjectId(projectId);
    setProjectNotice("Project update completed.");
  }

  async function exportProject(projectId: string) {
    if (!manageable) {
      setProjectError("Your Firestore profile role does not allow exporting this project.");
      return;
    }

    try {
      const exportState = user ? await loadProjectStateFromFirestore(user) : projectState;
      const projectPackage = createCanonicalProjectExport(exportState, projectId, new Date().toISOString(), {
        exportSnapshotId: createProjectExportSnapshotId()
      });
      const packageJson = stringifyCanonicalProjectExport(projectPackage);
      const sourceHash = await hashProjectExport(projectPackage);
      await createProjectExportSnapshotInFirestore({
        projectId,
        sourceHash,
        packageJson,
        projectPackage
      });

      syncProjectState(exportState);

      const fileSlug = projectPackage.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
      const blob = new Blob([packageJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileSlug}-r${projectPackage.baseRevision}.accelproject-export.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setProjectNotice(`Exported ${projectPackage.project.name} at revision ${projectPackage.baseRevision}.`);
    } catch (error) {
      setProjectError(getFirestorePermissionMessage(error));
    }
  }

  const pageProps: ProjectPageProps = {
    projectState,
    selectedProjectId: selectedProject?.id ?? selectedProjectId,
    activeProjectTab,
    role,
    userProfile,
    canEdit: editable,
    canManage: manageable,
    canAddTaskComments: permissions.canAddTaskComments,
    canCreateTasks: permissions.canCreateTasks,
    canEditDocuments: permissions.canEditDocuments,
    canEditMetrics: permissions.canEditMetrics,
    canManageRisks: permissions.canManageRisks,
    canManageSchedule: permissions.canManageSchedule,
    canViewInternal: permissions.canViewInternal,
    clientPreview,
    canEditTask: canEditCurrentTask,
    canAddTaskComment: canAddCommentToCurrentTask,
    onOpenTask: setSelectedTaskId,
    onUpdateTask: updateTask,
    onCreateTask: createTask,
    onUpdateTaskSchedule: updateTaskSchedule,
    onBatchUpdateTaskSchedules: batchUpdateTaskSchedules,
    onCreateMilestone: createMilestone,
    onUpdateMilestone: updateMilestone,
    onDeleteMilestone: deleteMilestone,
    onCreateDependency: createDependency,
    onUpdateDependency: updateDependency,
    onDeleteDependency: deleteDependency,
    onAddRisk: addRisk,
    onUpdateRisk: updateRisk,
    onResetProjectState: resetProjectState,
    onSeedProjectState: seedProjectState,
    onProjectImported: reloadAfterProjectImport,
    onProjectUpdated: reloadAfterProjectUpdate,
    onExportProject: exportProject,
    onNavigate: navigate,
    onProjectChange: (projectId: string) => {
      setSelectedProjectId(projectId);
      saveSelectedProjectId(projectId);
      setSelectedTaskId(undefined);
      setShowNewTaskForm(false);
      navigate(buildProjectPath(projectId, activeProjectTab));
    },
    onNewTask: () => setShowNewTaskForm(true)
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
        <GlobalNavigation
          pathname={pathname}
          primaryItems={primaryNavItems}
          utilityItems={utilityNavItems}
          collapsed={globalNavCollapsed}
          brandLogo={accelLogo}
          onCollapsedChange={setGlobalNavCollapsed}
          onNavigate={navigate}
        />
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
            onNavigate={navigate}
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
      <GlobalNavigation
        pathname={pathname}
        primaryItems={primaryNavItems}
        utilityItems={utilityNavItems}
        collapsed={globalNavCollapsed}
        brandLogo={accelLogo}
        onCollapsedChange={setGlobalNavCollapsed}
        onNavigate={navigate}
      />
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
          onNavigate={navigate}
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
          ) : projectState.projects.length === 0 || !routeIsValidProjectWorkspace ? (
            <>
              <GlobalSearchResults
                query={searchQuery}
                tasks={selectedProject ? projectTasks : []}
                documents={selectedProject ? projectState.documents.filter((document) => document.projectId === selectedProject.id) : []}
                users={projectState.users}
                onOpenTask={setSelectedTaskId}
              />
              {getRoute(pageProps, pathname)}
            </>
          ) : (
            <>
              <ProjectContextBar
                projectState={projectState}
                selectedProjectId={selectedProject?.id ?? selectedProjectId}
                onProjectChange={pageProps.onProjectChange}
                activeTab={activeProjectTab}
                canCreateTasks={permissions.canCreateTasks}
                canManage={manageable}
                onNewTask={() => setShowNewTaskForm(true)}
                onExportProject={exportProject}
                onNavigate={navigate}
              />
              <ProjectTabs
                projectId={selectedProject.id}
                activeTab={projectRoute.type === "workspace" ? activeProjectTab : undefined}
                onNavigate={navigate}
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
              {getRoute(pageProps, pathname)}
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
