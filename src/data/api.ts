import type {
  EmailLog,
  EmailLogInput,
  EmailPreview,
  EventLog,
  EventLogInput,
  ClientProgressReport,
  ClientReportSnapshot,
  ClientReportArtifact,
  Order,
  OrderInput,
  OrderStatus,
  PaymentLog,
  PaymentLogInput,
  PortalProjectCard,
  PortalProjectPublication,
  PortalReportDetail,
  PortalReportSummary,
  PortalUser,
  ProjectCalendarEvent,
  ProjectCommunication,
  ProjectRecipient,
  SmsLog,
  SmsLogInput,
  SmsPreview
} from "../types";
import { auth } from "../firebase";
import type { LifecycleAction, LifecycleEntityType, LifecycleImpact, LifecycleOperation, LifecycleReason } from "../lifecycle/types";

export const services = [
  { name: "Business Consultation", amount: 25 },
  { name: "Project Setup Review", amount: 50 },
  { name: "Dashboard Demo", amount: 75 }
] as const;

export const orderStatuses: OrderStatus[] = ["draft", "pending_payment", "paid", "failed"];

export type LifecycleRequest = {
  action: LifecycleAction;
  expectedProjectRevision: number;
  idempotencyKey: string;
  reason: LifecycleReason;
  previewToken?: string;
  strategy?: string;
  confirmed?: boolean;
};

export function previewRecordLifecycle(projectId: string, entityType: LifecycleEntityType, entityId: string, input: Omit<LifecycleRequest, "previewToken" | "confirmed">) {
  return request<{ projectRevision: number; entityState: string; impact: LifecycleImpact; previewToken: string }>(`/api/projects/${projectId}/lifecycle/${entityType}/${entityId}/impact`, { method: "POST", body: JSON.stringify(input) });
}

export function applyRecordLifecycle(projectId: string, entityType: LifecycleEntityType, entityId: string, input: LifecycleRequest) {
  return request<{ operation: LifecycleOperation; duplicate: boolean }>(`/api/projects/${projectId}/lifecycle/${entityType}/${entityId}/actions`, { method: "POST", body: JSON.stringify(input) });
}

async function getAuthenticatedHeaders(options?: RequestInit) {
  const token = await auth?.currentUser?.getIdToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options?.headers
  };
}

function getApiErrorMessage(status: number, data: unknown) {
  const error = typeof data === "object" && data && "error" in data ? String((data as { error?: unknown }).error) : "";

  if (status === 401) {
    return error || "Your session expired or API authentication failed. Sign in again.";
  }

  if (status === 403) {
    return error || "Your account is not authorized for this API action.";
  }

  return error || "API request failed";
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: await getAuthenticatedHeaders(options),
    ...options
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response.status, data));
  }

  return data as T;
}

export function checkApiHealth() {
  return request<{ status: string; message: string }>("/api/health");
}

export function checkMicrosoftEmailConfig() {
  return request<{
    configured: boolean;
    senderEmail: string;
    authMode: string;
    missing: string[];
  }>("/api/email/microsoft-config-check");
}

export function checkMicrosoftToken() {
  return request<{
    success: boolean;
    message?: string;
    error?: string;
  }>("/api/email/microsoft-token-check");
}

export function checkMicrosoftProjectCapabilities() {
  return request<{
    emailConfigured: boolean;
    calendarConfigured: boolean;
    tokenAvailable: boolean;
    mailSendPermissionExpected: boolean;
    calendarsReadWritePermissionExpected: boolean;
    senderMailbox: string;
    calendarOwnerMailbox: string;
    missing: string[];
    authMode: string;
  }>("/api/integrations/microsoft/capabilities");
}

export function getProjectCommunicationsWorkspace(projectId: string) {
  return request<{
    communications: ProjectCommunication[];
    calendarEvents: ProjectCalendarEvent[];
  }>(`/api/projects/${projectId}/communications-workspace`);
}

export type ProjectCommunicationInput = {
  subject: string;
  bodyText: string;
  toRecipients: ProjectRecipient[];
  ccRecipients: ProjectRecipient[];
  bccRecipients: ProjectRecipient[];
  audience: "client" | "internal" | "mixed";
  visibility: "internal" | "client_visible";
  sourceType?: "manual_project_update" | "report_snapshot";
  sourceId?: string | null;
  attachmentRefs?: Array<Record<string, unknown>>;
};

