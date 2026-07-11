import type { Order, OrderInput, OrderStatus } from "../types";

const STORAGE_KEY = "mini-billing-messenger-orders-v2";

export const services = [
  { name: "Business Consultation", amount: 25 },
  { name: "Project Setup Review", amount: 50 },
  { name: "Dashboard Demo", amount: 75 }
] as const;

export const orderStatuses: OrderStatus[] = ["draft", "pending_payment", "paid", "failed"];

const starterOrders: Order[] = [
  {
    id: "order-demo-1001",
    customerName: "Avery Johnson",
    email: "avery@example.com",
    phone: "555-0101",
    service: "Business Consultation",
    amount: 25,
    smsConsent: false,
    status: "draft",
    paymentProvider: null,
    paymentStatus: "unpaid",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    paidAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

function readStoredOrders(): Order[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Order[]) : null;
  } catch {
    return null;
  }
}

function writeStoredOrders(orders: Order[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

export function getOrders(): Order[] {
  const stored = readStoredOrders();

  if (stored) {
    return stored;
  }

  writeStoredOrders(starterOrders);
  return starterOrders;
}

export function createOrder(input: OrderInput): Order {
  const now = new Date().toISOString();
  const order: Order = {
    ...input,
    id: `order-${Date.now()}`,
    status: "draft",
    paymentProvider: null,
    paymentStatus: "unpaid",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    paidAt: null,
    createdAt: now,
    updatedAt: now
  };
  const orders = [order, ...getOrders()];
  writeStoredOrders(orders);
  return order;
}

export function getOrderById(id: string): Order | undefined {
  return getOrders().find((order) => order.id === id);
}

export function updateOrderStatus(id: string, status: OrderStatus): Order | undefined {
  if (!orderStatuses.includes(status)) {
    return undefined;
  }

  let updatedOrder: Order | undefined;
  const orders = getOrders().map((order) => {
    if (order.id !== id) {
      return order;
    }

    updatedOrder = { ...order, status };
    return updatedOrder;
  });

  writeStoredOrders(orders);
  return updatedOrder;
}

export function clearOrders() {
  writeStoredOrders([]);
}

export function seedTestOrder() {
  return createOrder({
    customerName: "Sample Customer",
    email: "sample@example.com",
    phone: "+15555555555",
    service: "Dashboard Demo",
    amount: 75,
    smsConsent: true
  });
}
