/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BriefcaseBusiness, Home, Settings } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalNavigation, isActiveGlobalRoute, type GlobalNavItem } from "./GlobalNavigation";

const primaryItems: GlobalNavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/projects", label: "Projects", icon: BriefcaseBusiness }
];

const utilityItems: GlobalNavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings }
];

afterEach(() => {
  cleanup();
});

describe("GlobalNavigation", () => {
  it("keeps project routes active on nested project workspace paths", () => {
    expect(isActiveGlobalRoute("/projects", "/projects/project_1/plan")).toBe(true);
    expect(isActiveGlobalRoute("/", "/projects/project_1/plan")).toBe(false);
  });

  it("renders an accessible active item and navigates without full page reload", async () => {
    const onNavigate = vi.fn();
    renderNavigation({ pathname: "/projects/project_1/plan", onNavigate });

    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("link", { name: "Settings" }));

    expect(onNavigate).toHaveBeenCalledWith("/settings");
  });

  it("supports collapsed labels through accessible names and tooltips", async () => {
    const onCollapsedChange = vi.fn();
    renderNavigation({ collapsed: true, onCollapsedChange });

    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("title", "Projects");

    await userEvent.click(screen.getByRole("button", { name: "Expand global navigation" }));

    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });
});

function renderNavigation({
  pathname = "/",
  collapsed = false,
  onNavigate = vi.fn(),
  onCollapsedChange = vi.fn()
}: {
  pathname?: string;
  collapsed?: boolean;
  onNavigate?: (path: string) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
} = {}) {
  return render(
    <GlobalNavigation
      pathname={pathname}
      primaryItems={primaryItems}
      utilityItems={utilityItems}
      collapsed={collapsed}
      brandLogo="/logo.png"
      onCollapsedChange={onCollapsedChange}
      onNavigate={onNavigate}
    />
  );
}
