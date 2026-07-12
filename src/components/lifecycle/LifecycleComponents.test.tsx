// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordActionsMenu } from "./LifecycleComponents";
import { applyRecordLifecycle, previewRecordLifecycle } from "../../data/api";

vi.mock("../../data/api", () => ({ previewRecordLifecycle: vi.fn(), applyRecordLifecycle: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  vi.mocked(previewRecordLifecycle).mockResolvedValue({ projectRevision: 2, entityState: "active", previewToken: "preview", impact: { transition: [], reassign: [], removeRelationships: [], retainImmutable: [], blockers: [], warnings: [], requiresTypedConfirmation: false } });
  vi.mocked(applyRecordLifecycle).mockResolvedValue({ operation: {} as never, duplicate: false });
});
afterEach(cleanup);

describe("shared lifecycle UI", () => {
  it("never applies on the first click and requires impact preview", async () => {
    const user = userEvent.setup();
    render(<RecordActionsMenu actions={["trash"]} entityId="task_1" entityType="task" label="Draft task" onApplied={vi.fn()} projectId="project_1" projectRevision={2} role="project_manager" />);
    await user.click(screen.getByLabelText("Lifecycle actions for Draft task"));
    await user.click(screen.getByRole("menuitem", { name: "trash" }));
    expect(applyRecordLifecycle).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Reason/), "Duplicate task");
    await user.click(screen.getByRole("button", { name: "Preview impact" }));
    expect(previewRecordLifecycle).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Confirm trash" })).toBeEnabled();
  });

  it("closes on Escape without applying", async () => {
    const user = userEvent.setup();
    render(<RecordActionsMenu actions={["trash"]} entityId="task_1" entityType="task" label="Draft task" onApplied={vi.fn()} projectId="project_1" projectRevision={2} role="project_manager" />);
    await user.click(screen.getByLabelText("Lifecycle actions for Draft task"));
    await user.click(screen.getByRole("menuitem", { name: "trash" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(applyRecordLifecycle).not.toHaveBeenCalled();
  });
});
