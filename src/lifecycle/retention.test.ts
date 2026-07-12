import { describe, expect, it } from "vitest";
import { calculateRetentionDates, retentionPolicies } from "./retention";

describe("retention policy registry", () => {
  it("calculates deterministic restore and purge dates", () => { expect(calculateRetentionDates("project_trash", new Date("2026-07-01T00:00:00.000Z"))).toEqual({ restoreDeadline: "2026-07-31T00:00:00.000Z", purgeEligibleAt: "2026-07-31T00:00:00.000Z" }); });
  it("never offers ordinary purge for immutable audit, report, artifact, communication, or calendar history", () => { ["audit_permanent", "approved_report", "report_artifact", "communication_history", "calendar_history"].forEach((name) => expect(retentionPolicies[name as keyof typeof retentionPolicies].purgeMode).toBe("never")); });
});
