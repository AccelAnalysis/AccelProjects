import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const API_ORGANIZATION_ID = process.env.FIRESTORE_ORGANIZATION_ID || "org_accel_projects";

export function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  return initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || "accelprojects"
  });
}

function getBearerToken(request) {
  const header = request.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  return scheme?.toLowerCase() === "bearer" && token ? token : "";
}

async function verifyFirebaseIdToken(token) {
  return getAuth(getAdminApp()).verifyIdToken(token);
}

async function loadOrganizationUserProfile(uid) {
  const snapshot = await getFirestore(getAdminApp())
    .doc(`organizations/${API_ORGANIZATION_ID}/users/${uid}`)
    .get();

  return snapshot.exists ? snapshot.data() : null;
}

export function createFirebaseAuthMiddleware({
  verifyIdToken = verifyFirebaseIdToken,
  loadUserProfile = loadOrganizationUserProfile
} = {}) {
  return async function requireFirebaseAuth(request, response, next) {
    const token = getBearerToken(request);

    if (!token) {
      return response.status(401).json({ success: false, error: "Missing Firebase bearer token" });
    }

    try {
      const decodedToken = await verifyIdToken(token);
      const profile = await loadUserProfile(decodedToken.uid);

      if (!profile || profile.organizationId !== API_ORGANIZATION_ID) {
        return response.status(403).json({ success: false, error: "Authenticated user is not authorized for this organization" });
      }

      request.auth = {
        uid: decodedToken.uid,
        email: decodedToken.email || profile.email || "",
        profile
      };
      return next();
    } catch {
      return response.status(401).json({ success: false, error: "Invalid or expired Firebase bearer token" });
    }
  };
}

export function requireRoles(allowedRoles) {
  return function requireAllowedRole(request, response, next) {
    const role = request.auth?.profile?.role;

    if (!allowedRoles.includes(role)) {
      return response.status(403).json({ success: false, error: "Insufficient authorization for this API action" });
    }

    return next();
  };
}
