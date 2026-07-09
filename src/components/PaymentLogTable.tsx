import type { PaymentLog } from "../types";

type PaymentLogTableProps = {
  paymentLogs: PaymentLog[];
  emptyMessage?: string;
};

export function PaymentLogTable({ paymentLogs, emptyMessage = "No payment logs yet." }: PaymentLogTableProps) {
  if (paymentLogs.length === 0) {
    return <p className="table-empty">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Created At</th>
            <th>Order ID</th>
            <th>Provider</th>
            <th>Type</th>
            <th>Status</th>
            <th>Amount</th>
            <th>Currency</th>
            <th>Checkout Session ID</th>
            <th>Payment Intent ID</th>
            <th>Stripe Event ID</th>
            <th>Message</th>
            <th>Error Message</th>
          </tr>
        </thead>
        <tbody>
          {paymentLogs.map((paymentLog) => (
            <tr key={paymentLog.id}>
              <td>{new Date(paymentLog.createdAt).toLocaleString()}</td>
              <td className="order-id">{paymentLog.orderId}</td>
              <td>{paymentLog.provider}</td>
              <td>{paymentLog.type}</td>
              <td>
                <span className={`status-pill status-${paymentLog.status}`}>{paymentLog.status}</span>
              </td>
              <td>${paymentLog.amount.toFixed(2)}</td>
              <td>{paymentLog.currency}</td>
              <td className="order-id">{paymentLog.stripeCheckoutSessionId || "None"}</td>
              <td className="order-id">{paymentLog.stripePaymentIntentId || "None"}</td>
              <td className="order-id">{paymentLog.stripeEventId || "None"}</td>
              <td>{paymentLog.message || "None"}</td>
              <td>{paymentLog.errorMessage || "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
