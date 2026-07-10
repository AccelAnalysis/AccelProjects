import { describe, expect, it } from "vitest";
import { buildProjectPath, buildProjectVersionHistoryPath, parseProjectRoute } from "./projectRoutes";

describe("project route helpers", () => {
  it("parses project portfolio and import routes", () => {
    expect(parseProjectRoute("/projects")).toEqual({ type: "portfolio" });
    expect(parseProjectRoute("/projects/import")).toEqual({ type: "import" });
  });

  it("defaults bare project routes to plan", () => {
    expect(parseProjectRoute("/projects/project_1")).toEqual({
      type: "workspace",
      projectId: "project_1",
      tab: "plan"
    });
  });

  it("parses direct project tab links", () => {
    expect(parseProjectRoute("/projects/project_1/tasks")).toEqual({
      type: "workspace",
      projectId: "project_1",
      tab: "tasks"
    });
  });

  it("parses version history links outside the project tabs", () => {
    expect(parseProjectRoute("/projects/project_1/versions")).toEqual({
      type: "version-history",
      projectId: "project_1"
    });
  });

  it("flags unsupported project tabs", () => {
    expect(parseProjectRoute("/projects/project_1/nope")).toEqual({
      type: "invalid-tab",
      projectId: "project_1",
      attemptedTab: "nope"
    });
  });

  it("builds encoded project paths", () => {
    expect(buildProjectPath("project one", "metrics")).toBe("/projects/project%20one/metrics");
    expect(buildProjectVersionHistoryPath("project one")).toBe("/projects/project%20one/versions");
  });
});
