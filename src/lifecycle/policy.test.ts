import { describe, expect, it } from "vitest";
import { decideLifecycle, isArchived, isLifecycleActive, isPurgeEligible, isRestorable, isTrashed, lifecyclePolicies, normalizeLifecycle, visibleToClient } from "./policy";

describe("record lifecycle policy", () => {
  it("normalizes legacy records to active without mutation", () => {
    const legacy = {};
    expect(normalizeLifecycle(undefined)).toEqual({ schemaVersion: 1, state: "active", retentionClass: "operational_30d", legalHold: false });
    expect(isLifecycleActive(legacy)).toBe(true);
    expect(legacy).toEqual({});
  });

  it("keeps workflow outcomes separate and exposes reusable selectors", () => {
    const archived = { lifecycle: { schemaVersion: 1 as const, state: "archived" as const, retentionClass: "business_7y" as const, lastOperationId: "op" } };
    const trashed = { lifecycle: { ...archived.lifecycle, state: "trashed" as const, purgeEligibleAt: "2026-01-01T00:00:00.000Z" } };
    expect(isArchived(archived)).toBe(true);
    expect(isTrashed(trashed)).toBe(true);
    expect(isRestorable(trashed)).toBe(true);
    expect(isPurgeEligible(trashed, Date.parse("2026-02-01T00:00:00.000Z"))).toBe(true);
    expect(visibleToClient(trashed)).toBe(false);
  });

  it("enforces role, action, immutability, retention and legal hold", () => {
    expect(decideLifecycle("task", "trash", "project_manager").allowed).toBe(true);
    expect(decideLifecycle("task", "trash", "contributor").code).toBe("permission_denied");
    expect(decideLifecycle("activityEvent", "trash", "admin").code).toBe("immutable_record");
    expect(decideLifecycle("task", "purge", "admin", { schemaVersion: 1, state: "trashed", retentionClass: "operational_30d", legalHold: true, lastOperationId: "op", purgeEligibleAt: "2020-01-01T00:00:00.000Z" }).code).toBe("legal_hold");
    expect(decideLifecycle("task", "purge", "admin", { schemaVersion: 1, state: "trashed", retentionClass: "operational_30d", lastOperationId: "op", purgeEligibleAt: "2099-01-01T00:00:00.000Z" }, new Date("2026-01-01")).code).toBe("retention_not_satisfied");
    expect(lifecyclePolicies.reportSnapshot.immutable).toBe(true);
  });
});
