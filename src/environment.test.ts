import { describe, expect, it } from "vitest";
import { areDevelopmentToolsEnabled, isRolePreviewEnabled } from "./environment";

describe("environment guards", () => {
  it("disables role preview by default", () => {
    expect(isRolePreviewEnabled({ DEV: true, MODE: "development" })).toBe(false);
    expect(isRolePreviewEnabled({ PROD: true, MODE: "production", VITE_ENABLE_ROLE_PREVIEW: "true" })).toBe(false);
  });

  it("allows role preview only in development or explicit test mode", () => {
    expect(isRolePreviewEnabled({ DEV: true, MODE: "development", VITE_ENABLE_ROLE_PREVIEW: "true" })).toBe(true);
    expect(isRolePreviewEnabled({ MODE: "test", VITE_ENABLE_ROLE_PREVIEW: "true" })).toBe(true);
  });

  it("hides development tools in production and allows them in development", () => {
    expect(areDevelopmentToolsEnabled({ PROD: true, MODE: "production", VITE_ENABLE_DEVELOPMENT_TOOLS: "true" })).toBe(false);
    expect(areDevelopmentToolsEnabled({ DEV: true, MODE: "development" })).toBe(true);
    expect(areDevelopmentToolsEnabled({ MODE: "test", VITE_ENABLE_DEVELOPMENT_TOOLS: "true" })).toBe(true);
  });
});
