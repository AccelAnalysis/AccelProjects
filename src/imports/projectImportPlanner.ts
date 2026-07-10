import type {
  ClientResolution,
  ImportValidationIssue,
  PersonResolution,
  ProjectImportOverrides,
  ProjectImportPackage,
  ProjectImportPlan,
  ProjectImportReferenceData
} from "./projectImportTypes";

function normalizeMatchValue(value: string) {
  return value.trim().toLowerCase();
}

function countTaskDependencies(projectPackage: ProjectImportPackage) {
  return projectPackage.tasks.reduce((total, task) => total + task.dependencies.length, 0);
}

function addIssue(
  issues: ImportValidationIssue[],
  severity: ImportValidationIssue["severity"],
  code: string,
  path: string,
  message: string
) {
  issues.push({ severity, code, path, message });
}

export function findClientResolution(
  projectPackage: ProjectImportPackage,
  referenceData: ProjectImportReferenceData,
  overrides: ProjectImportOverrides = {}
): ClientResolution {
  if (overrides.createClient) {
    return {
      action: "create",
      proposedClientId: null,
      selectedClientId: null,
      matchedBy: null,
      clientName: projectPackage.client.name
    };
  }

  if (overrides.clientId) {
    const selectedClient = referenceData.clients.find((client) => client.id === overrides.clientId);

    if (selectedClient) {
      return {
        action: "match_existing",
        proposedClientId: selectedClient.id,
        selectedClientId: selectedClient.id,
        matchedBy: null,
        clientName: selectedClient.name
      };
    }
  }

  const packageEmail = normalizeMatchValue(projectPackage.client.email);
  const emailMatch = packageEmail
    ? referenceData.clients.find((client) => normalizeMatchValue(client.email) === packageEmail)
    : undefined;

  if (emailMatch) {
    return {
      action: "match_existing",
      proposedClientId: emailMatch.id,
      selectedClientId: emailMatch.id,
      matchedBy: "email",
      clientName: emailMatch.name
    };
  }

  const packageName = normalizeMatchValue(projectPackage.client.name);
  const nameMatch = packageName
    ? referenceData.clients.find((client) => normalizeMatchValue(client.name) === packageName)
    : undefined;

  if (nameMatch) {
    return {
      action: "match_existing",
      proposedClientId: nameMatch.id,
      selectedClientId: nameMatch.id,
      matchedBy: "name",
      clientName: nameMatch.name
    };
  }

  return {
    action: "create",
    proposedClientId: null,
    selectedClientId: null,
    matchedBy: null,
    clientName: projectPackage.client.name
  };
}

export function findPersonResolutions(
  projectPackage: ProjectImportPackage,
  referenceData: ProjectImportReferenceData,
  overrides: ProjectImportOverrides = {}
): PersonResolution[] {
  return projectPackage.people.map((person) => {
    const overrideUserId = overrides.personUserIds?.[person.alias];
    const selectedUser = overrideUserId === null ? null : referenceData.users.find((user) => user.id === overrideUserId);
    const normalizedEmail = normalizeMatchValue(person.email);
    const proposedUser = person.matchMode === "match_by_email" && normalizedEmail
      ? referenceData.users.find((user) => normalizeMatchValue(user.email) === normalizedEmail)
      : undefined;
    const selectedUserId = overrideUserId === null ? null : selectedUser?.id ?? proposedUser?.id ?? null;
    const taskCount = projectPackage.tasks.filter((task) => task.assigneeAlias === person.alias).length;

    return {
      alias: person.alias,
      packageName: person.name,
      packageEmail: person.email,
      projectRole: person.projectRole,
      proposedUserId: proposedUser?.id ?? null,
      selectedUserId,
      status: selectedUserId ? "matched" : (person.matchMode === "manual" ? "manual_required" : "unresolved"),
      taskCount
    };
  });
}

export function createProjectImportPlan(
  projectPackage: ProjectImportPackage,
  referenceData: ProjectImportReferenceData,
  overrides: ProjectImportOverrides = {}
): ProjectImportPlan {
  const issues: ImportValidationIssue[] = [];
  const clientResolution = findClientResolution(projectPackage, referenceData, overrides);
  const personResolutions = findPersonResolutions(projectPackage, referenceData, overrides);
  const ownerResolution = projectPackage.project.ownerAlias
    ? personResolutions.find((person) => person.alias === projectPackage.project.ownerAlias)
    : undefined;
  const ownerOverrideUser = overrides.projectOwnerUserId
    ? referenceData.users.find((user) => user.id === overrides.projectOwnerUserId)
    : undefined;
  const projectOwnerUserId = ownerOverrideUser?.id ?? ownerResolution?.selectedUserId ?? null;
  const resolvedPersonCount = new Set(personResolutions.map((person) => person.selectedUserId).filter(Boolean)).size;

  if (!projectOwnerUserId) {
    addIssue(issues, "error", "project_owner_unresolved", "$.project.ownerAlias", "Resolve the project owner to an existing AccelProjects user before importing.");
  }

  personResolutions
    .filter((person) => person.taskCount > 0 && !person.selectedUserId)
    .forEach((person) => {
      addIssue(
        issues,
        "warning",
        "unresolved_person_tasks_unassigned",
        `$.people[alias=${person.alias}]`,
        `${person.taskCount} task(s) assigned to ${person.packageName} will import as unassigned unless this person is matched.`
      );
    });

  return {
    packageId: projectPackage.packageId,
    schemaVersion: projectPackage.schemaVersion,
    mode: "create",
    clientResolution,
    personResolutions,
    projectOwnerAlias: projectPackage.project.ownerAlias,
    projectOwnerUserId,
    proposedCounts: {
      clients: clientResolution.action === "create" ? 1 : 0,
      projects: 1,
      members: resolvedPersonCount,
      phases: projectPackage.phases.length,
      milestones: projectPackage.milestones.length,
      tasks: projectPackage.tasks.length,
      dependencies: countTaskDependencies(projectPackage),
      risks: projectPackage.risks.length,
      documents: projectPackage.documents.length,
      metrics: projectPackage.metrics.length
    },
    issues
  };
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export async function createProjectImportSourceHash(projectPackage: ProjectImportPackage) {
  const canonical = stableStringify(projectPackage);

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  let hash = 0;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = (Math.imul(31, hash) + canonical.charCodeAt(index)) | 0;
  }

  return `fallback-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
