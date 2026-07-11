import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";

export type GlobalNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function isActiveGlobalRoute(href: string, pathname: string) {
  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/projects") {
    return pathname === "/projects" || pathname.startsWith("/projects/");
  }

  return pathname === href || (href === "/system-tests" && (pathname === "/admin" || pathname === "/test"));
}

export function GlobalNavigation({
  pathname,
  primaryItems,
  utilityItems,
  collapsed,
  brandLogo,
  onCollapsedChange,
  onNavigate
}: {
  pathname: string;
  primaryItems: GlobalNavItem[];
  utilityItems: GlobalNavItem[];
  collapsed: boolean;
  brandLogo: string;
  onCollapsedChange: (collapsed: boolean) => void;
  onNavigate: (path: string) => void;
}) {
  function renderNavItem(item: GlobalNavItem) {
    const Icon = item.icon;
    const active = isActiveGlobalRoute(item.href, pathname);

    return (
      <a
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={active ? "sidebar-link active" : "sidebar-link"}
        href={item.href}
        key={item.href}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(item.href);
        }}
        title={collapsed ? item.label : undefined}
      >
        <Icon size={18} aria-hidden="true" />
        <span>{item.label}</span>
      </a>
    );
  }

  return (
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"} aria-label="Global navigation">
      <div className="sidebar-topline">
        <a
          aria-label="AccelProjects home"
          className="sidebar-brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/");
          }}
          title={collapsed ? "AccelProjects" : undefined}
        >
          <span className="brand-logo">
            <img src={brandLogo} alt="" aria-hidden="true" />
          </span>
          <span className="brand-text">
            <strong>AccelProjects</strong>
            <small>Project Operations</small>
          </span>
        </a>
        <button
          aria-label={collapsed ? "Expand global navigation" : "Collapse global navigation"}
          className="sidebar-collapse-button"
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
        </button>
      </div>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {primaryItems.map(renderNavItem)}
      </nav>
      <nav className="sidebar-nav sidebar-utility-nav" aria-label="Utilities">
        {utilityItems.map(renderNavItem)}
      </nav>
    </aside>
  );
}
