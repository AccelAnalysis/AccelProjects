import { API_ORGANIZATION_ID } from "./apiAuth.js";

const referenceCollections = [
  ["report", "reports", false],
  ["reportSnapshot", "reports", true, "snapshots"],
  ["reportArtifact", "reports", true, "artifacts"],
  ["communication", "communications", false],
  ["calendarEvent", "calendarEvents", false],
  ["activityEvent", "activityEvents", false],
  ["projectVersion", "versions", false],
  ["exportSnapshot", "exportSnapshots", false],
  ["updateManifest", "updateManifests", false],
  ["importManifest", "importManifests", false],
  ["document", "documents", false]
];

const immutableReferenceTypes = new Set(["reportSnapshot", "reportArtifact", "activityEvent", "projectVersion", "exportSnapshot", "updateManifest", "importManifest"]);

function containsReference(value, entityId) {
  if (value === entityId) return true;
  if (Array.isArray(value)) return value.some((item) => containsReference(item, entityId));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsReference(item, entityId));
  return false;
}

async function boundedCollection(collection, limit) {
  const snapshot = await collection.orderBy("__name__").limit(limit + 1).get();
  return { docs: snapshot.docs.slice(0, limit), truncated: snapshot.size > limit };
}

export async function scanProjectReferences(database, projectId, entityId, { limitPerCollection = 500 } = {}) {
  const project = database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${projectId}`);
  const retained = [];
  const operational = [];
  const warnings = [];

  for (const [entityType, collectionName, nested, nestedName] of referenceCollections) {
    if (!nested) {
      const result = await boundedCollection(project.collection(collectionName), limitPerCollection);
      const ids = result.docs.filter((item) => containsReference(item.data(), entityId)).map((item) => item.id).sort();
      if (ids.length) (immutableReferenceTypes.has(entityType) ? retained : operational).push({ entityType, count: ids.length, ids });
      if (result.truncated) warnings.push(`reference_scan_truncated:${collectionName}`);
      continue;
    }

    const parents = await boundedCollection(project.collection(collectionName), limitPerCollection);
    const ids = [];
    for (const parent of parents.docs) {
      const children = await boundedCollection(parent.ref.collection(nestedName), limitPerCollection);
      children.docs.filter((item) => containsReference(item.data(), entityId)).forEach((item) => ids.push(`${parent.id}/${item.id}`));
      if (children.truncated) warnings.push(`reference_scan_truncated:${collectionName}/${parent.id}/${nestedName}`);
    }
    if (ids.length) retained.push({ entityType, count: ids.length, ids: ids.sort() });
    if (parents.truncated) warnings.push(`reference_scan_truncated:${collectionName}`);
  }

  return { retained, operational, warnings: [...new Set(warnings)].sort() };
}

export const referenceContainsEntity = containsReference;
