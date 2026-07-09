import type {
  EmailLog,
  EmailLogInput,
  EmailPreview,
  EventLog,
  EventLogInput,
  Order,
  OrderInput,
  OrderStatus,
  PaymentLog,
  PaymentLogInput,
  SmsLog,
  SmsLogInput,
  SmsPreview
} from "../types";

export const services = [
  { name: "Business Consultation", amount: 25 },
  { name: "Project Setup Review", amount: 50 },
  { name: "Dashboard Demo", amount: 75 }
] as const;

export const orderStatuses: OrderStatus[] = ["draft", "pending_payment", "paid", "failed"];

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    },
    ...options
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "API request failed");
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
      subject: "Mini Billing Messenger Mock Email Test",
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
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    },
    ...options
  });

  return (await response.json()) as T;
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
