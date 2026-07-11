/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User as FirebaseUser } from "firebase/auth";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectContextBar, TopHeader } from "./App";
import type { ProjectState, User } from "./types";

afterEach(() => {
  cleanup();
});

describe("App shell stabilization", () => {
  it("keeps the global top header on the sticky layout layer", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.top-header\s*{[^}]*position:\s*sticky/s);
    expect(css).toMatch(/\.top-header\s*{[^}]*z-index:\s*80/s);
  });

  it("keeps Gantt hover states readable and sticky task columns above the timeline", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.plan-task-bar:hover,[\s\S]*?opacity:\s*1/s);
    expect(css).toMatch(/\.plan-hierarchy-header\s*{[^}]*z-index:\s*40/s);
    expect(css).toMatch(/\.plan-hierarchy-row\s*{[^}]*background:\s*var\(--ap-surface\)/s);
    expect(css).toMatch(/\.plan-timeline-body,[\s\S]*?overflow:\s*hidden/s);
  });

  it("opens the profile menu, closes on outside click and Escape, and logs out through the existing handler", async () => {
    const onLogout = vi.fn();
    const user = userEvent.setup();
    renderTopHeader({ onLogout });

    await user.click(screen.getByRole("button", { name: /Test User/ }));

    expect(screen.getByRole("menu", { name: "Profile menu" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View or Edit Profile" })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("menu", { name: "Profile menu" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Test User/ }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("menu", { name: "Profile menu" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Test User/ }));
    await user.click(screen.getByRole("menuitem", { name: "Log Out" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("keeps project switching functional without the duplicated always-visible dropdown", async () => {
    const onProjectChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ProjectContextBar
        projectState={projectState}
        selectedProjectId="project_a"
        onProjectChange={onProjectChange}
        activeTab="plan"
        canCreateTasks={true}
        canManage={true}
        onNewTask={vi.fn()}
        onExportProject={vi.fn().mockResolvedValue(undefined)}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("Project")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Switch project from Alpha Build"));
    await user.click(screen.getByRole("menuitem", { name: /Beta Launch/ }));

    expect(onProjectChange).toHaveBeenCalledWith("project_b");
  });
});

function renderTopHeader({ onLogout = vi.fn(), onNavigate = vi.fn() }: { onLogout?: () => void; onNavigate?: (path: string) => void } = {}) {
  return render(
    <TopHeader
      user={{ email: "test@example.com", displayName: "Test User" } as FirebaseUser}
      role="project_manager"
      profileRole="project_manager"
      userProfile={profile}
      adminPreviewRole="off"
      adminPreviewAvailable={false}
      onAdminPreviewRoleChange={vi.fn()}
      searchQuery=""
      onSearchChange={vi.fn()}
      onNavigate={onNavigate}
      onLogout={onLogout}
    />
  );
}

const profile: User = {
  id: "user_1",
  organizationId: "org",
  name: "Test User",
  email: "test@example.com",
  role: "project_manager",
  avatarInitials: "TU"
};

const projectState: ProjectState = {
  users: [profile],
  clients: [
    { id: "client_a", organizationId: "org", name: "Client A", contactName: "A", email: "a@example.com", phone: "555", status: "active" },
    { id: "client_b", organizationId: "org", name: "Client B", contactName: "B", email: "b@example.com", phone: "555", status: "active" }
  ],
  projects: [
    {
      id: "project_a",
      organizationId: "org",
      clientId: "client_a",
      name: "Alpha Build",
      summary: "Alpha",
      status: "active",
      health: "on_track",
      priority: "medium",
      startDate: "2028-01-01",
      targetDate: "2028-02-01",
      budget: 1000,
      currency: "usd",
      ownerId: "user_1",
      createdAt: "2028-01-01T00:00:00.000Z",
      updatedAt: "2028-01-01T00:00:00.000Z"
    },
    {
      id: "project_b",
      organizationId: "org",
      clientId: "client_b",
      name: "Beta Launch",
      summary: "Beta",
      status: "active",
      health: "at_risk",
      priority: "high",
      startDate: "2028-02-01",
      targetDate: "2028-03-01",
      budget: 1000,
      currency: "usd",
      ownerId: "user_1",
      createdAt: "2028-01-01T00:00:00.000Z",
      updatedAt: "2028-01-01T00:00:00.000Z"
    }
  ],
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
