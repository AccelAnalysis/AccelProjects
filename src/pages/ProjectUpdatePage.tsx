import { CheckCircle2, FileJson, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProjectPageProps } from "../App";
import {
  applyProjectUpdateFromExportInFirestore,
  createProjectUpdateEntityId,
  getFirestorePermissionMessage,
  loadProjectExportSnapshotsFromFirestore,
  loadProjectUpdateManifestFromFirestore
} from "../data/firestoreProjectStore";
import { verifyProjectUpdateSource } from "../updates/projectUpdateValidator";
import { createProjectUpdatePlan } from "../updates/projectUpdatePlanner";
import type { ProjectUpdateIssue, ProjectUpdatePlan } from "../updates/projectUpdateTypes";
import { buildProjectPath, buildProjectVersionHistoryPath } from "../routing/projectRoutes";
import { formatDateOnly } from "../utils/dateOnly";
import { queueProjectFileLifecycleUpdate } from "../data/api";

const maxUpdateFileBytes = 2 * 1024 * 1024;

function splitIssues(issues: ProjectUpdateIssue[]) {
  return {
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning")
  };
}

function shortHash(hash: string) {
  return hash ? hash.slice(0, 12) : "";
}

export function ProjectUpdatePage({
  projectState,
  selectedProjectId,
  userProfile,
  canManage,
  canViewInternal,
  onProjectUpdated,
  onNavigate
}: ProjectPageProps) {
  const project = projectState.projects.find((item) => item.id === selectedProjectId);
  const client = projectState.clients.find((item) => item.id === project?.clientId);
  const [rawText, setRawText] = useState("");
  const [plan, setPlan] = useState<ProjectUpdatePlan | null>(null);
  const [issues, setIssues] = useState<ProjectUpdateIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyReviewed, setApplyReviewed] = useState(false);
  const [removalAcknowledged, setRemovalAcknowledged] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof applyProjectUpdateFromExportInFirestore>> | null>(null);
  const [queuedJob, setQueuedJob] = useState<{ id: string; state: string; progress: { completed: number; total: number } } | null>(null);
  const split = splitIssues([...(plan?.validationIssues ?? []), ...issues]);
  const hasRemovals = Boolean(plan && plan.changeCounts.removed > 0);
  const canApply = Boolean(plan && split.errors.length === 0 && plan.changeCounts.added + plan.changeCounts.modified + plan.changeCounts.removed > 0 && applyReviewed && (!hasRemovals || removalAcknowledged) && canManage && !loading);

  const removalSummary = useMemo(() => (
    plan ? Object.entries(plan.destructiveSummary).map(([type, count]) => `${type}: ${count}`).join(", ") : ""
  ), [plan]);

  if (!project) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Project unavailable</h1>
            <p>The selected project could not be loaded.</p>
          </div>
        </div>
      </section>
    );
  }

  if (!canManage || !canViewInternal || !userProfile) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Update via File</h1>
            <p>Your current Firestore profile role cannot apply project file updates.</p>
          </div>
        </div>
      </section>
    );
  }

  const activeProject = project;
  const activeUserProfile = userProfile;

  async function validateText(text: string) {
    setLoading(true);
    setApplyError("");
    setResult(null);
    setQueuedJob(null);
    setPlan(null);
    setIssues([]);
    setApplyReviewed(false);
    setRemovalAcknowledged(false);

    try {
      const snapshots = await loadProjectExportSnapshotsFromFirestore(activeProject.id);
      const source = await verifyProjectUpdateSource({
        projectId: activeProject.id,
        rawText: text,
        snapshots,
        currentState: projectState
      });
      const nextIssues = [...source.issues];

      if (source.uploadedFileHash) {
        const existingManifest = await loadProjectUpdateManifestFromFirestore(activeProject.id, source.uploadedFileHash);
        if (existingManifest) {
          nextIssues.push({
            severity: "error",
            code: "duplicate_update_file",
            message: "This update file has already been applied to this project."
          });
        }
      }

      if (source.uploadedPackage && source.originalPackage && source.sourceSnapshot) {
        const nextPlan = await createProjectUpdatePlan({
          projectId: activeProject.id,
          originalPackage: source.originalPackage,
          uploadedPackage: source.uploadedPackage,
          sourceSnapshot: source.sourceSnapshot,
          currentState: projectState,
          currentUser: activeUserProfile,
          uploadedFileHash: source.uploadedFileHash,
          generateId: (entityType, temporaryId) => createProjectUpdateEntityId(`${entityType}_${temporaryId.replace(/^new_/, "")}`)
        });
        setPlan({
          ...nextPlan,
          validationIssues: [...nextPlan.validationIssues, ...nextIssues]
        });
      } else {
        setIssues(nextIssues);
      }
    } catch (error) {
      setIssues([{
        severity: "error",
        code: "network_failure",
        message: getFirestorePermissionMessage(error)
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!file.name.endsWith(".json") && !file.name.endsWith(".accelproject-export.json")) {
      setIssues([{ severity: "error", code: "wrong_package_type", message: "Choose a .json or .accelproject-export.json file." }]);
      return;
    }

    if (file.size > maxUpdateFileBytes) {
      setIssues([{ severity: "error", code: "project_snapshot_too_large", message: "Update files must be 2 MB or smaller." }]);
      return;
    }

    const text = await file.text();
    setRawText(text);
    await validateText(text);
  }

  async function applyUpdate() {
    if (!plan || !canApply) {
      return;
    }

    setLoading(true);
    setApplyError("");

    try {
      if (plan.executionMode === "durable_lifecycle_job") {
        const queued = await queueProjectFileLifecycleUpdate(activeProject.id, {
          expectedProjectRevision: plan.baseRevision,
          sourceSnapshotId: plan.sourceSnapshotId,
          sourcePackageId: plan.sourcePackageId,
          sourceSnapshotHash: plan.sourceSnapshotHash,
          uploadedFileHash: plan.uploadedFileHash,
          resultStateHash: plan.resultStateHash,
          operations: plan.uploadedPackage.lifecycleOperations ?? []
        });
        setQueuedJob(queued.job);
      } else {
        const applyResult = await applyProjectUpdateFromExportInFirestore(plan);
        setResult(applyResult);
        await onProjectUpdated(activeProject.id);
      }
    } catch (error) {
      setApplyError(getFirestorePermissionMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Existing project update</p>
            <h1>Update via File</h1>
            <p>{project.name} · {client?.name ?? "Client unavailable"} · Revision {project.revision ?? 1}</p>
          </div>
        </div>
        <div className="page-grid three">
          <article className="metric-card">
            <span>Last structural change</span>
            <strong>{project.lastStructuralChangeAt ? formatDateOnly(project.lastStructuralChangeAt.slice(0, 10)) : "Unavailable"}</strong>
            <p>Export the current project before editing.</p>
          </article>
          <article className="metric-card">
            <span>Accepted file</span>
            <strong>.accelproject-export.json</strong>
            <p>.json files up to 2 MB are accepted.</p>
          </article>
          <article className="metric-card">
            <span>Atomic limit</span>
            <strong>450 atomic writes</strong>
            <p>Large lifecycle-only updates use a durable server job.</p>
          </article>
        </div>
        <label className="compact-field full-width">
          Upload project export
          <input type="file" accept=".json,.accelproject-export.json,application/json" onChange={(event) => void handleFile(event.target.files?.[0])} />
        </label>
        <details>
          <summary>Advanced raw JSON</summary>
          <textarea className="json-input" value={rawText} onChange={(event) => setRawText(event.target.value)} />
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => void validateText(rawText)} disabled={!rawText.trim() || loading}>
              <FileJson size={18} aria-hidden="true" />
              Validate JSON
            </button>
          </div>
        </details>
      </section>

      {split.errors.length > 0 || split.warnings.length > 0 ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Validation Results</h2>
              <p>{split.errors.length} blocking errors · {split.warnings.length} warnings</p>
            </div>
          </div>
          <div className="issue-list">
            {[...split.errors, ...split.warnings].map((issue, index) => (
              <article className={`issue-card ${issue.severity}`} key={`${issue.code}-${index}`}>
                <strong>{issue.code}</strong>
                <span>{issue.entityName ?? issue.entityId ?? issue.path}</span>
                <p>{issue.message}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {plan ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Review Changes</h2>
              <p>{plan.humanSummary} Expected writes: {plan.expectedWriteCount}.</p>
            </div>
            <span className="status-badge info">r{plan.baseRevision} → r{plan.resultRevision}</span>
          </div>
          <div className="page-grid three">
            <article className="metric-card"><span>Added</span><strong>{plan.changeCounts.added}</strong><p>New records</p></article>
            <article className="metric-card"><span>Modified</span><strong>{plan.changeCounts.modified}</strong><p>Changed records</p></article>
            <article className="metric-card"><span>Removed</span><strong>{plan.changeCounts.removed}</strong><p>{removalSummary || "No removals"}</p></article>
          </div>
          {(["additions", "modifications", "removals"] as const).map((section) => (
            <details className="diff-section" key={section} open={section !== "modifications"}>
              <summary>{section.replace(/^./, (letter) => letter.toUpperCase())} ({plan[section].length})</summary>
              <div className="issue-list">
                {plan[section].map((change) => (
                  <article className="issue-card" key={`${section}-${change.entityType}-${change.entityId}`}>
                    <strong>{change.entityType}: {change.entityName}</strong>
                    <span>{change.entityId}</span>
                    {change.fields.length > 0 ? (
                      change.fields.slice(0, 6).map((field) => (
                        <p key={field.field}>{field.field}: {String(field.before ?? "blank")} → {String(field.after ?? "blank")}</p>
                      ))
                    ) : <p>{change.kind}</p>}
                  </article>
                ))}
              </div>
            </details>
          ))}
        </section>
      ) : null}

      {plan ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Confirm</h2>
              <p>Source hash {shortHash(plan.uploadedFileHash)} · Result hash {shortHash(plan.resultStateHash)}</p>
            </div>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={applyReviewed} onChange={(event) => setApplyReviewed(event.target.checked)} />
            I reviewed the proposed project changes.
          </label>
          {hasRemovals ? (
            <label className="checkbox-row">
              <input type="checkbox" checked={removalAcknowledged} onChange={(event) => setRemovalAcknowledged(event.target.checked)} />
              I understand that this update removes project records.
            </label>
          ) : null}
          {applyError ? <p className="form-error">{applyError}</p> : null}
          <button className="action-button" type="button" onClick={() => void applyUpdate()} disabled={!canApply}>
            <Upload size={18} aria-hidden="true" />
            {loading ? "Applying..." : plan.executionMode === "durable_lifecycle_job" ? "Queue Durable Update" : "Apply Update"}
          </button>
        </section>
      ) : null}

      {result ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Update Applied</h2>
              <p>{project.name} updated from revision {result.manifest.baseRevision} to {result.manifest.resultRevision}.</p>
            </div>
            <CheckCircle2 size={24} aria-hidden="true" />
          </div>
          <div className="page-grid three">
            <article className="metric-card"><span>Version</span><strong>{result.version.id}</strong><p>One file update revision</p></article>
            <article className="metric-card"><span>Source hash</span><strong>{shortHash(result.manifest.uploadedFileHash)}</strong><p>Duplicate protected</p></article>
            <article className="metric-card"><span>Result hash</span><strong>{shortHash(result.manifest.resultStateHash)}</strong><p>Canonical snapshot</p></article>
          </div>
          <div className="button-row">
            <button className="action-button" type="button" onClick={() => onNavigate(buildProjectPath(project.id, "plan"))}>Open Plan</button>
            <button className="secondary-button" type="button" onClick={() => onNavigate(buildProjectVersionHistoryPath(project.id))}>Version History</button>
          </div>
        </section>
      ) : null}

      {queuedJob ? (
        <section className="panel">
          <div className="panel-header"><div><h2>Update Queued</h2><p>Durable job {queuedJob.id} is ready for the lifecycle worker.</p></div><CheckCircle2 size={24} aria-hidden="true" /></div>
          <p>{queuedJob.progress.total} lifecycle transitions planned. The project revision advances once every batch passes the final integrity check.</p>
        </section>
      ) : null}
    </div>
  );
}
