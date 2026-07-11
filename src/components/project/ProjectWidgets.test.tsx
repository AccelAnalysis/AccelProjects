/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Phase, Task, User } from "../../types";
import { TaskDetailPanel } from "./ProjectWidgets";

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
