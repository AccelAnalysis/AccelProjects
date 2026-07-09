import { useEffect, useState } from "react";
import { OrderForm } from "../components/OrderForm";
import { OrderTable } from "../components/OrderTable";
import { getOrders } from "../data/api";
import type { Order } from "../types";

export function CustomerOrderPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  async function loadOrders() {
    setOrders(await getOrders());
  }

  useEffect(() => {
    loadOrders().catch(console.error);
  }, []);

  return (
    <div className="page-stack">
      <section className="panel module-page-header">
        <div>
          <h1>Billing</h1>
          <p>Orders, payments, and project billing events</p>
        </div>
      </section>
      <OrderForm onSaved={() => loadOrders()} />
      <OrderTable orders={orders} />
    </div>
  );
}
