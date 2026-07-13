import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { getBytes, ref, uploadBytes } from "firebase/storage";

let testEnv: RulesTestEnvironment;
beforeAll(async () => { testEnv = await initializeTestEnvironment({ projectId: "accelprojects-storage-rules-test", storage: { rules: readFileSync("storage.rules", "utf8") } }); });
afterAll(async () => testEnv.cleanup());

describe("managed document Storage rules", () => {
  it("denies browser upload and download even on a correctly shaped managed path", async () => {
    const storage = testEnv.authenticatedContext("owner_pm").storage();
    const object = ref(storage, "organizations/org_accel_projects/projects/project_1/documents/document_1/versions/version_1/file.pdf");
    await assertFails(uploadBytes(object, new Uint8Array([1, 2, 3]), { contentType: "application/pdf" }));
    await assertFails(getBytes(object));
  });
  it("denies arbitrary and cross-project paths", async () => { const storage = testEnv.authenticatedContext("owner_pm").storage(); await assertFails(uploadBytes(ref(storage, "arbitrary/credential.exe"), new Uint8Array([1]))); await assertFails(uploadBytes(ref(storage, "organizations/other/projects/other/documents/d/versions/v/file.txt"), new Uint8Array([1]))); });
});
