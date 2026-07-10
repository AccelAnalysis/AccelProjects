import type {
  Client,
  Milestone,
  Phase,
  Project,
  ProjectDocument,
  ProjectMetric,
  ProjectRisk,
  Task,
  TaskDependency,
  User,
  UserRole
} from "../types";

export type ProjectImportPackageType = "accelprojects.project";
export type ProjectImportSchemaVersion = "1.0";
export type ProjectImportMode = "create";

export type ProjectImportPerson = {
  alias: string;
  name: string;
  email: string;
  organizationRole: UserRole;
  projectRole: "sponsor" | "lead" | "contributor" | "observer";
  matchMode: "manual" | "match_by_email";
};

export type ProjectImportPhase = {
  key: string;
  name: string;
  status: Phase["status"];
  startDate: string;
  endDate: string;
  sortOrder: number;
};

export type ProjectImportMilestone = {
  key: string;
  name: string;
  date: string;
  status: Milestone["status"];
};

export type ProjectImportTaskDependency = {
  dependsOnTaskKey: string;
  type: TaskDependency["type"];
};

export type ProjectImportTask = {
  key: string;
  phaseKey: string;
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  assigneeAlias: string | null;
  startDate: string;
  dueDate: string;
  estimateHours: number;
  dependencies: ProjectImportTaskDependency[];
};

export type ProjectImportRisk = {
  key: string;
  title: string;
  severity: ProjectRisk["severity"];
  probability: ProjectRisk["probability"];
  status: ProjectRisk["status"];
  mitigationPlan: string;
};

export type ProjectImportDocument = {
  key: string;
  title: string;
  type: ProjectDocument["type"];
  url: string;
  ownerAlias: string | null;
};

export type ProjectImportMetric = {
  key: string;
  label: string;
  value: number;
  suffix: string;
  tone: ProjectMetric["tone"];
};

export type ProjectImportPackage = {
  schemaVersion: ProjectImportSchemaVersion;
  packageType: ProjectImportPackageType;
  packageId: string;
  source: {
    name: string;
    description: string;
    generatedAt: string;
    references: string[];
  };
  client: {
    externalKey: string;
    matchMode: "match_or_create";
    name: string;
    contactName: string;
    email: string;
    phone: string;
    status: Client["status"];
  };
  project: {
    externalKey: string;
    name: string;
    summary: string;
    status: Project["status"];
    health: Project["health"];
    priority: Project["priority"];
    startDate: string;
    targetDate: string;
    budget: number;
    currency: string;
    ownerAlias: string | null;
  };
  people: ProjectImportPerson[];
  phases: ProjectImportPhase[];
  milestones: ProjectImportMilestone[];
  tasks: ProjectImportTask[];
  risks: ProjectImportRisk[];
  documents: ProjectImportDocument[];
  metrics: ProjectImportMetric[];
  assumptions: string[];
  warnings: string[];
};

export type ImportValidationIssue = {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
};

export type ImportValidationResult = {
  package: ProjectImportPackage | null;
  issues: ImportValidationIssue[];
};

export type ClientResolution = {
  action: "match_existing" | "create";
  proposedClientId: string | null;
  selectedClientId: string | null;
  matchedBy: "email" | "name" | null;
  clientName: string;
};

export type PersonResolutionStatus = "matched" | "manual_required" | "unresolved";

export type PersonResolution = {
  alias: string;
  packageName: string;
  packageEmail: string;
  projectRole: ProjectImportPerson["projectRole"];
  proposedUserId: string | null;
  selectedUserId: string | null;
  status: PersonResolutionStatus;
  taskCount: number;
};

export type ProjectImportPlan = {
  packageId: string;
  schemaVersion: ProjectImportSchemaVersion;
  mode: ProjectImportMode;
  clientResolution: ClientResolution;
  personResolutions: PersonResolution[];
  projectOwnerAlias: string | null;
  projectOwnerUserId: string | null;
  proposedCounts: {
    clients: number;
    projects: number;
    members: number;
    phases: number;
    milestones: number;
    tasks: number;
    dependencies: number;
    risks: number;
    documents: number;
    metrics: number;
  };
  issues: ImportValidationIssue[];
};

export type ProjectImportManifest = {
  id: string;
  organizationId: string;
  packageId: string;
  packageType: ProjectImportPackageType;
  schemaVersion: ProjectImportSchemaVersion;
  projectId: string;
  clientId: string;
  mode: ProjectImportMode;
  sourceHash: string;
  status: "processing" | "completed" | "failed";
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
  entityMap: {
    clientExternalKey: string;
    projectExternalKey: string;
    phaseIds: Record<string, string>;
    milestoneIds: Record<string, string>;
    taskIds: Record<string, string>;
    riskIds: Record<string, string>;
    documentIds: Record<string, string>;
    metricIds: Record<string, string>;
    personUserIds: Record<string, string | null>;
  };
  counts: Record<string, number>;
  warnings: string[];
  errorMessage: string;
};

export type ExistingImportManifestSummary = {
  id: string;
  packageId: string;
  sourceHash: string;
  projectId: string;
  projectName: string;
  status: ProjectImportManifest["status"];
  createdAt: string;
};

export type ProjectImportDuplicateCheck = {
  duplicate: boolean;
  existingManifest: ExistingImportManifestSummary | null;
};

export type ProjectImportResult = {
  manifest: ProjectImportManifest;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  counts: ProjectImportPlan["proposedCounts"];
  unresolvedPeople: PersonResolution[];
  unassignedTaskCount: number;
  warnings: string[];
};

export type ProjectImportOverrides = {
  clientId?: string | null;
  createClient?: boolean;
  personUserIds?: Record<string, string | null>;
  projectOwnerUserId?: string | null;
};

export type ProjectImportReferenceData = {
  users: User[];
  clients: Client[];
};
