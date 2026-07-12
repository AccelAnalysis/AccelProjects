import { randomUUID } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { API_ORGANIZATION_ID, getAdminApp } from "./apiAuth.js";

const dbDefault = () => getFirestore(getAdminApp());
const commentRef = (db, projectId, taskId, commentId) => db.doc(`organizations/${API_ORGANIZATION_ID}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`);
export class CommentError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }

export async function createControlledComment(projectId, taskId, actor, input, { database = dbDefault(), now = new Date() } = {}) {
  if (typeof input.body !== "string" || !input.body.trim()) throw new CommentError("comment_body_required");
  const id = `comment_${randomUUID().replaceAll("-", "").slice(0, 16)}`; const timestamp = now.toISOString();
  const comment = { id, taskId, authorId: actor.uid, body: input.body.trim().slice(0, 10000), visibility: input.visibility === "client" ? "client" : "internal", createdAt: timestamp, revision: 1 };
  await commentRef(database, projectId, taskId, id).set(comment); return comment;
}

export async function editControlledComment(projectId, taskId, commentId, actor, body, { database = dbDefault(), now = new Date(), editWindowMinutes = 15 } = {}) {
  const ref = commentRef(database, projectId, taskId, commentId); let result;
  await database.runTransaction(async (transaction) => { const snapshot = await transaction.get(ref); if (!snapshot.exists) throw new CommentError("comment_not_found", 404); const comment = snapshot.data(); if (comment.authorId !== actor.uid) throw new CommentError("comment_author_required", 403); if (comment.moderation?.state && comment.moderation.state !== "visible") throw new CommentError("comment_not_editable", 409); if (now.getTime() - Date.parse(comment.createdAt) > editWindowMinutes * 60000) throw new CommentError("comment_edit_window_expired", 409); if (typeof body !== "string" || !body.trim()) throw new CommentError("comment_body_required"); const revision = comment.revision || 1; const history = ref.collection("revisions").doc(`revision_${revision}`); transaction.create(history, { id: history.id, commentId, body: comment.body, visibility: comment.visibility, revision, replacedAt: now.toISOString(), replacedBy: actor.uid }); const patch = { body: body.trim().slice(0, 10000), revision: revision + 1, editedAt: now.toISOString(), editedBy: actor.uid }; transaction.update(ref, patch); result = { ...comment, ...patch }; });
  return result;
}

export async function redactComment(projectId, taskId, commentId, actor, reason, state = "redacted_by_manager", { database = dbDefault(), now = new Date() } = {}) {
  if (typeof reason !== "string" || !reason.trim()) throw new CommentError("redaction_reason_required"); const ref = commentRef(database, projectId, taskId, commentId); let result;
  await database.runTransaction(async (transaction) => { const snapshot = await transaction.get(ref); if (!snapshot.exists) throw new CommentError("comment_not_found", 404); const comment = snapshot.data(); const moderationRef = ref.collection("moderationHistory").doc(`moderation_${randomUUID().replaceAll("-", "").slice(0, 16)}`); transaction.create(moderationRef, { id: moderationRef.id, commentId, originalBody: comment.body, originalVisibility: comment.visibility, action: state, reason: reason.trim().slice(0, 500), actorId: actor.uid, createdAt: now.toISOString() }); const moderation = { state, at: now.toISOString(), by: actor.uid, reason: reason.trim().slice(0, 500) }; const patch = { body: "", moderation, editedAt: now.toISOString(), editedBy: actor.uid }; transaction.update(ref, patch); result = { ...comment, ...patch }; });
  return result;
}
