import "dotenv/config";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "../server/apiAuth.js";
import { acceptancePassword, acceptanceUsers, seedLifecycleAcceptanceFixtures } from "../server/lifecycleAcceptanceFixtures.js";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Acceptance fixtures may only be seeded while Auth, Firestore, and Storage emulators are configured.");
}
const auth = getAuth(getAdminApp());
for (const [uid] of acceptanceUsers) {
  await auth.deleteUser(uid).catch(() => undefined);
  await auth.createUser({ uid, email: `${uid}@example.test`, password: acceptancePassword, emailVerified: true });
}
const result = await seedLifecycleAcceptanceFixtures();
process.stdout.write(`${JSON.stringify({ seeded: true, ...result }, null, 2)}\n`);
