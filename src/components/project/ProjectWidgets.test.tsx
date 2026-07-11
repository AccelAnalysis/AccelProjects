/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Phase, ProjectRisk, Task, User } from "../../types";
import { RiskRegister, TaskDetailPanel } from "./ProjectWidgets";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("TaskDetailPanel", () => {
  it("uses the shared task editor drawer for edits and Escape close", async () => {
    const onUpdateTask = vi.fn();
    const onClose = vi.fn();

    render(
      <TaskDetailPanel
        task={task}
        phases={[phase]}
        users={[user]}
        comments={[]}
        canEdit={true}
        canAddComment={false}
        onClose={onClose}
        onUpdateTask={onUpdateTask}
        onAddComment={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "Task detail: First task" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Status"), "in_progress");

    expect(onUpdateTask).toHaveBeenCalledWith("task_a", { status: "in_progress" });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});

describe("RiskRegister", () => {
  it("shows Add Risk at the top and preserves risk creation", async () => {
    const onAddRisk = vi.fn();

    render(
      <RiskRegister
        risks={[risk]}
        canManage={true}
        onAddRisk={onAddRisk}
        onUpdateRisk={vi.fn()}
      />
    );

    const addRiskButton = screen.getByRole("button", { name: "Add Risk" });
    expect(addRiskButton.closest(".panel-header")).toBeInTheDocument();
    expect(screen.queryByLabelText("Risk title")).not.toBeInTheDocument();

    await userEvent.click(addRiskButton);
    await userEvent.type(screen.getByLabelText("Risk title"), "Scope risk");
    await userEvent.type(screen.getByLabelText("Mitigation plan"), "Confirm scope with client");
    await userEvent.click(screen.getByRole("button", { name: "Save Risk" }));

    expect(onAddRisk).toHaveBeenCalledWith(expect.objectContaining({
      title: "Scope risk",
      mitigationPlan: "Confirm scope with client"
    }));
  });
});

const phase: Phase = {
  id: "phase_1",
  projectId: "project_1",
  name: "Build",
  status: "active",
  startDate: "2028-02-01",
  endDate: "2028-02-28"
};

const task: Task = {
  id: "task_a",
  projectId: "project_1",
  phaseId: "phase_1",
  title: "First task",
  description: "Build the first task.",
  status: "not_started",
  priority: "medium",
  assigneeId: "user_1",
  startDate: "2028-02-05",
  dueDate: "2028-02-08",
  estimateHours: 4,
  completedAt: null
};

const user: User = {
  id: "user_1",
  organizationId: "org_1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "project_manager",
  avatarInitials: "AL"
};

const risk: ProjectRisk = {
  id: "risk_1",
  projectId: "project_1",
  title: "Existing risk",
  severity: "medium",
  probability: "medium",
  status: "monitoring",
  mitigationPlan: "Watch closely."
};
