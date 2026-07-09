import { Fragment } from "react";
import type { Order } from "../types";

type OrderTableProps = {
  orders: Order[];
  expandedOrderId?: string;
  onToggleOrder?: (orderId: string) => void;
  renderExpandedOrder?: (order: Order) => React.ReactNode;
  renderOrderActions?: (order: Order) => React.ReactNode;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

function formatStatus(status: Order["status"]) {
  return status.replace("_", " ");
}

function formatPaymentStatus(order: Order) {
  if (order.paymentStatus === "pending") {
    return "Payment Pending";
  }

  if (order.paymentStatus === "paid") {
    return "Paid";
  }

  return order.paymentStatus;
}

export function OrderTable({ orders, expandedOrderId, onToggleOrder, renderExpandedOrder, renderOrderActions }: OrderTableProps) {
  if (orders.length === 0) {
    return (
      <section className="panel empty-state">
        <h2>No orders yet</h2>
        <p>Saved mock orders will appear here.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Orders</h2>
          <p>{orders.length} local mock order{orders.length === 1 ? "" : "s"}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Service</th>
              <th>Amount</th>
              <th>SMS Consent</th>
              <th>Status</th>
              <th>Payment Status</th>
              <th>Payment Provider</th>
              <th>Stripe Checkout Session ID</th>
              <th>Stripe Payment Intent ID</th>
              <th>Paid At</th>
              <th>Created At</th>
              {renderOrderActions ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const isExpanded = expandedOrderId === order.id;

              return (
                <Fragment key={order.id}>
                  <tr>
                    <td className="order-id">
                      {onToggleOrder ? (
                        <button className="link-button" type="button" onClick={() => onToggleOrder(order.id)}>
                          {isExpanded ? "Hide" : "View"}
                        </button>
                      ) : null}
                      {order.id}
                    </td>
                    <td>{order.customerName}</td>
                    <td>{order.email}</td>
                    <td>{order.phone}</td>
                    <td>
                      <strong>{order.service}</strong>
                    </td>
                    <td>{currency.format(order.amount)}</td>
                    <td>{order.smsConsent ? "Yes" : "No"}</td>
                    <td>
                      <span className={`status-pill status-${order.status}`}>{formatStatus(order.status)}</span>
                    </td>
                    <td>
                      <span className={`status-pill status-${order.paymentStatus}`}>{formatPaymentStatus(order)}</span>
                    </td>
                    <td>{order.paymentProvider || "None"}</td>
                    <td className="order-id">{order.stripeCheckoutSessionId || "None"}</td>
                    <td className="order-id">{order.stripePaymentIntentId || "None"}</td>
                    <td>{order.paidAt ? new Date(order.paidAt).toLocaleString() : "None"}</td>
                    <td>{new Date(order.createdAt).toLocaleString()}</td>
                    {renderOrderActions ? <td>{renderOrderActions(order)}</td> : null}
                  </tr>
                  {isExpanded && renderExpandedOrder ? (
                    <tr key={`${order.id}-email-logs`} className="expanded-row">
                      <td colSpan={renderOrderActions ? 15 : 14}>{renderExpandedOrder(order)}</td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
