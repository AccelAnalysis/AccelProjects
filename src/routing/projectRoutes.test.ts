import { describe, expect, it } from "vitest";
import { buildProjectCreateImportPath, buildProjectPath, buildProjectUpdatePath, buildProjectVersionHistoryPath, parseProjectRoute } from "./projectRoutes";

describe("project route helpers", () => {
  it("parses project portfolio and import routes", () => {
    expect(parseProjectRoute("/projects")).toEqual({ type: "portfolio" });
    expect(parseProjectRoute("/projects/import")).toEqual({ type: "import" });
    expect(buildProjectCreateImportPath()).toBe("/projects/import");
  });

  it("parses existing-project update routes", () => {
    expect(parseProjectRoute("/projects/project_123/update")).toEqual({
      type: "update",
      projectId: "project_123"
    });
    expect(buildProjectUpdatePath("project_123")).toBe("/projects/project_123/update");
  });

  it("does not route legacy selected-project import to create import", () => {
    expect(parseProjectRoute("/projects/project_123/import")).toEqual({
      type: "legacy-project-import",
      projectId: "project_123"
    });
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
    expect(buildProjectUpdatePath("client/project one")).toBe("/projects/client%2Fproject%20one/update");
    expect(parseProjectRoute("/projects/client%2Fproject%20one/update")).toEqual({
      type: "update",
      projectId: "client/project one"
    });
  });
});
