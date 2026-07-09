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
