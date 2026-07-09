import { useEffect, useState } from "react";
import { EmailLogTable } from "../components/EmailLogTable";
import { OrderTable } from "../components/OrderTable";
import { PaymentLogTable } from "../components/PaymentLogTable";
import { SmsLogTable } from "../components/SmsLogTable";
import {
  createCheckoutSession,
  getEmailLogs,
  getEmailLogsForOrder,
  getOrders,
  getPaymentLogs,
  getPaymentLogsForOrder,
  getSmsLogs,
  getSmsLogsForOrder,
  sendTwilioOrderReceivedSms
} from "../data/api";
import type { EmailLog, Order, PaymentLog, SmsLog } from "../types";

export function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<PaymentLog[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | undefined>();
  const [orderEmailLogs, setOrderEmailLogs] = useState<Record<string, EmailLog[]>>({});
  const [orderSmsLogs, setOrderSmsLogs] = useState<Record<string, SmsLog[]>>({});
  const [orderPaymentLogs, setOrderPaymentLogs] = useState<Record<string, PaymentLog[]>>({});
  const [smsResultMessage, setSmsResultMessage] = useState("");
  const [paymentResultMessage, setPaymentResultMessage] = useState("");

  useEffect(() => {
    Promise.all([getOrders(), getEmailLogs(), getSmsLogs(), getPaymentLogs()])
      .then(([savedOrders, savedEmailLogs, savedSmsLogs, savedPaymentLogs]) => {
        setOrders(savedOrders);
        setEmailLogs(savedEmailLogs);
        setSmsLogs(savedSmsLogs);
        setPaymentLogs(savedPaymentLogs);
      })
      .catch(console.error);
  }, []);

  async function toggleOrder(orderId: string) {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(undefined);
      return;
    }

    setExpandedOrderId(orderId);

    if (!orderEmailLogs[orderId]) {
      const logs = await getEmailLogsForOrder(orderId);
      setOrderEmailLogs((current) => ({
        ...current,
        [orderId]: logs
      }));
    }

    if (!orderSmsLogs[orderId]) {
      const logs = await getSmsLogsForOrder(orderId);
      setOrderSmsLogs((current) => ({
        ...current,
        [orderId]: logs
      }));
    }

    if (!orderPaymentLogs[orderId]) {
      const logs = await getPaymentLogsForOrder(orderId);
      setOrderPaymentLogs((current) => ({
        ...current,
        [orderId]: logs
      }));
    }
  }

  async function handleSendOrderSms(order: Order) {
    try {
      const result = await sendTwilioOrderReceivedSms(order.id);

      setSmsResultMessage(
        result.success
          ? `${result.status}: ${result.message ?? `Order SMS processed for ${order.id}`}`
          : `failed: ${result.error ?? `Order SMS failed for ${order.id}`}`
      );

      if (result.smsLog) {
        setOrderSmsLogs((current) => ({
          ...current,
          [order.id]: [result.smsLog as SmsLog, ...(current[order.id] ?? [])]
        }));
      }
    } catch (error) {
      setSmsResultMessage(error instanceof Error ? error.message : "Order SMS failed");
    } finally {
      setOrders(await getOrders());
      setSmsLogs(await getSmsLogs());
    }
  }

  async function handlePayNow(order: Order) {
    try {
      const result = await createCheckoutSession(order.id);
      setPaymentResultMessage(`Stripe Checkout Session created for ${order.id}`);
      window.location.href = result.checkoutUrl;
    } catch (error) {
      setPaymentResultMessage(error instanceof Error ? error.message : "Stripe Checkout Session creation failed");
      setPaymentLogs(await getPaymentLogs());
      setOrders(await getOrders());
    }
  }

  const draftOrders = orders.filter((order) => order.status === "draft").length;
  const totalRevenue = orders.reduce((sum, order) => sum + order.amount, 0);

  return (
    <div className="page-stack">
      <section className="metrics-grid">
        <div className="metric">
          <span>Total orders</span>
          <strong>{orders.length}</strong>
        </div>
        <div className="metric">
          <span>Draft orders</span>
          <strong>{draftOrders}</strong>
        </div>
        <div className="metric">
          <span>Mock order value</span>
          <strong>${totalRevenue.toFixed(2)}</strong>
        </div>
      </section>
      <OrderTable
        expandedOrderId={expandedOrderId}
        onToggleOrder={toggleOrder}
        orders={orders}
        renderOrderActions={(order) => (
          <div className="button-row">
            {(order.paymentStatus === "unpaid" || order.paymentStatus === "failed") ? (
              <button className="link-button" type="button" onClick={() => handlePayNow(order)}>
                Pay Now
              </button>
            ) : (
              <span>{order.paymentStatus === "paid" ? "Paid" : "Payment Pending"}</span>
            )}
            <button className="link-button" type="button" onClick={() => handleSendOrderSms(order)}>
              Send Order SMS
            </button>
          </div>
        )}
        renderExpandedOrder={(order) => (
          <div className="expanded-content">
            <h3>Email Logs for {order.id}</h3>
            <EmailLogTable
              emailLogs={orderEmailLogs[order.id] ?? []}
              emptyMessage="No email logs for this order yet."
            />
            <h3>SMS Logs for {order.id}</h3>
            <SmsLogTable
              smsLogs={orderSmsLogs[order.id] ?? []}
              emptyMessage="No SMS logs for this order yet."
            />
            <h3>Payment Logs for {order.id}</h3>
            <PaymentLogTable
              paymentLogs={orderPaymentLogs[order.id] ?? []}
              emptyMessage="No payment logs for this order yet."
            />
          </div>
        )}
      />
      {paymentResultMessage ? (
        <section className="panel">
          <div className="test-readout">
            <strong>Latest payment result</strong>
            <span>{paymentResultMessage}</span>
          </div>
        </section>
      ) : null}
      {smsResultMessage ? (
        <section className="panel">
          <div className="test-readout">
            <strong>Latest SMS result</strong>
            <span>{smsResultMessage}</span>
          </div>
        </section>
      ) : null}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Recent Email Logs</h2>
            <p>{emailLogs.length} email log{emailLogs.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        <EmailLogTable emailLogs={emailLogs} />
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Recent SMS Logs</h2>
            <p>{smsLogs.length} SMS log{smsLogs.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        <SmsLogTable smsLogs={smsLogs} />
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Recent Payment Logs</h2>
            <p>{paymentLogs.length} payment log{paymentLogs.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        <PaymentLogTable paymentLogs={paymentLogs} />
      </section>
    </div>
  );
}
