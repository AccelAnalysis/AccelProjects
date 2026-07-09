export function SystemTestsPage() {
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>System Tests</h1>
            <p>Operational tools for validating backend routes, integrations, logs, billing, email, SMS, and payments.</p>
          </div>
        </div>
        <div className="page-grid three">
          <a className="system-card" href="/test">
            <strong>Integration Test Center</strong>
            <span>Manual API, email, SMS, Stripe, and log checks</span>
          </a>
          <a className="system-card" href="/admin">
            <strong>Operations Dashboard</strong>
            <span>Orders, email logs, SMS logs, payment logs, and actions</span>
          </a>
          <a className="system-card" href="/billing">
            <strong>Billing / Order Test Flows</strong>
            <span>Create draft orders and verify billing module behavior</span>
          </a>
        </div>
      </section>
    </div>
  );
}
