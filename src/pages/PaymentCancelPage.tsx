export function PaymentCancelPage() {
  const orderId = new URLSearchParams(window.location.search).get("orderId");

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Payment canceled</h1>
          <p>The checkout flow was canceled. The order was not marked paid.</p>
        </div>
      </div>
      <div className="test-readout">
        <strong>Order</strong>
        <span>{orderId || "No order ID was provided."}</span>
      </div>
    </section>
  );
}
