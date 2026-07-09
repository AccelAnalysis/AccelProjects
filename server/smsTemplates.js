function formatAmount(amount) {
  return Number(amount).toFixed(2);
}

export function orderReceivedSmsTemplate(order) {
  return `Hi ${order.customerName}, we received your order for ${order.service}. Amount: $${formatAmount(order.amount)}. - Accel Analysis`;
}

export function paymentPendingSmsTemplate(order) {
  return `Hi ${order.customerName}, payment is pending for ${order.service}. Amount: $${formatAmount(order.amount)}. - Accel Analysis`;
}

export function paymentReceivedSmsTemplate(order) {
  return `Hi ${order.customerName}, payment was received for ${order.service}. Amount: $${formatAmount(order.amount)}. - Accel Analysis`;
}
