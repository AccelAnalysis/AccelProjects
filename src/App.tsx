import { ClipboardList, FlaskConical, LayoutDashboard } from "lucide-react";
import { AdminPage } from "./pages/AdminPage";
import { CustomerOrderPage } from "./pages/CustomerOrderPage";
import { PaymentCancelPage } from "./pages/PaymentCancelPage";
import { PaymentSuccessPage } from "./pages/PaymentSuccessPage";
import { TestPage } from "./pages/TestPage";

const navItems = [
  { href: "/", label: "Orders", icon: ClipboardList },
  { href: "/admin", label: "Admin", icon: LayoutDashboard },
  { href: "/test", label: "Test", icon: FlaskConical }
];

function getRoute() {
  const path = window.location.pathname;

  if (path === "/admin") {
    return <AdminPage />;
  }

  if (path === "/test") {
    return <TestPage />;
  }

  if (path === "/payment-success") {
    return <PaymentSuccessPage />;
  }

  if (path === "/payment-cancel") {
    return <PaymentCancelPage />;
  }

  return <CustomerOrderPage />;
}

export function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">MB</span>
          <span>Mini Billing Messenger</span>
        </a>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = window.location.pathname === item.href;

            return (
              <a className={active ? "nav-link active" : "nav-link"} href={item.href} key={item.href}>
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
      </header>
      <main className="main">{getRoute()}</main>
    </div>
  );
}
