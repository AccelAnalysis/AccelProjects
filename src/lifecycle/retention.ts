import type { RetentionClass } from "./types";

export type RetentionPolicyDefinition = { restoreDays: number | null; purgeAfterDays: number | null; purgeMode: "manual" | "schedulable" | "never"; adminConfirmation: boolean; legalHoldSupported: boolean; immutable: boolean };

export const retentionPolicies: Readonly<Record<RetentionClass, RetentionPolicyDefinition>> = {
  operational_temporary: { restoreDays: 30, purgeAfterDays: 30, purgeMode: "schedulable", adminConfirmation: true, legalHoldSupported: true, immutable: false },
  ordinary_project: { restoreDays: 30, purgeAfterDays: 90, purgeMode: "manual", adminConfirmation: true, legalHoldSupported: true, immutable: false },
  project_trash: { restoreDays: 30, purgeAfterDays: 30, purgeMode: "manual", adminConfirmation: true, legalHoldSupported: true, immutable: false },
  relationship_30d: { restoreDays: 30, purgeAfterDays: 30, purgeMode: "schedulable", adminConfirmation: true, legalHoldSupported: true, immutable: false },
  communication_history: { restoreDays: null, purgeAfterDays: null, purgeMode: "never", adminConfirmation: true, legalHoldSupported: true, immutable: true },
  calendar_history: { restoreDays: null, purgeAfterDays: null, purgeMode: "never", adminConfirmation: true, legalHoldSupported: true, immutable: true },
  approved_report: { restoreDays: null, purgeAfterDays: null, purgeMode: "never", adminConfirmation: true, legalHoldSupported: true, immutable: true },
  report_artifact: { restoreDays: null, purgeAfterDays: null, purgeMode: "never", adminConfirmation: true, legalHoldSupported: true, immutable: true },
  contract_billing: { restoreDays: null, purgeAfterDays: null, purgeMode: "manual", adminConfirmation: true, legalHoldSupported: true, immutable: false },
  audit_permanent: { restoreDays: null, purgeAfterDays: null, purgeMode: "never", adminConfirmation: true, legalHoldSupported: true, immutable: true },
  legal_hold: { restoreDays: null, purgeAfterDays: null, purgeMode: "never", adminConfirmation: true, legalHoldSupported: true, immutable: true },
  operational_30d: { restoreDays: 30, purgeAfterDays: 30, purgeMode: "schedulable", adminConfirmation: true, legalHoldSupported: true, immutable: false },
  business_7y: { restoreDays: 30, purgeAfterDays: null, purgeMode: "manual", adminConfirmation: true, legalHoldSupported: true, immutable: false }
};

export function calculateRetentionDates(retentionClass: RetentionClass, from: Date) {
  const policy = retentionPolicies[retentionClass];
  const add = (days: number | null) => days === null ? undefined : new Date(from.getTime() + days * 86_400_000).toISOString();
  return { restoreDeadline: add(policy.restoreDays), purgeEligibleAt: add(policy.purgeAfterDays) };
}
