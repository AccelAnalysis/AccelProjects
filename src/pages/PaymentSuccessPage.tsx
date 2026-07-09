export function PaymentSuccessPage() {
  const sessionId = new URLSearchParams(window.location.search).get("session_id");

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Payment submitted</h1>
          <p>Stripe received the checkout result. Final payment confirmation is handled by webhook processing.</p>
        </div>
      </div>
      <div className="test-readout">
        <strong>Checkout Session</strong>
        <span>{sessionId || "No session ID was provided."}</span>
      </div>
    </section>
  );
}
