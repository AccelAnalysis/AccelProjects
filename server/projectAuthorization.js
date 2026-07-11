import { getFirestore } from "firebase-admin/firestore";
import { API_ORGANIZATION_ID, getAdminApp } from "./apiAuth.js";

function firestore() {
  return getFirestore(getAdminApp());
}

export async function loadProjectAccess({ uid, role }, projectId, { database = firestore() } = {}) {
  const projectRef = database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${projectId}`);
  const projectSnapshot = await projectRef.get();

  if (!projectSnapshot.exists) {
    return { found: false, canRead: false, canManageCommunication: false, canManageCalendar: false, project: null, membership: null };
  }

  const project = { id: projectSnapshot.id, ...projectSnapshot.data() };
  const membershipSnapshot = await projectRef.collection("members").doc(uid).get();
  const membership = membershipSnapshot.exists ? { id: membershipSnapshot.id, ...membershipSnapshot.data() } : null;
  const isClient = role === "client";
  const isAdmin = role === "admin";
  const isOwnerManager = role === "project_manager" && project.ownerId === uid;
  const isLeadManager = role === "project_manager" && membership?.role === "lead";
  const isMember = Boolean(membership);
  const canRead = !isClient && (isAdmin || isOwnerManager || isMember);
  const canManage = !isClient && (isAdmin || isOwnerManager || isLeadManager);

  return {
    found: true,
    canRead,
    canManageCommunication: canManage,
    canManageCalendar: canManage,
    project,
    membership
  };
}

export function requireProjectAccess(level, { loadAccess = loadProjectAccess } = {}) {
  return async function requireProjectAccessMiddleware(request, response, next) {
    const projectId = request.params.projectId;
    const uid = request.auth?.uid;
    const role = request.auth?.profile?.role;

    if (!uid || !role) {
      return response.status(401).json({ success: false, error: "Missing authenticated project user" });
    }

    const access = await loadAccess({ uid, role }, projectId);

    if (!access.found) {
      return response.status(404).json({ success: false, error: "Project not found" });
    }

    const allowed =
      level === "read"
        ? access.canRead
        : level === "communication"
          ? access.canManageCommunication
          : access.canManageCalendar;

    if (!allowed) {
      return response.status(403).json({ success: false, error: "Insufficient project authorization" });
    }

    request.projectAccess = access;
    return next();
  };
}
