export const projectTabs = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Plan" },
  { id: "tasks", label: "Tasks" },
  { id: "risks", label: "Risks" },
  { id: "files", label: "Files" },
  { id: "messages", label: "Messages" },
  { id: "metrics", label: "Metrics" },
  { id: "team", label: "Team" },
  { id: "settings", label: "Settings" }
] as const;

export type ProjectTabId = typeof projectTabs[number]["id"];

export const defaultProjectTab: ProjectTabId = "plan";

export const legacyProjectRouteMap: Record<string, ProjectTabId> = {
  "/timeline": "plan",
  "/tasks": "tasks",
  "/messages": "messages",
  "/documents": "files",
  "/metrics": "metrics"
};

export function isProjectTab(value: string | undefined): value is ProjectTabId {
  return Boolean(value && projectTabs.some((tab) => tab.id === value));
}

export function buildProjectPath(projectId: string, tab: ProjectTabId = defaultProjectTab) {
  return `/projects/${encodeURIComponent(projectId)}/${tab}`;
}

export function buildProjectCreateImportPath() {
  return "/projects/import";
}

export function buildProjectImportPath() {
  return buildProjectCreateImportPath();
}

export function buildProjectUpdatePath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/update`;
}

export function buildProjectVersionHistoryPath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/versions`;
}

export function parseProjectRoute(pathname: string): {
  type: "portfolio" | "import" | "update" | "legacy-project-import" | "workspace" | "version-history" | "invalid-tab" | "none";
  projectId?: string;
  tab?: ProjectTabId;
  attemptedTab?: string;
} {
  const [pathOnly] = pathname.split(/[?#]/);
  const segments = pathOnly.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));

  if (segments.length === 0 || segments[0] !== "projects") {
    return { type: "none" };
  }

  if (segments.length === 1) {
    return { type: "portfolio" };
  }

  if (segments[1] === "import" && segments.length === 2) {
    return { type: "import" };
  }

  const projectId = segments[1];
  const tab = segments[2] ?? defaultProjectTab;

  if (tab === "import") {
    return { type: "legacy-project-import", projectId };
  }

  if (tab === "update" && segments.length === 3) {
    return { type: "update", projectId };
  }

  if (tab === "versions" && segments.length === 3) {
    return { type: "version-history", projectId };
  }

  if (!isProjectTab(tab)) {
    return { type: "invalid-tab", projectId, attemptedTab: tab };
  }

  return { type: "workspace", projectId, tab };
}
