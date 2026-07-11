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
};

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  role: "sponsor" | "lead" | "contributor" | "observer";
};

export type Phase = {
  id: string;
  projectId: string;
  name: string;
  status: "planned" | "active" | "complete" | "blocked";
  startDate: string;
  endDate: string;
  sortOrder?: number;
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
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  visibility: "internal" | "client";
  createdAt: string;
};

export type TaskDependency = {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  type: "finish_to_start" | "start_to_start" | "finish_to_finish";
};

export type ProjectRisk = {
  id: string;
  projectId: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  probability: "low" | "medium" | "high";
  status: "monitoring" | "mitigating" | "resolved";
  mitigationPlan: string;
};

export type Milestone = {
  id: string;
  projectId: string;
  name: string;
  date: string;
  status: "planned" | "at_risk" | "complete";
};

export type ProjectDocument = {
  id: string;
  projectId: string;
  title: string;
  type: "brief" | "contract" | "technical_note" | "deliverable" | "other";
  url: string;
  ownerId: string;
  createdAt: string;
};

export type ProjectMetric = {
  id: string;
  projectId: string;
  label: string;
  value: number;
  suffix: string;
  tone: "success" | "warning" | "danger" | "info";
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
  projectVersions: ProjectVersion[];
};
