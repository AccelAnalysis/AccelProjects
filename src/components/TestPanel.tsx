import { Activity, CreditCard, Eye, FileText, List, Mail, MessageSquare, RefreshCcw, TestTube2 } from "lucide-react";
import type { EmailLog, EventLog, Order, PaymentLog, SmsLog } from "../types";

type TestPanelProps = {
  onCheckHealth: () => void;
  onCreateOrder: () => void;
  onCreateSmsConsentOrder: (smsConsent: boolean) => void;
  onSendMockSms: () => void;
  onSendMockOrderSms: () => void;
  onPreviewOrderReceivedSms: () => void;
  onSendTwilioTestSms: () => void;
  onUseMissingTwilioPhone: () => void;
  onUseInvalidTwilioPhone: () => void;
  onUseTwilioConsentFalse: () => void;
  onUseMissingTwilioMessage: () => void;
  onViewOrders: () => void;
  onUpdateStatus: () => void;
  onCreateLog: () => void;
  onViewLogs: () => void;
  onCreateEmailLog: () => void;
  onViewEmailLogs: () => void;
  onViewSmsLogs: () => void;
  onCheckStripeConfig: () => void;
  onCreatePaymentLog: () => void;
  onViewPaymentLogs: () => void;
  onCreateCheckoutSession: () => void;
  onViewLatestOrderPaymentLogs: () => void;
  onViewLatestOrderStatus: () => void;
  onCheckMicrosoftConfig: () => void;
  onCheckMicrosoftToken: () => void;
  onSendMockTestEmail: () => void;
  onSendMockOrderEmail: () => void;
  onSendMicrosoftTestEmail: () => void;
  onSendMicrosoftFailureTest: () => void;
  onUseInvalidMicrosoftRecipient: () => void;
  onPreviewOrderReceivedEmail: () => void;
  microsoftEmailForm: {
    to: string;
    subject: string;
    body: string;
  };
  onMicrosoftEmailFormChange: (field: "to" | "subject" | "body", value: string) => void;
  twilioSmsForm: {
    to: string;
    message: string;
    smsConsent: boolean;
  };
  onTwilioSmsFormChange: (field: "to" | "message" | "smsConsent", value: string | boolean) => void;
  latestOrder?: Order;
  latestLog?: EventLog;
  latestEmailLog?: EmailLog;
  latestSmsLog?: SmsLog;
  latestPaymentLog?: PaymentLog;
  resultMessage: string;
};

