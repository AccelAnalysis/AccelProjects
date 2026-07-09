import { useState } from "react";
import { OrderTable } from "../components/OrderTable";
import { PaymentLogTable } from "../components/PaymentLogTable";
import { TestPanel } from "../components/TestPanel";
import {
  checkApiHealth,
  checkMicrosoftEmailConfig,
  checkMicrosoftToken,
  checkStripeConfig,
  createCheckoutSession,
  createEmailLog,
  createLogEvent,
  createPaymentLog,
  createSampleOrder,
  createSampleOrderWithSmsConsent,
  getEmailLogs,
  getEmailLogsForOrder,
  getOrderById,
  getLogs,
  getOrders,
  getPaymentLogs,
  getPaymentLogsForOrder,
  getSmsLogs,
  previewOrderReceivedEmail,
  previewOrderReceivedSms,
  sendMockOrderReceivedSms,
  sendMockTestSms,
  sendMockOrderReceivedEmail,
  sendMockTestEmail,
  sendMicrosoftFailureTest,
  sendMicrosoftTestEmail,
  sendTwilioTestSms,
  updateOrderStatus
} from "../data/api";
import type { EmailLog, EmailPreview, EventLog, Order, PaymentLog, SmsLog, SmsPreview } from "../types";

export function TestPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<PaymentLog[]>([]);
  const [showOrders, setShowOrders] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showEmailLogs, setShowEmailLogs] = useState(false);
  const [showSmsLogs, setShowSmsLogs] = useState(false);
  const [showPaymentLogs, setShowPaymentLogs] = useState(false);
  const [emailPreview, setEmailPreview] = useState<EmailPreview | undefined>();
  const [smsPreview, setSmsPreview] = useState<SmsPreview | undefined>();
  const [latestOrder, setLatestOrder] = useState<Order | undefined>();
  const [latestLog, setLatestLog] = useState<EventLog | undefined>();
  const [latestEmailLog, setLatestEmailLog] = useState<EmailLog | undefined>();
  const [latestSmsLog, setLatestSmsLog] = useState<SmsLog | undefined>();
  const [latestPaymentLog, setLatestPaymentLog] = useState<PaymentLog | undefined>();
  const [resultMessage, setResultMessage] = useState("");
  const [microsoftEmailForm, setMicrosoftEmailForm] = useState({
    to: "",
    subject: "Mini Billing Messenger Microsoft 365 Test",
    body: "This is a test email sent through Microsoft Graph."
  });
  const [twilioSmsForm, setTwilioSmsForm] = useState({
    to: "",
    message: "Mini Billing Messenger Twilio SMS test.",
    smsConsent: true
  });

  async function runApiAction(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : "API test failed");
    }
  }

  async function handleHealthCheck() {
    await runApiAction(async () => {
      const result = await checkApiHealth();
      setResultMessage(`${result.status}: ${result.message}`);
    });
  }

  async function handleCheckMicrosoftConfig() {
    await runApiAction(async () => {
      const result = await checkMicrosoftEmailConfig();
      setResultMessage(
        result.configured
          ? `Microsoft email configured. Sender: ${result.senderEmail || "not set"} (${result.authMode})`
          : `Microsoft email not configured. Missing: ${result.missing.join(", ")}`
      );
    });
  }

  async function handleCheckMicrosoftToken() {
    await runApiAction(async () => {
      const result = await checkMicrosoftToken();
      setResultMessage(result.success ? result.message ?? "Microsoft token check passed" : result.error ?? "Microsoft token check failed");
    });
  }

  async function handleCheckStripeConfig() {
    await runApiAction(async () => {
      const result = await checkStripeConfig();
      setResultMessage(
        result.configured
          ? `Stripe configured in ${result.mode} mode`
          : `Stripe not configured. Missing: ${result.missing.join(", ")}`
      );
    });
  }

  async function handleCreateOrder() {
    await runApiAction(async () => {
      const order = await createSampleOrder();
      const fetchedOrder = await getOrderById(order.id);
      setLatestOrder(fetchedOrder);
      setResultMessage(`Created and retrieved order ${fetchedOrder.id}`);
    });
  }

  async function handleCreateSmsConsentOrder(smsConsent: boolean) {
    await runApiAction(async () => {
      const order = await createSampleOrderWithSmsConsent(smsConsent);
      const fetchedOrder = await getOrderById(order.id);
      setLatestOrder(fetchedOrder);
      setOrders(await getOrders());
      setShowOrders(true);
      setResultMessage(`Created sample order ${fetchedOrder.id} with SMS consent ${fetchedOrder.smsConsent ? "true" : "false"}`);
    });
  }

  async function handleSendMockSms() {
    await runApiAction(async () => {
      const orderForSms = latestOrder ?? (await createSampleOrderWithSmsConsent(true));
      setLatestOrder(orderForSms);
      const result = await sendMockTestSms({
        to: orderForSms.phone,
        message: "Mini Billing Messenger mock SMS test.",
        orderId: orderForSms.id,
        smsConsent: orderForSms.smsConsent
      });

      setLatestSmsLog(result.smsLog);
      setSmsLogs(await getSmsLogs());
      setShowSmsLogs(true);
      setResultMessage(`${result.message}: ${result.smsLog.id}`);
    });
  }

  async function handleViewSmsLogs() {
    await runApiAction(async () => {
      const savedSmsLogs = await getSmsLogs();
      setSmsLogs(savedSmsLogs);
      setShowSmsLogs(true);
      setResultMessage(`Loaded ${savedSmsLogs.length} SMS log${savedSmsLogs.length === 1 ? "" : "s"} from API`);
    });
  }

  async function handlePreviewOrderReceivedSms() {
    await runApiAction(async () => {
      const orderForPreview = latestOrder ?? (await createSampleOrderWithSmsConsent(true));
      setLatestOrder(orderForPreview);
      const preview = await previewOrderReceivedSms(orderForPreview.id);

      setSmsPreview(preview);
      setResultMessage(`Previewed order received SMS for ${preview.orderId}`);
    });
  }

  async function handleSendMockOrderSms() {
    await runApiAction(async () => {
      const orderForSms = latestOrder ?? (await createSampleOrderWithSmsConsent(true));
      setLatestOrder(orderForSms);
      const result = await sendMockOrderReceivedSms(orderForSms.id);

      setLatestSmsLog(result.smsLog);
      setSmsLogs(await getSmsLogs());
      setShowSmsLogs(true);
      setResultMessage(`${result.message}: ${result.smsLog.id}`);
    });
  }

  async function handleViewOrders() {
    await runApiAction(async () => {
      const savedOrders = await getOrders();
      setOrders(savedOrders);
      setShowOrders(true);
      setResultMessage(`Loaded ${savedOrders.length} order${savedOrders.length === 1 ? "" : "s"} from API`);
    });
  }

  async function handleUpdateStatus() {
    await runApiAction(async () => {
      const orderToUpdate = latestOrder ?? (await createSampleOrder());
      const updatedOrder = await updateOrderStatus(orderToUpdate.id, "pending_payment");
      setLatestOrder(updatedOrder);
      setOrders(await getOrders());
      setShowOrders(true);
      setResultMessage(`Updated ${updatedOrder.id} to ${updatedOrder.status}`);
    });
  }

  async function handleCreateLog() {
    await runApiAction(async () => {
      const orderForLog = latestOrder ?? (await createSampleOrder());
      setLatestOrder(orderForLog);
      const log = await createLogEvent({
        type: "order_created",
        message: "Order was created",
        orderId: orderForLog.id,
        metadata: {
          source: "phase_2_test_page"
        }
      });

      setLatestLog(log);
      setResultMessage(`Created log event ${log.id}`);
    });
  }

  async function handleViewLogs() {
    await runApiAction(async () => {
      const savedLogs = await getLogs();
      setLogs(savedLogs);
      setShowLogs(true);
      setResultMessage(`Loaded ${savedLogs.length} log event${savedLogs.length === 1 ? "" : "s"} from API`);
    });
  }

  async function handleCreateEmailLog() {
    await runApiAction(async () => {
      const orderForEmail = latestOrder ?? (await createSampleOrder());
      setLatestOrder(orderForEmail);
      const emailLog = await createEmailLog({
        orderId: orderForEmail.id,
        recipientEmail: orderForEmail.email,
        subject: `Draft follow-up for ${orderForEmail.service}`,
        bodyPreview: `Hello ${orderForEmail.customerName}, this is a mock email log for your ${orderForEmail.service} order.`,
        provider: "internal_mock",
        status: "draft",
        errorMessage: ""
      });
      const logsForOrder = await getEmailLogsForOrder(orderForEmail.id);

      setLatestEmailLog(emailLog);
      setEmailLogs(logsForOrder);
      setShowEmailLogs(true);
      setResultMessage(`Created email log ${emailLog.id} for ${orderForEmail.id}`);
    });
  }

  async function handleViewEmailLogs() {
    await runApiAction(async () => {
      const savedEmailLogs = await getEmailLogs();
      setEmailLogs(savedEmailLogs);
      setShowEmailLogs(true);
      setResultMessage(`Loaded ${savedEmailLogs.length} email log${savedEmailLogs.length === 1 ? "" : "s"} from API`);
    });
  }

  async function handleSendMockTestEmail() {
    await runApiAction(async () => {
      const result = await sendMockTestEmail();
      setLatestEmailLog(result.emailLog);
      setEmailLogs(await getEmailLogs());
      setShowEmailLogs(true);
      setResultMessage(`${result.message}: ${result.messageId}`);
    });
  }

  async function handlePreviewOrderReceivedEmail() {
    await runApiAction(async () => {
      const orderForPreview = latestOrder ?? (await createSampleOrder());
      setLatestOrder(orderForPreview);
      const preview = await previewOrderReceivedEmail(orderForPreview.id);

      setEmailPreview(preview);
      setResultMessage(`Previewed order received email for ${preview.orderId}`);
    });
  }

  async function handleSendMockOrderEmail() {
    await runApiAction(async () => {
      const orderForEmail = latestOrder ?? (await createSampleOrder());
      setLatestOrder(orderForEmail);
      const result = await sendMockOrderReceivedEmail(orderForEmail.id);

      setLatestEmailLog(result.emailLog);
      setEmailLogs(await getEmailLogs());
      setShowEmailLogs(true);
      setResultMessage(`${result.message} for ${orderForEmail.id}: ${result.messageId}`);
    });
  }

  function updateMicrosoftEmailForm(field: "to" | "subject" | "body", value: string) {
    setMicrosoftEmailForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function useInvalidMicrosoftRecipient() {
    setMicrosoftEmailForm((current) => ({
      ...current,
      to: "not-an-email"
    }));
    setResultMessage("Invalid recipient loaded. Click Send Microsoft Test Email to test failed logging.");
  }

  function updateTwilioSmsForm(field: "to" | "message" | "smsConsent", value: string | boolean) {
    setTwilioSmsForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function useMissingTwilioPhone() {
    setTwilioSmsForm({
      to: "",
      message: "Mini Billing Messenger Twilio SMS test.",
      smsConsent: true
    });
    setResultMessage("Missing phone loaded. Click Send Twilio Test SMS to test failed logging.");
  }

  function useInvalidTwilioPhone() {
    setTwilioSmsForm({
      to: "not-a-phone-number",
      message: "Mini Billing Messenger Twilio SMS test.",
      smsConsent: true
    });
    setResultMessage("Invalid phone loaded. Click Send Twilio Test SMS to test failed logging.");
  }

  function useTwilioConsentFalse() {
    setTwilioSmsForm({
      to: "+15555555555",
      message: "Mini Billing Messenger Twilio SMS test.",
      smsConsent: false
    });
    setResultMessage("SMS consent false loaded. Click Send Twilio Test SMS to test skipped logging.");
  }

  function useMissingTwilioMessage() {
    setTwilioSmsForm({
      to: "+15555555555",
      message: "",
      smsConsent: true
    });
    setResultMessage("Missing message loaded. Click Send Twilio Test SMS to test failed logging.");
  }

  async function handleSendTwilioTestSms() {
    await runApiAction(async () => {
      const result = await sendTwilioTestSms(twilioSmsForm);

      if (result.smsLog) {
        setLatestSmsLog(result.smsLog);
        setSmsLogs(await getSmsLogs());
        setShowSmsLogs(true);
      }

      setResultMessage(
        result.success
          ? result.message ?? `Twilio SMS ${result.status}`
          : result.error ?? "Twilio SMS test failed"
      );
    });
  }

  async function getOrCreatePaymentOrder() {
    const order = latestOrder ?? (await createSampleOrder());
    setLatestOrder(order);
    return order;
  }

  async function handleCreatePaymentLog() {
    await runApiAction(async () => {
      const order = await getOrCreatePaymentOrder();
      const paymentLog = await createPaymentLog({
        orderId: order.id,
        provider: "mock",
        type: "manual_test_log",
        status: "pending",
        amount: order.amount,
        currency: "usd",
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        stripeEventId: null,
        message: "Sample payment log created from test page",
        errorMessage: "",
        metadata: { source: "test_page" }
      });

      setLatestPaymentLog(paymentLog);
      setPaymentLogs(await getPaymentLogs());
      setShowPaymentLogs(true);
      setResultMessage(`Created payment log ${paymentLog.id}`);
    });
  }

  async function handleViewPaymentLogs() {
    await runApiAction(async () => {
      const savedPaymentLogs = await getPaymentLogs();
      setPaymentLogs(savedPaymentLogs);
      setShowPaymentLogs(true);
      setResultMessage(`Loaded ${savedPaymentLogs.length} payment log${savedPaymentLogs.length === 1 ? "" : "s"} from API`);
    });
  }

  async function handleCreateCheckoutSession() {
    await runApiAction(async () => {
      const order = await getOrCreatePaymentOrder();
      const result = await createCheckoutSession(order.id);

      setLatestOrder(result.order);
      setLatestPaymentLog(result.paymentLog);
      setPaymentLogs(await getPaymentLogsForOrder(order.id));
      setShowPaymentLogs(true);
      setResultMessage(`Created Stripe Checkout Session ${result.stripeCheckoutSessionId}`);
    });
  }

  async function handleViewLatestOrderPaymentLogs() {
    await runApiAction(async () => {
      const order = await getOrCreatePaymentOrder();
      const logs = await getPaymentLogsForOrder(order.id);

      setPaymentLogs(logs);
      setShowPaymentLogs(true);
      setResultMessage(`Loaded ${logs.length} payment log${logs.length === 1 ? "" : "s"} for ${order.id}`);
    });
  }

  async function handleViewLatestOrderStatus() {
    await runApiAction(async () => {
      const order = await getOrCreatePaymentOrder();
      const refreshedOrder = await getOrderById(order.id);

      setLatestOrder(refreshedOrder);
      setResultMessage(`${refreshedOrder.id}: ${refreshedOrder.status}, payment ${refreshedOrder.paymentStatus}`);
    });
  }

  async function handleSendMicrosoftTestEmail() {
    await runApiAction(async () => {
      const result = await sendMicrosoftTestEmail(microsoftEmailForm);

      if (result.emailLog) {
        setLatestEmailLog(result.emailLog);
        setEmailLogs(await getEmailLogs());
        setShowEmailLogs(true);
      }

      setResultMessage(result.success ? result.message ?? "Microsoft test email sent" : result.error ?? "Microsoft test email failed");
    });
  }

  async function handleSendMicrosoftFailureTest() {
    await runApiAction(async () => {
      const result = await sendMicrosoftFailureTest();

      if (result.emailLog) {
        setLatestEmailLog(result.emailLog);
        setEmailLogs(await getEmailLogs());
        setShowEmailLogs(true);
      }

      setResultMessage(result.error ?? "Failed email test completed");
    });
  }

  return (
    <div className="page-stack">
      <TestPanel
        latestLog={latestLog}
        latestEmailLog={latestEmailLog}
        latestSmsLog={latestSmsLog}
        latestPaymentLog={latestPaymentLog}
        latestOrder={latestOrder}
        microsoftEmailForm={microsoftEmailForm}
        twilioSmsForm={twilioSmsForm}
        onCheckHealth={handleHealthCheck}
        onCheckMicrosoftConfig={handleCheckMicrosoftConfig}
        onCheckMicrosoftToken={handleCheckMicrosoftToken}
        onCheckStripeConfig={handleCheckStripeConfig}
        onCreateCheckoutSession={handleCreateCheckoutSession}
        onCreateEmailLog={handleCreateEmailLog}
        onCreateLog={handleCreateLog}
        onCreateOrder={handleCreateOrder}
        onCreatePaymentLog={handleCreatePaymentLog}
        onCreateSmsConsentOrder={handleCreateSmsConsentOrder}
        onMicrosoftEmailFormChange={updateMicrosoftEmailForm}
        onPreviewOrderReceivedEmail={handlePreviewOrderReceivedEmail}
        onPreviewOrderReceivedSms={handlePreviewOrderReceivedSms}
        onSendMockOrderEmail={handleSendMockOrderEmail}
        onSendMockOrderSms={handleSendMockOrderSms}
        onSendMockTestEmail={handleSendMockTestEmail}
        onSendMicrosoftFailureTest={handleSendMicrosoftFailureTest}
        onSendMicrosoftTestEmail={handleSendMicrosoftTestEmail}
        onSendTwilioTestSms={handleSendTwilioTestSms}
        onTwilioSmsFormChange={updateTwilioSmsForm}
        onUpdateStatus={handleUpdateStatus}
        onUseInvalidMicrosoftRecipient={useInvalidMicrosoftRecipient}
        onUseInvalidTwilioPhone={useInvalidTwilioPhone}
        onUseMissingTwilioMessage={useMissingTwilioMessage}
        onUseMissingTwilioPhone={useMissingTwilioPhone}
        onUseTwilioConsentFalse={useTwilioConsentFalse}
        onViewEmailLogs={handleViewEmailLogs}
        onViewLogs={handleViewLogs}
        onViewOrders={handleViewOrders}
        onViewPaymentLogs={handleViewPaymentLogs}
        onViewLatestOrderPaymentLogs={handleViewLatestOrderPaymentLogs}
        onViewLatestOrderStatus={handleViewLatestOrderStatus}
        onViewSmsLogs={handleViewSmsLogs}
        resultMessage={resultMessage}
      />
      {showOrders ? <OrderTable orders={orders} /> : null}
      {emailPreview ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Email Preview</h2>
              <p>{emailPreview.template} for {emailPreview.orderId}</p>
            </div>
          </div>
          <div className="email-preview">
            <strong>{emailPreview.subject}</strong>
            <pre>{emailPreview.body}</pre>
          </div>
        </section>
      ) : null}
      {showLogs ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Event Logs</h2>
              <p>{logs.length} internal event log{logs.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Log ID</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Order ID</th>
                  <th>Metadata</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="order-id">{log.id}</td>
                    <td>{log.type}</td>
                    <td>{log.message}</td>
                    <td className="order-id">{log.orderId}</td>
                    <td>
                      <code>{JSON.stringify(log.metadata)}</code>
                    </td>
                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {smsPreview ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>SMS Preview</h2>
              <p>{smsPreview.template} for {smsPreview.orderId}</p>
            </div>
          </div>
          <div className="email-preview">
            <pre>{smsPreview.message}</pre>
          </div>
        </section>
      ) : null}
      {showEmailLogs ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Email Logs</h2>
              <p>{emailLogs.length} internal email log{emailLogs.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email Log ID</th>
                  <th>Order ID</th>
                  <th>Recipient</th>
                  <th>Subject</th>
                  <th>Preview</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Error</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {emailLogs.map((emailLog) => (
                  <tr key={emailLog.id}>
                    <td className="order-id">{emailLog.id}</td>
                    <td className="order-id">{emailLog.orderId}</td>
                    <td>{emailLog.recipientEmail}</td>
                    <td>{emailLog.subject}</td>
                    <td>{emailLog.bodyPreview}</td>
                    <td>{emailLog.provider}</td>
                    <td>
                      <span className={`status-pill status-${emailLog.status}`}>{emailLog.status}</span>
                    </td>
                    <td>{emailLog.errorMessage || "None"}</td>
                    <td>{new Date(emailLog.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {showSmsLogs ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>SMS Logs</h2>
              <p>{smsLogs.length} internal SMS log{smsLogs.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SMS Log ID</th>
                  <th>Order ID</th>
                  <th>Recipient</th>
                  <th>Preview</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Error</th>
                  <th>Provider Message ID</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {smsLogs.map((smsLog) => (
                  <tr key={smsLog.id}>
                    <td className="order-id">{smsLog.id}</td>
                    <td className="order-id">{smsLog.orderId}</td>
                    <td>{smsLog.recipientPhone}</td>
                    <td>{smsLog.messagePreview}</td>
                    <td>{smsLog.provider}</td>
                    <td>
                      <span className={`status-pill status-${smsLog.status}`}>{smsLog.status}</span>
                    </td>
                    <td>{smsLog.errorMessage || "None"}</td>
                    <td>{smsLog.providerMessageId || "None"}</td>
                    <td>{new Date(smsLog.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {showPaymentLogs ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Payment Logs</h2>
              <p>{paymentLogs.length} payment log{paymentLogs.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <PaymentLogTable paymentLogs={paymentLogs} />
        </section>
      ) : null}
    </div>
  );
}
