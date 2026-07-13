import { getFirestore } from "firebase-admin/firestore";
import { API_ORGANIZATION_ID, getAdminApp } from "../server/apiAuth.js";

const apply = process.argv.includes("--apply");
const database = getFirestore(getAdminApp());
const snapshot = await database.collectionGroup("members").get();
const candidates = snapshot.docs.filter((item) => {
  const organization = item.ref.path.split("/")[1];
  return organization === API_ORGANIZATION_ID && !["active", "removed"].includes(item.data().accessState);
});

const updates = candidates.map((item) => ({
  ref: item.ref,
  accessState: item.data().lifecycle?.state === "removed" ? "removed" : "active"
}));

console.log(`${apply ? "Applying" : "Dry run:"} ${updates.length} membership accessState backfill(s).`);
for (const item of updates) console.log(`${item.ref.path} -> ${item.accessState}`);

if (apply) {
  for (let offset = 0; offset < updates.length; offset += 400) {
    const batch = database.batch();
    updates.slice(offset, offset + 400).forEach((item) => batch.update(item.ref, { accessState: item.accessState }));
    await batch.commit();
  }
}
