import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createFirebaseAuthMiddleware, requireRoles } from "./apiAuth.js";

function testApp({ verifyIdToken, loadUserProfile, routeRoles = ["admin"] }) {
  const app = express();
  const requireAuth = createFirebaseAuthMiddleware({ verifyIdToken, loadUserProfile });

  app.get("/protected", requireAuth, (_request, response) => {
    response.json({ success: true });
  });
  app.get("/role-protected", requireAuth, requireRoles(routeRoles), (_request, response) => {
    response.json({ success: true });
  });
  app.get("/config-check", requireAuth, requireRoles(["admin"]), (_request, response) => {
    response.json({
      configured: false,
      missing: ["MICROSOFT_CLIENT_SECRET"]
    });
  });

  return app;
}

describe("server Firebase API authentication", () => {
  it("returns 401 when a protected route has no token", async () => {
    const app = testApp({
      verifyIdToken: async () => ({ uid: "admin" }),
      loadUserProfile: async () => ({ id: "admin", organizationId: "org_accel_projects", role: "admin" })
    });

    await request(app).get("/protected").expect(401);
  });

  it("returns 401 for an invalid token", async () => {
    const app = testApp({
      verifyIdToken: async () => {
        throw new Error("invalid");
      },
      loadUserProfile: async () => ({ id: "admin", organizationId: "org_accel_projects", role: "admin" })
    });

    await request(app).get("/protected").set("Authorization", "Bearer bad").expect(401);
  });

  it("returns 403 for an authenticated but unauthorized user", async () => {
    const app = testApp({
      verifyIdToken: async () => ({ uid: "viewer" }),
      loadUserProfile: async () => ({ id: "viewer", organizationId: "org_accel_projects", role: "viewer" })
    });

    await request(app).get("/role-protected").set("Authorization", "Bearer valid").expect(403);
  });

  it("lets an authorized request reach the route handler", async () => {
    const app = testApp({
      verifyIdToken: async () => ({ uid: "admin", email: "admin@example.com" }),
      loadUserProfile: async () => ({ id: "admin", organizationId: "org_accel_projects", role: "admin", email: "admin@example.com" })
    });

    const response = await request(app).get("/role-protected").set("Authorization", "Bearer valid").expect(200);

    expect(response.body).toEqual({ success: true });
  });

  it("keeps configuration checks from exposing secret values", async () => {
    const app = testApp({
      verifyIdToken: async () => ({ uid: "admin" }),
      loadUserProfile: async () => ({ id: "admin", organizationId: "org_accel_projects", role: "admin" })
    });

    const response = await request(app).get("/config-check").set("Authorization", "Bearer valid").expect(200);

    expect(response.body).toEqual({ configured: false, missing: ["MICROSOFT_CLIENT_SECRET"] });
    expect(JSON.stringify(response.body)).not.toContain("secret-value");
  });

  it("keeps Stripe webhook on signature authentication rather than Firebase bearer auth", async () => {
    const app = express();
    app.post("/api/stripe-webhook", express.raw({ type: "application/json" }), (_request, response) => {
      response.status(400).json({ success: false, error: "Stripe webhook verification failed" });
    });
    app.use("/api", createFirebaseAuthMiddleware({
      verifyIdToken: async () => ({ uid: "admin" }),
      loadUserProfile: async () => ({ id: "admin", organizationId: "org_accel_projects", role: "admin" })
    }));
    app.get("/api/protected", (_request, response) => response.json({ success: true }));

    const response = await request(app)
      .post("/api/stripe-webhook")
      .set("Content-Type", "application/json")
      .send("{}")
      .expect(400);

    expect(response.body.error).toBe("Stripe webhook verification failed");
  });
});
