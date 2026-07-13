import type { RecordLifecycleMetadata } from "./lifecycle/types";

export type OrderStatus = "draft" | "pending_payment" | "paid" | "failed";
export type PaymentStatus = "unpaid" | "pending" | "paid" | "failed" | "canceled";

export type Order = {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  service: string;
  amount: number;
  smsConsent: boolean;
  status: OrderStatus;
  paymentProvider: string | null;
  paymentStatus: PaymentStatus;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderInput = Omit<
  Order,
  | "id"
  | "status"
  | "paymentProvider"
  | "paymentStatus"
  | "stripeCheckoutSessionId"
  | "stripePaymentIntentId"
  | "paidAt"
  | "createdAt"
  | "updatedAt"
>;

export type EventLog = {
  id: string;
  type: string;
  message: string;
  orderId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type EventLogInput = Omit<EventLog, "id" | "createdAt">;

export type EmailStatus = "draft" | "sent" | "failed" | "skipped";

export type EmailLog = {
  id: string;
  orderId: string;
  recipientEmail: string;
  subject: string;
  bodyPreview: string;
  provider: string;
  status: EmailStatus;
  errorMessage: string;
  createdAt: string;
};

export type EmailLogInput = Omit<EmailLog, "id" | "createdAt">;

export type EmailPreview = {
  orderId: string;
  template: string;
  subject: string;
  body: string;
};

export type SmsStatus = "draft" | "sent" | "failed" | "skipped";

export type SmsLog = {
  id: string;
  orderId: string;
  recipientPhone: string;
  messagePreview: string;
  provider: string;
  status: SmsStatus;
  errorMessage: string;
  providerMessageId: string;
  createdAt: string;
};

export type SmsLogInput = Omit<SmsLog, "id" | "createdAt">;

export type SmsPreview = {
  orderId: string;
  template: string;
  message: string;
};

export type PaymentLog = {
  id: string;
  orderId: string;
  provider: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeEventId: string | null;
  message: string;
  errorMessage: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type PaymentLogInput = Omit<PaymentLog, "id" | "createdAt">;

export type UserRole = "admin" | "project_manager" | "contributor" | "client" | "viewer";

export type NotificationPreferences = {
  taskAssignments: boolean;
  dueDates: boolean;
  risks: boolean;
  projectMessages: boolean;
  emailDelivery: boolean;
};

export type User = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: UserRole;
  avatarInitials: string;
  notificationPreferences?: NotificationPreferences;
  createdAt?: string;
  updatedAt?: string;
  lifecycle?: RecordLifecycleMetadata;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type Client = {
  id: string;
  organizationId: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  status: "lead" | "active" | "paused" | "archived";
  lifecycle?: RecordLifecycleMetadata;
};

export type Project = {
  id: string;
  organizationId: string;
  clientId: string;
  name: string;
  summary: string;
  status: "planning" | "active" | "paused" | "complete" | "archived";
  health: "on_track" | "at_risk" | "blocked";
  priority: "low" | "medium" | "high" | "urgent";
  startDate: string;
  targetDate: string;
  budget: number;
  currency: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  revision?: number;
  lastStructuralChangeAt?: string;
  lifecycle?: RecordLifecycleMetadata;
};

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  role: "sponsor" | "lead" | "contributor" | "observer";
  accessState: "active" | "removed";
  lifecycle?: RecordLifecycleMetadata;
};

export type Phase = {
  id: string;
  projectId: string;
  name: string;
  status: "planned" | "active" | "complete" | "blocked";
  startDate: string;
  endDate: string;
  sortOrder?: number;
  lifecycle?: RecordLifecycleMetadata;
};

export type Task = {
  id: string;
  projectId: string;
  phaseId: string;
  title: string;
  description: string;
  status: "not_started" | "todo" | "in_progress" | "waiting_on_client" | "blocked" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assigneeId: string | null;
  startDate: string | null;
  dueDate: string | null;
  sortOrder?: number;
  estimateHours: number;
  completedAt: string | null;
  lifecycle?: RecordLifecycleMetadata;
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  visibility: "internal" | "client";
  createdAt: string;
  lifecycle?: RecordLifecycleMetadata;
  editedAt?: string;
  editedBy?: string;
  revision?: number;
  moderation?: {
    state: "visible" | "removed_by_author" | "redacted_by_manager";
    at: string;
    by: string;
    reason?: string;
  };
};

export type TaskDependency = {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  type: "finish_to_start" | "start_to_start" | "finish_to_finish";
  lifecycle?: RecordLifecycleMetadata;
};

export type ProjectRisk = {
  id: string;
  projectId: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  probability: "low" | "medium" | "high";
  status: "monitoring" | "mitigating" | "resolved";
  mitigationPlan: string;
  lifecycle?: RecordLifecycleMetadata;
};

export type Milestone = {
  id: string;
  projectId: string;
  name: string;
  date: string;
  status: "planned" | "at_risk" | "complete";
  lifecycle?: RecordLifecycleMetadata;
};

export type ProjectDocument = {
  id: string;
  projectId: string;
  title: string;
  type: "brief" | "contract" | "technical_note" | "deliverable" | "other";
  url: string;
  ownerId: string;
  createdAt: string;
  lifecycle?: RecordLifecycleMetadata;
  category?: "general" | "contract" | "billing" | "approved_deliverable" | "report_artifact";
  currentVersionId?: string | null;
  visibility?: "internal" | "client_visible";
  storageProvider?: "firebase_storage" | "external";
  managed?: boolean;
  contentType?: string;
  originalFilename?: string;
  sizeBytes?: number;
  checksumSha256?: string;
  updatedAt?: string;
  updatedBy?: string;
  retentionClass?: import("./lifecycle/types").RetentionClass;
  locked?: boolean;
};

export type ProjectDocumentVersion = {
  id: string;
  organizationId: string;
  projectId: string;
  documentId: string;
  storagePath: string;
  contentType: string;
  originalFilename: string;
  sanitizedFilename: string;
  sizeBytes: number;
  checksumSha256: string;
  createdAt: string;
  createdBy: string;
};

export type ProjectMetric = {
  id: string;
  projectId: string;
  label: string;
  value: number;
  suffix: string;
  tone: "success" | "warning" | "danger" | "info";
  lifecycle?: RecordLifecycleMetadata;
  source?: "manual" | "imported" | "computed";
};

export type ProjectActivityEvent = {
  id: string;
  projectId: string;
  actorId: string;
  type: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ProjectRecipient = {
  name?: string;
  email: string;
};

export type ProjectCommunicationStatus = "draft" | "sending" | "accepted" | "failed" | "unknown" | "canceled";

export type ProjectCommunication = {
  id: string;
  organizationId: string;
  projectId: string;
  channel: "email";
  direction: "outbound";
  audience: "client" | "internal" | "mixed";
  visibility: "internal" | "client_visible";
  status: ProjectCommunicationStatus;
  lifecycle?: RecordLifecycleMetadata;
  subject: string;
  bodyText: string;
  toRecipients: ProjectRecipient[];
  ccRecipients: ProjectRecipient[];
  bccRecipients: ProjectRecipient[];
  senderMailbox: string;
  provider: "microsoft_graph";
  sourceType: "manual_project_update" | "report_snapshot";
  sourceId: string | null;
  attachmentRefs: Array<Record<string, unknown>>;
  idempotencyKey: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  sendRequestedAt: string | null;
  acceptedAt: string | null;
  failedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

export type ProjectDeliveryAttempt = {
  id: string;
  organizationId: string;
  projectId: string;
  communicationId: string;
  attemptNumber: number;
  actorId: string;
  startedAt: string;
  finishedAt: string;
  status: ProjectCommunicationStatus;
  provider: "microsoft_graph";
  providerHttpStatus: number | null;
  errorCategory: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  requestHash: string;
  createdAt: string;
};

export type ProjectCalendarEventStatus = "draft" | "creating" | "scheduled" | "updating" | "canceling" | "canceled" | "failed";

export type ProjectCalendarEvent = {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  descriptionText: string;
  visibility: "internal" | "client_visible";
  status: ProjectCalendarEventStatus;
  lifecycle?: RecordLifecycleMetadata;
  calendarOwnerEmail: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
  isAllDay: boolean;
  location: string;
  attendees: ProjectRecipient[];
  reminderMinutesBeforeStart: number;
  relatedEntityType: "project" | "task" | "milestone" | "report" | "other";
  relatedEntityId: string | null;
  transactionId: string;
  graphEventId: string | null;
  graphICalUId: string | null;
  graphWebLink: string | null;
  graphChangeKey: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

export type ClientReportStatus = "draft" | "ready_for_review" | "approved" | "voided" | "superseded";

export type ClientReportItem = {
  id: string;
  title: string;
  status: string;
  dueDate: string;
  owner: string;
};

export type ClientProgressReport = {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  executiveSummary: string;
  progressSummary: string;
  nextSteps: string;
  clientActions: string[];
  highlights: string[];
  risks: ClientReportItem[];
  milestones: ClientReportItem[];
  completedTasks: ClientReportItem[];
  upcomingTasks: ClientReportItem[];
  includeBudget: boolean;
  includeInternalNotes: boolean;
  status: ClientReportStatus;
  latestApprovedSnapshotId: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  submittedAt: string | null;
  submittedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  lifecycle?: RecordLifecycleMetadata;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  supersedesReportId?: string | null;
  supersedesSnapshotId?: string | null;
  supersededByReportId?: string | null;
  supersededBySnapshotId?: string | null;
};

export type ClientReportSnapshot = {
  id: string;
  organizationId: string;
  projectId: string;
  reportId: string;
  clientId?: string;
  visibility?: "client_visible";
  templateVersion?: string;
  renderSchemaVersion?: string;
  title: string;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  project: Record<string, unknown>;
  client: Record<string, unknown>;
  sections: {
    executiveSummary: string;
    progressSummary: string;
    nextSteps: string;
    clientActions: string[];
    highlights: string[];
    risks: ClientReportItem[];
    milestones: ClientReportItem[];
    completedTasks: ClientReportItem[];
    upcomingTasks: ClientReportItem[];
  };
  contentHash: string;
  projectRevisionAtApproval: number;
  sourceReportUpdatedAt: string;
  approvedBy: string;
  approvedAt: string;
  createdAt: string;
};

export type ClientReportArtifact = {
  id: string;
  organizationId: string;
  projectId: string;
  reportId: string;
  snapshotId: string;
  purpose: "download" | "email_attachment" | "print";
  filename: string;
  contentType: "application/pdf";
  sizeBytes: number;
  sha256: string;
  createdBy: string;
  createdAt: string;
};

export type PortalUser = {
  id: string;
  organizationId: string;
  userId: string;
  clientId: string;
  email: string;
  displayName: string;
  status: "active" | "suspended" | "revoked";
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  lastPortalLoginAt: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
};

export type PortalProjectAccess = {
  id: string;
  organizationId: string;
  userId: string;
  clientId: string;
  projectId: string;
  accessLevel: "read_only";
  status: "active" | "revoked";
  grantedBy: string;
  grantedAt: string;
  updatedBy: string;
  updatedAt: string;
  revokedBy: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
};

export type PortalProjectPublication = {
  id: string;
  organizationId: string;
  projectId: string;
  clientId: string;
  publicationStatus: "published" | "withdrawn";
  projectName: string;
  clientFacingSummary: string;
  health: "on_track" | "at_risk" | "blocked";
  progressPercent: number;
  targetDate: string;
  currentPhaseLabel: string;
  statusNarrative: string;
  nextUpdateExpectedAt: string;
  projectManagerName: string;
  projectManagerEmail: string;
  projectManagerPhone: string;
  latestPublishedReportSnapshotId: string | null;
  publishedBy: string;
  publishedAt: string;
  updatedBy: string;
  updatedAt: string;
  withdrawnBy: string | null;
  withdrawnAt: string | null;
  visibility: "client_visible";
};

export type ReportPublication = {
  id: string;
  organizationId: string;
  projectId: string;
  clientId: string;
  reportId: string;
  snapshotId: string;
  status: "published" | "withdrawn";
  publishedBy: string;
  publishedAt: string;
  updatedAt: string;
  withdrawnBy: string | null;
  withdrawnAt: string | null;
};

export type PortalProjectCard = {
  projectId: string;
  projectName: string;
  clientFacingSummary: string;
  health: Project["health"];
  progressPercent: number;
  targetDate: string;
  currentPhaseLabel: string;
  statusNarrative: string;
  nextUpdateExpectedAt: string;
  projectManagerContact: { name: string; email: string; phone: string };
  latestPublishedReportSnapshotId: string | null;
  publishedAt: string;
};

export type PortalReportSummary = {
  portalReportId: string;
  title: string;
  projectName: string;
  clientName: string;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  approvedAt: string;
  publishedAt: string;
  pdfAvailable: boolean;
  sourceReportStatus?: "approved" | "voided" | "superseded";
  supersededByReportId?: string | null;
};

export type PortalReportItem = Omit<ClientReportItem, "id">;

export type PortalReportSections = {
  executiveSummary: string;
  progressSummary: string;
  nextSteps: string;
  clientActions: string[];
  highlights: string[];
  risks: PortalReportItem[];
  milestones: PortalReportItem[];
  completedTasks: PortalReportItem[];
  upcomingTasks: PortalReportItem[];
};

export type PortalReportDetail = PortalReportSummary & {
  sections: PortalReportSections;
  projectManagerContact: { name: string; email: string; phone: string };
};

export type ProjectVersion = {
  id: string;
  projectId: string;
  revision: number;
  previousRevision: number;
  changeType:
    | "project_imported"
    | "task_created"
    | "task_updated"
    | "tasks_batch_updated"
    | "milestone_created"
    | "milestone_updated"
    | "milestone_deleted"
    | "dependency_created"
    | "dependency_updated"
    | "dependency_deleted"
    | "risk_created"
    | "risk_updated"
    | "lifecycle"
    | "membership_added"
    | "membership_role_changed"
    | "project_exported"
    | "project_file_updated";
  summary: string;
  actorId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ProjectExportSnapshot = {
  id: string;
  projectId: string;
  baseRevision: number;
  resultRevision?: number;
  packageId: string;
  sourceHash: string;
  sourceUpdateHash?: string;
  sourceSnapshotId?: string;
  resultStateHash?: string;
  snapshotType?: "manual_export" | "revision_result";
  createdBy: string;
  createdAt: string;
  packageJson: string;
};

export type ProjectUpdateManifest = {
  id: string;
  organizationId: string;
  projectId: string;
  sourceSnapshotId: string;
  sourcePackageId: string;
  sourceSnapshotHash: string;
  uploadedFileHash: string;
  resultStateHash: string;
  baseRevision: number;
  resultRevision: number;
  versionId: string;
  actorId: string;
  appliedAt: string;
  changeCounts: {
    added: number;
    modified: number;
    removed: number;
    byEntityType: Record<string, { added: number; modified: number; removed: number }>;
  };
};

export type ProjectState = {
  users: User[];
  clients: Client[];
  projects: Project[];
  projectMembers: ProjectMember[];
  phases: Phase[];
  milestones: Milestone[];
  tasks: Task[];
  taskDependencies: TaskDependency[];
  taskComments: TaskComment[];
  risks: ProjectRisk[];
  documents: ProjectDocument[];
  metrics: ProjectMetric[];
  activityEvents: ProjectActivityEvent[];
  projectCommunications: ProjectCommunication[];
  projectCalendarEvents: ProjectCalendarEvent[];
  clientProgressReports: ClientProgressReport[];
  clientReportSnapshots: ClientReportSnapshot[];
  clientReportArtifacts: ClientReportArtifact[];
  portalUsers?: PortalUser[];
  portalProjects?: PortalProjectPublication[];
  reportPublications?: ReportPublication[];
  projectVersions: ProjectVersion[];
};
