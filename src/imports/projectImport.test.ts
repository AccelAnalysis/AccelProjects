import { describe, expect, it } from "vitest";
import { initialProjectState } from "../data/projectMockData";
import { hasDuplicateProjectImport } from "../data/firestoreProjectImportStore";
import { createProjectImportPlan, createProjectImportSourceHash } from "./projectImportPlanner";
import { parseAndValidateProjectImportText, validateProjectImportPackage } from "./projectImportValidator";
import sampleProjectImport from "./fixtures/sampleProjectImport.json";
import type { ProjectImportManifest, ProjectImportPackage } from "./projectImportTypes";

function cloneSample() {
  return JSON.parse(JSON.stringify(sampleProjectImport)) as Record<string, unknown>;
}

function validate(value: unknown) {
  return validateProjectImportPackage(value);
}

function issueCodes(value: unknown) {
  return validate(value).issues.map((issue) => issue.code);
}

function getTasks(record: Record<string, unknown>) {
  return record.tasks as Array<Record<string, unknown>>;
}

describe("project import validation", () => {
  it("accepts the sample package without fatal validation errors", () => {
    const result = validate(sampleProjectImport);

    expect(result.package).not.toBeNull();
    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
    expect(result.issues.some((issue) => issue.code === "package_assumption")).toBe(true);
  });

  it("reports malformed JSON", () => {
    const result = parseAndValidateProjectImportText("{not json");

    expect(result.package).toBeNull();
    expect(result.issues[0]?.code).toBe("malformed_json");
  });

  it("rejects unsupported schema versions", () => {
    const pkg = cloneSample();
    pkg.schemaVersion = "2.0";

    expect(issueCodes(pkg)).toContain("unsupported_schema_version");
  });

  it("rejects missing required values", () => {
    const pkg = cloneSample();
    delete pkg.packageId;

    expect(issueCodes(pkg)).toContain("required_string");
  });

  it("rejects invalid enum values", () => {
    const pkg = cloneSample();
    (pkg.project as Record<string, unknown>).status = "started";

    expect(issueCodes(pkg)).toContain("invalid_enum");
  });

  it("rejects duplicate task keys", () => {
    const pkg = cloneSample();
    const tasks = getTasks(pkg);
    tasks[1].key = tasks[0].key;

    expect(issueCodes(pkg)).toContain("duplicate_key");
  });

  it("rejects missing phase references", () => {
    const pkg = cloneSample();
    getTasks(pkg)[0].phaseKey = "missing-phase";

    expect(issueCodes(pkg)).toContain("missing_phase_reference");
  });

  it("rejects missing dependency targets", () => {
    const pkg = cloneSample();
    const task = getTasks(pkg)[1];
    task.dependencies = [{ dependsOnTaskKey: "missing-task", type: "finish_to_start" }];

    expect(issueCodes(pkg)).toContain("missing_dependency_target");
  });

  it("rejects self dependencies", () => {
    const pkg = cloneSample();
    const task = getTasks(pkg)[0];
    task.dependencies = [{ dependsOnTaskKey: task.key, type: "finish_to_start" }];

    expect(issueCodes(pkg)).toContain("self_dependency");
  });

  it("rejects circular dependencies", () => {
    const pkg = cloneSample();
    const tasks = getTasks(pkg);
    tasks[0].dependencies = [{ dependsOnTaskKey: tasks[1].key, type: "finish_to_start" }];
    tasks[1].dependencies = [{ dependsOnTaskKey: tasks[0].key, type: "finish_to_start" }];

    expect(issueCodes(pkg)).toContain("circular_dependency");
  });

  it("warns for unassigned tasks", () => {
    expect(issueCodes(sampleProjectImport)).toContain("missing_assignee");
  });

  it("rejects invalid date ordering", () => {
    const pkg = cloneSample();
    (pkg.project as Record<string, unknown>).targetDate = "2026-07-01";

    expect(issueCodes(pkg)).toContain("invalid_project_date_order");
  });
});

describe("project import planning", () => {
  it("matches clients by exact normalized email", () => {
    const pkg = cloneSample();
    const client = pkg.client as Record<string, unknown>;
    client.email = "  DANA@HAMPTON.EXAMPLE ";
    client.name = "Different Name";
    const result = validate(pkg);

    expect(result.package).not.toBeNull();
    const plan = createProjectImportPlan(result.package as ProjectImportPackage, initialProjectState);

    expect(plan.clientResolution.action).toBe("match_existing");
    expect(plan.clientResolution.selectedClientId).toBe("client_hampton");
    expect(plan.clientResolution.matchedBy).toBe("email");
  });

  it("matches people by exact normalized email", () => {
    const result = validate(sampleProjectImport);
    const plan = createProjectImportPlan(result.package as ProjectImportPackage, initialProjectState);
    const pm = plan.personResolutions.find((person) => person.alias === "pm");

    expect(pm?.selectedUserId).toBe("user_sarah");
    expect(pm?.status).toBe("matched");
  });

  it("calculates proposed counts", () => {
    const result = validate(sampleProjectImport);
    const plan = createProjectImportPlan(result.package as ProjectImportPackage, initialProjectState);

    expect(plan.proposedCounts).toMatchObject({
      clients: 1,
      projects: 1,
      members: 1,
      phases: 2,
      milestones: 1,
      tasks: 4,
      dependencies: 3,
      risks: 1,
      documents: 1,
      metrics: 2
    });
  });

  it("detects duplicate package manifests by package ID or source hash", () => {
    const manifests = [{
      id: "import_1",
      organizationId: "org_accel_projects",
      packageId: "fixture-community-analytics-launch-2026-07-10",
      packageType: "accelprojects.project",
      schemaVersion: "1.0",
      projectId: "project_1",
      clientId: "client_1",
      mode: "create",
      sourceHash: "abc",
      status: "completed",
      createdBy: "user_sarah",
      createdAt: "2026-07-10T12:00:00.000Z",
      completedAt: "2026-07-10T12:01:00.000Z",
      entityMap: {
        clientExternalKey: "client",
        projectExternalKey: "project",
        phaseIds: {},
        milestoneIds: {},
        taskIds: {},
        riskIds: {},
        documentIds: {},
        metricIds: {},
        personUserIds: {}
      },
      counts: {},
      warnings: [],
      errorMessage: ""
    }] satisfies ProjectImportManifest[];

    expect(hasDuplicateProjectImport(manifests, "fixture-community-analytics-launch-2026-07-10", "different")).toBe(true);
    expect(hasDuplicateProjectImport(manifests, "different", "abc")).toBe(true);
    expect(hasDuplicateProjectImport(manifests, "different", "different")).toBe(false);
  });

  it("hashes canonical package content stably", async () => {
    const result = validate(sampleProjectImport);
    const packageOne = result.package as ProjectImportPackage;
    const packageTwo = {
      packageId: packageOne.packageId,
      packageType: packageOne.packageType,
      schemaVersion: packageOne.schemaVersion,
      source: packageOne.source,
      client: packageOne.client,
      project: packageOne.project,
      people: packageOne.people,
      phases: packageOne.phases,
      milestones: packageOne.milestones,
      tasks: packageOne.tasks,
      risks: packageOne.risks,
      documents: packageOne.documents,
      metrics: packageOne.metrics,
      assumptions: packageOne.assumptions,
      warnings: packageOne.warnings
    };

    await expect(createProjectImportSourceHash(packageOne)).resolves.toBe(await createProjectImportSourceHash(packageTwo));
  });
});