export function TestPanel({
  onCheckHealth,
  onCreateOrder,
  onCreateSmsConsentOrder,
  onSendMockSms,
  onSendMockOrderSms,
  onPreviewOrderReceivedSms,
  onSendTwilioTestSms,
  onUseMissingTwilioPhone,
  onUseInvalidTwilioPhone,
  onUseTwilioConsentFalse,
  onUseMissingTwilioMessage,
  onViewOrders,
  onUpdateStatus,
  onCreateLog,
  onViewLogs,
  onCreateEmailLog,
  onViewEmailLogs,
  onViewSmsLogs,
  onCheckStripeConfig,
  onCreatePaymentLog,
  onViewPaymentLogs,
  onCreateCheckoutSession,
  onViewLatestOrderPaymentLogs,
  onViewLatestOrderStatus,
  onCheckMicrosoftConfig,
  onCheckMicrosoftToken,
  onSendMockTestEmail,
  onSendMockOrderEmail,
  onSendMicrosoftTestEmail,
  onSendMicrosoftFailureTest,
  onUseInvalidMicrosoftRecipient,
  onPreviewOrderReceivedEmail,
  microsoftEmailForm,
  onMicrosoftEmailFormChange,
  twilioSmsForm,
  onTwilioSmsFormChange,
  latestOrder,
  latestLog,
  latestEmailLog,
  latestSmsLog,
  latestPaymentLog,
  resultMessage
}: TestPanelProps) {
  return (
    <section className="panel test-panel">
      <div className="panel-header">
        <div>
          <h1>Integration Test Center</h1>
        </div>
      </div>

      <div className="test-section">
        <h2>Backend API</h2>
        <div className="button-row">
          <button type="button" onClick={onCheckHealth}>
            <Activity size={18} aria-hidden="true" />
            Check API Health
          </button>
          <button type="button" onClick={onCreateOrder}>
            <TestTube2 size={18} aria-hidden="true" />
            Create Sample Order
          </button>
          <button type="button" onClick={onViewOrders}>
            <Eye size={18} aria-hidden="true" />
            View Orders
          </button>
          <button type="button" onClick={onUpdateStatus}>
            <RefreshCcw size={18} aria-hidden="true" />
            Update Order Status
          </button>
          <button type="button" onClick={onCreateLog}>
            <FileText size={18} aria-hidden="true" />
            Create Sample Log Event
          </button>
          <button type="button" onClick={onViewLogs}>
            <List size={18} aria-hidden="true" />
            View Log Events
          </button>
        </div>
      </div>

      <div className="test-section">
        <h2>Email</h2>
        <div className="button-row">
          <button type="button" onClick={onCheckMicrosoftConfig}>
            <Mail size={18} aria-hidden="true" />
            Check Microsoft Config
          </button>
          <button type="button" onClick={onCheckMicrosoftToken}>
            <Mail size={18} aria-hidden="true" />
            Check Microsoft Token
          </button>
          <button type="button" onClick={onSendMockTestEmail}>
            <Mail size={18} aria-hidden="true" />
            Send Mock Email
          </button>
          <button type="button" onClick={onSendMicrosoftTestEmail}>
            <Mail size={18} aria-hidden="true" />
            Send Microsoft Email
          </button>
          <button type="button" onClick={onPreviewOrderReceivedEmail}>
            <FileText size={18} aria-hidden="true" />
            Preview Email
          </button>
          <button type="button" onClick={onViewEmailLogs}>
            <Eye size={18} aria-hidden="true" />
            View Email Logs
          </button>
          <button type="button" onClick={onSendMockOrderEmail}>
            <Mail size={18} aria-hidden="true" />
            Send Mock Order Email
          </button>
          <button type="button" onClick={onCreateEmailLog}>
            <Mail size={18} aria-hidden="true" />
            Create Sample Email Log
          </button>
          <button type="button" onClick={onSendMicrosoftFailureTest}>
            <Mail size={18} aria-hidden="true" />
            Send Failed Email Test
          </button>
        </div>
        <div className="test-form">
          <label>
            Recipient email
            <input
              type="email"
              value={microsoftEmailForm.to}
              onChange={(event) => onMicrosoftEmailFormChange("to", event.target.value)}
            />
          </label>
          <label>
            Subject
            <input
              value={microsoftEmailForm.subject}
              onChange={(event) => onMicrosoftEmailFormChange("subject", event.target.value)}
            />
          </label>
          <label className="full-width">
            Body
            <textarea
              rows={4}
              value={microsoftEmailForm.body}
              onChange={(event) => onMicrosoftEmailFormChange("body", event.target.value)}
            />
          </label>
          <button type="button" onClick={onUseInvalidMicrosoftRecipient}>
            <Mail size={18} aria-hidden="true" />
            Use Invalid Email
          </button>
        </div>
      </div>

      <div className="test-section">
        <h2>SMS (Phase 4)</h2>
        <div className="button-row">
          <button type="button" onClick={() => onCreateSmsConsentOrder(true)}>
            <TestTube2 size={18} aria-hidden="true" />
            Create SMS Consent Order
          </button>
          <button type="button" onClick={() => onCreateSmsConsentOrder(false)}>
            <TestTube2 size={18} aria-hidden="true" />
            Create No SMS Consent Order
          </button>
          <button type="button" disabled>
            <MessageSquare size={18} aria-hidden="true" />
            Check Twilio Config
          </button>
          <button type="button" onClick={onSendMockSms}>
            <MessageSquare size={18} aria-hidden="true" />
            Send Mock Test SMS
          </button>
          <button type="button" onClick={onSendMockOrderSms}>
            <MessageSquare size={18} aria-hidden="true" />
            Send Mock Order SMS
          </button>
          <button type="button" onClick={onPreviewOrderReceivedSms}>
            <FileText size={18} aria-hidden="true" />
            Preview Order Received SMS
          </button>
          <button type="button" onClick={onViewSmsLogs}>
            <List size={18} aria-hidden="true" />
            View SMS Logs
          </button>
        </div>
        <div className="test-form">
          <label>
            Recipient phone number
            <input
              type="tel"
              value={twilioSmsForm.to}
              onChange={(event) => onTwilioSmsFormChange("to", event.target.value)}
              placeholder="+15555555555"
            />
          </label>
          <label>
            SMS consent
            <select
              value={twilioSmsForm.smsConsent ? "true" : "false"}
              onChange={(event) => onTwilioSmsFormChange("smsConsent", event.target.value === "true")}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <label className="full-width">
            Message
            <textarea
              rows={3}
              value={twilioSmsForm.message}
              onChange={(event) => onTwilioSmsFormChange("message", event.target.value)}
            />
          </label>
          <button type="button" onClick={onSendTwilioTestSms}>
            <MessageSquare size={18} aria-hidden="true" />
            Send Twilio Test SMS
          </button>
          <button type="button" onClick={onUseMissingTwilioPhone}>
            <MessageSquare size={18} aria-hidden="true" />
            Test Missing Phone
          </button>
          <button type="button" onClick={onUseInvalidTwilioPhone}>
            <MessageSquare size={18} aria-hidden="true" />
            Test Invalid Phone
          </button>
          <button type="button" onClick={onUseTwilioConsentFalse}>
            <MessageSquare size={18} aria-hidden="true" />
            Test SMS Consent False
          </button>
          <button type="button" onClick={onUseMissingTwilioMessage}>
            <MessageSquare size={18} aria-hidden="true" />
            Test Missing Message
          </button>
        </div>
      </div>

      <div className="test-section">
        <h2>Payments (Phase 5)</h2>
        <div className="button-row">
          <button type="button" onClick={onCheckStripeConfig}>
            <CreditCard size={18} aria-hidden="true" />
            Check Stripe Config
          </button>
          <button type="button" onClick={onCreatePaymentLog}>
            <CreditCard size={18} aria-hidden="true" />
            Create Sample Payment Log
          </button>
          <button type="button" onClick={onViewPaymentLogs}>
            <List size={18} aria-hidden="true" />
            View Payment Logs
          </button>
          <button type="button" onClick={onCreateCheckoutSession}>
            <CreditCard size={18} aria-hidden="true" />
            Create Stripe Checkout Session For Sample Order
          </button>
          <button type="button" onClick={onViewLatestOrderPaymentLogs}>
            <Eye size={18} aria-hidden="true" />
            View Latest Order Payment Logs
          </button>
          <button type="button" onClick={onViewLatestOrderStatus}>
            <RefreshCcw size={18} aria-hidden="true" />
            View Latest Order Status
          </button>
        </div>
      </div>

      <div className="test-readout">
        <strong>Latest API result</strong>
        <span>{resultMessage || "No API test has run yet."}</span>
        {latestOrder ? <span>Current sample order: {latestOrder.id} - {latestOrder.status}</span> : null}
        {latestLog ? <span>Latest log: {latestLog.id} - {latestLog.type}</span> : null}
        {latestEmailLog ? <span>Latest email log: {latestEmailLog.id} - {latestEmailLog.status}</span> : null}
        {latestSmsLog ? <span>Latest SMS log: {latestSmsLog.id} - {latestSmsLog.status}</span> : null}
        {latestPaymentLog ? <span>Latest payment log: {latestPaymentLog.id} - {latestPaymentLog.status}</span> : null}
      </div>
    </section>
  );
}
