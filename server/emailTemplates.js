function formatAmount(amount) {
  return Number(amount).toFixed(2);
}

export function orderReceivedTemplate(order) {
  return {
    subject: `Order received for ${order.service}`,
    body: `Hi ${order.customerName},

We received your order for ${order.service}.

Order details:
- Service: ${order.service}
- Amount: $${formatAmount(order.amount)}
- Status: ${order.status}

Thank you,
Accel Analysis`
  };
}

export function paymentPendingTemplate(order) {
  return {
    subject: `Payment pending for ${order.service}`,
    body: `Hi ${order.customerName},

Your payment is pending for ${order.service}.

Amount due: $${formatAmount(order.amount)}

Thank you,
Accel Analysis`
  };
}

export function paymentReceivedTemplate(order) {
  return {
    subject: `Payment received for ${order.service}`,
    body: `Hi ${order.customerName},

We received your payment for ${order.service}.

Amount paid: $${formatAmount(order.amount)}

Thank you,
Accel Analysis`
  };
}