export function createProjectCommunication(projectId: string, input: ProjectCommunicationInput) {
  return request<ProjectCommunication>(`/api/projects/${projectId}/communications`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function sendProjectCommunication(projectId: string, communicationId: string, options: { retryUnknownConfirmed?: boolean } = {}) {
  return request<{
    communication: ProjectCommunication;
  }>(`/api/projects/${projectId}/communications/${communicationId}/send`, {
    method: "POST",
    body: JSON.stringify(options)
  });
}

export type ClientReportInput = Pick<
  ClientProgressReport,
  | "title"
  | "reportingPeriodStart"
  | "reportingPeriodEnd"
  | "executiveSummary"
  | "progressSummary"
  | "nextSteps"
  | "clientActions"
  | "highlights"
  | "risks"
  | "milestones"
  | "completedTasks"
  | "upcomingTasks"
  | "includeBudget"
>;

export type ReportEmailInput = {
  subject: string;
  bodyText: string;
  toRecipients: ProjectRecipient[];
  ccRecipients: ProjectRecipient[];
  bccRecipients: ProjectRecipient[];
};

export function listProjectReports(projectId: string) {
  return request<{ reports: ClientProgressReport[] }>(`/api/projects/${projectId}/reports`);
}

export function createClientProgressReport(projectId: string, input: ClientReportInput) {
  return request<ClientProgressReport>(`/api/projects/${projectId}/reports`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateClientProgressReport(projectId: string, reportId: string, input: ClientReportInput) {
  return request<ClientProgressReport>(`/api/projects/${projectId}/reports/${reportId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function submitClientProgressReport(projectId: string, reportId: string) {
  return request<ClientProgressReport>(`/api/projects/${projectId}/reports/${reportId}/submit`, {
    method: "POST"
  });
}

export function approveClientProgressReport(projectId: string, reportId: string) {
  return request<{ report: ClientProgressReport; snapshot: ClientReportSnapshot }>(`/api/projects/${projectId}/reports/${reportId}/approve`, {
    method: "POST"
  });
}

export async function downloadClientReportPdf(projectId: string, reportId: string, snapshotId: string) {
  const response = await fetch(`/api/projects/${projectId}/reports/${reportId}/snapshots/${snapshotId}/pdf`, {
    headers: await getAuthenticatedHeaders()
  });

  if (!response.ok) {
    let data: unknown = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    throw new Error(getApiErrorMessage(response.status, data));
  }

  return {
    blob: await response.blob(),
    filename: response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "client-progress-report.pdf",
    artifactId: response.headers.get("x-accelprojects-artifact-id"),
    sha256: response.headers.get("x-accelprojects-content-sha256")
  };
}

export function emailClientReportSnapshot(projectId: string, reportId: string, snapshotId: string, input: ReportEmailInput) {
  return request<{ communication: ProjectCommunication; artifact: ClientReportArtifact }>(`/api/projects/${projectId}/reports/${reportId}/snapshots/${snapshotId}/email`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getPortalMe() {
  return request<{
    userId: string;
    email: string;
    displayName: string;
    clientId: string;
    clientName: string;
    portalStatus: PortalUser["status"];
    projectCount: number;
  }>("/api/portal/me");
}

export function getPortalProjects() {
  return request<{ projects: PortalProjectCard[] }>("/api/portal/projects");
}

export function getPortalProject(projectId: string) {
  return request<{ project: PortalProjectCard; latestReports: PortalReportSummary[] }>(`/api/portal/projects/${projectId}`);
}

export function getPortalReports(projectId: string) {
  return request<{ reports: PortalReportSummary[] }>(`/api/portal/projects/${projectId}/reports`);
}

export function getPortalReport(projectId: string, portalReportId: string) {
  return request<{ report: PortalReportDetail }>(`/api/portal/projects/${projectId}/reports/${portalReportId}`);
}

export async function downloadPortalReportPdf(projectId: string, portalReportId: string) {
  const response = await fetch(`/api/portal/projects/${projectId}/reports/${portalReportId}/pdf`, {
    headers: await getAuthenticatedHeaders()
  });

  if (!response.ok) {
    let data: unknown = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    throw new Error(getApiErrorMessage(response.status, data));
  }

  return {
    blob: await response.blob(),
    filename: response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "client-progress-report.pdf"
  };
}

export function listPortalUsers() {
  return request<{ portalUsers: PortalUser[] }>("/api/portal-admin/users");
}

export function savePortalUser(userId: string, input: {
  clientId: string;
  displayName: string;
  email: string;
  status?: PortalUser["status"];
}) {
  return request<{ portalUser: PortalUser }>(`/api/portal-admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function updatePortalUserStatus(userId: string, status: PortalUser["status"]) {
  return request<{ portalUser: PortalUser }>(`/api/portal-admin/users/${userId}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

export function grantPortalProjectAccess(userId: string, projectId: string, input: { expiresAt?: string | null } = {}) {
  return request<{ access: unknown }>(`/api/portal-admin/users/${userId}/project-access/${projectId}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function revokePortalProjectAccess(userId: string, projectId: string) {
  return request<{ success: boolean }>(`/api/portal-admin/users/${userId}/project-access/${projectId}/revoke`, {
    method: "POST"
  });
}

export function previewPortalProjectPublication(projectId: string) {
  return request<{ preview: PortalProjectPublication }>(`/api/projects/${projectId}/portal-publication/preview`);
}

export function publishPortalProject(projectId: string, input: Partial<PortalProjectPublication> = {}) {
  return request<{ publication: PortalProjectPublication }>(`/api/projects/${projectId}/portal-publication`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function withdrawPortalProject(projectId: string) {
  return request<{ publication: PortalProjectPublication }>(`/api/projects/${projectId}/portal-publication/withdraw`, {
    method: "POST"
  });
}

export function publishReportToPortal(projectId: string, snapshotId: string) {
  return request<{ publication: unknown }>(`/api/projects/${projectId}/report-publications/${snapshotId}`, {
    method: "POST"
  });
}

export function withdrawReportFromPortal(projectId: string, snapshotId: string) {
  return request<{ publication: unknown }>(`/api/projects/${projectId}/report-publications/${snapshotId}/withdraw`, {
    method: "POST"
  });
}

export type ProjectCalendarEventInput = {
  title: string;
  descriptionText: string;
  visibility: "internal" | "client_visible";
  startDateTime: string;
  endDateTime: string;
  timeZone?: string;
  isAllDay: boolean;
  location: string;
  attendees: ProjectRecipient[];
  reminderMinutesBeforeStart: number;
  relatedEntityType: "project" | "task" | "milestone" | "report" | "other";
  relatedEntityId: string | null;
};

export function createProjectCalendarDraft(projectId: string, input: ProjectCalendarEventInput) {
  return request<ProjectCalendarEvent>(`/api/projects/${projectId}/calendar-events`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createProjectCalendarEvent(projectId: string, calendarEventId: string) {
  return request<ProjectCalendarEvent>(`/api/projects/${projectId}/calendar-events/${calendarEventId}/create`, {
    method: "POST"
  });
}

export function updateProjectCalendarEvent(projectId: string, calendarEventId: string, input: ProjectCalendarEventInput) {
  return request<ProjectCalendarEvent>(`/api/projects/${projectId}/calendar-events/${calendarEventId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function cancelProjectCalendarEvent(projectId: string, calendarEventId: string) {
  return request<ProjectCalendarEvent>(`/api/projects/${projectId}/calendar-events/${calendarEventId}/cancel`, {
    method: "POST"
  });
}

export function checkStripeConfig() {
  return request<{
    configured: boolean;
    missing: string[];
    mode: string;
  }>("/api/payments/stripe-config-check");
}

export function createOrder(order: OrderInput) {
  return request<Order>("/api/orders", {
    method: "POST",
    body: JSON.stringify(order)
  });
}

export function getOrders() {
  return request<Order[]>("/api/orders");
}

export function getOrderById(id: string) {
  return request<Order>(`/api/orders/${id}`);
}

export function updateOrderStatus(id: string, status: OrderStatus) {
  return request<Order>(`/api/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function createLogEvent(log: EventLogInput) {
  return request<EventLog>("/api/log-event", {
    method: "POST",
    body: JSON.stringify(log)
  });
}

export function getLogs() {
  return request<EventLog[]>("/api/logs");
}

export function createEmailLog(emailLog: EmailLogInput) {
  return request<EmailLog>("/api/email-logs", {
    method: "POST",
    body: JSON.stringify(emailLog)
  });
}

export function getEmailLogs() {
  return request<EmailLog[]>("/api/email-logs");
}

export function getEmailLogsForOrder(orderId: string) {
  return request<EmailLog[]>(`/api/orders/${orderId}/email-logs`);
}

export function createSmsLog(smsLog: SmsLogInput) {
  return request<SmsLog>("/api/sms-logs", {
    method: "POST",
    body: JSON.stringify(smsLog)
  });
}

export function getSmsLogs() {
  return request<SmsLog[]>("/api/sms-logs");
}

export function getSmsLogsForOrder(orderId: string) {
  return request<SmsLog[]>(`/api/orders/${orderId}/sms-logs`);
}

export function createPaymentLog(paymentLog: PaymentLogInput) {
  return request<PaymentLog>("/api/payment-logs", {
    method: "POST",
    body: JSON.stringify(paymentLog)
  });
}

export function getPaymentLogs() {
  return request<PaymentLog[]>("/api/payment-logs");
}

export function getPaymentLogsForOrder(orderId: string) {
  return request<PaymentLog[]>(`/api/orders/${orderId}/payment-logs`);
}

export function mockPaymentPending(orderId: string) {
  return request<{ success: boolean; order: Order; paymentLog: PaymentLog }>(`/api/orders/${orderId}/mock-payment-pending`, {
    method: "POST"
  });
}

export function mockPaymentPaid(orderId: string) {
  return request<{ success: boolean; order: Order; paymentLog: PaymentLog }>(`/api/orders/${orderId}/mock-payment-paid`, {
    method: "POST"
  });
}

export function mockPaymentFailed(orderId: string) {
  return request<{ success: boolean; order: Order; paymentLog: PaymentLog }>(`/api/orders/${orderId}/mock-payment-failed`, {
    method: "POST"
  });
}

export function createCheckoutSession(orderId: string) {
  return request<{
    success: boolean;
    checkoutUrl: string;
    stripeCheckoutSessionId: string;
    order: Order;
    paymentLog: PaymentLog;
  }>("/api/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ orderId })
  });
}

export function sendMockTestSms(input: { to: string; message: string; smsConsent: boolean; orderId?: string }) {
  return request<{
    success: boolean;
    provider: string;
    status: SmsLog["status"];
    providerMessageId: string;
    smsLog: SmsLog;
    message: string;
  }>("/api/test-sms/mock", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function sendTwilioTestSms(input: { to: string; message: string; smsConsent: boolean }) {
  return requestWithBody<{
    success: boolean;
    provider: string;
    status: SmsLog["status"];
    providerMessageId?: string;
    smsLog?: SmsLog;
    message?: string;
    error?: string;
  }>("/api/test-sms/twilio", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function previewOrderReceivedSms(orderId: string) {
  return request<SmsPreview>(`/api/orders/${orderId}/sms-preview/order-received`);
}

export function sendMockOrderReceivedSms(orderId: string) {
  return request<{
    success: boolean;
    provider: string;
    status: SmsLog["status"];
    providerMessageId: string;
    smsLog: SmsLog;
    message: string;
  }>(`/api/orders/${orderId}/send-order-received-sms/mock`, {
    method: "POST"
  });
}

export function sendTwilioOrderReceivedSms(orderId: string) {
  return requestWithBody<{
    success: boolean;
    provider: string;
    status: SmsLog["status"];
    providerMessageId?: string;
    smsLog?: SmsLog;
    message?: string;
    error?: string;
  }>(`/api/orders/${orderId}/send-order-received-sms/twilio`, {
    method: "POST"
  });
}

export function previewOrderReceivedEmail(orderId: string) {
  return request<EmailPreview>(`/api/orders/${orderId}/email-preview/order-received`);
}

export function sendMockOrderReceivedEmail(orderId: string) {
  return request<{
    success: boolean;
    provider: string;
    messageId: string;
    emailLog: EmailLog;
    message: string;
  }>(`/api/orders/${orderId}/send-order-received-email/mock`, {
    method: "POST"
  });
}

export function sendMockTestEmail() {
  return request<{
    success: boolean;
    provider: string;
    messageId: string;
    emailLog: EmailLog;
    message: string;
  }>("/api/test-email/mock", {
    method: "POST",
    body: JSON.stringify({
      to: "test@example.com",
      subject: "AccelProjects Mock Email Test",
      body: "This is a mock email test."
    })
  });
}

export function sendMicrosoftTestEmail(input: { to: string; subject: string; body: string }) {
  return requestWithBody<{
    success: boolean;
    provider: string;
    emailLog?: EmailLog;
    message?: string;
    error?: string;
  }>("/api/test-email/microsoft", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function sendMicrosoftFailureTest() {
  return requestWithBody<{
    success: boolean;
    provider: string;
    emailLog?: EmailLog;
    error?: string;
  }>("/api/test-email/microsoft-failure", {
    method: "POST"
  });
}

async function requestWithBody<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: await getAuthenticatedHeaders(options),
    ...options
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(getApiErrorMessage(response.status, data));
  }

  return data as T;
}

export function createSampleOrder() {
  return createOrder({
    customerName: "Sample Customer",
    email: "sample@example.com",
    phone: "+15555555555",
    service: "Dashboard Demo",
    amount: 75,
    smsConsent: true
  });
}

export function createSampleOrderWithSmsConsent(smsConsent: boolean) {
  return createOrder({
    customerName: smsConsent ? "SMS Consent Customer" : "No SMS Consent Customer",
    email: smsConsent ? "sms.yes@example.com" : "sms.no@example.com",
    phone: "+15555555555",
    service: "Dashboard Demo",
    amount: 75,
    smsConsent
  });
}
