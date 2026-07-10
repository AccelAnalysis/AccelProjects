import { CheckCircle2, FileJson, RotateCcw, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProjectPageProps } from "../App";
import { checkProjectImportDuplicate, importProjectPackageToFirestore } from "../data/firestoreProjectImportStore";
import { createProjectImportPlan, createProjectImportSourceHash } from "../imports/projectImportPlanner";
import { parseAndValidateProjectImportText, splitImportIssues } from "../imports/projectImportValidator";
import sampleProjectImport from "../imports/fixtures/sampleProjectImport.json";
import type {
  ImportValidationIssue,
  ProjectImportDuplicateCheck,
  ProjectImportOverrides,
  ProjectImportPackage,
  ProjectImportResult
} from "../imports/projectImportTypes";
import { buildProjectPath } from "../routing/projectRoutes";

const maxImportFileBytes = 2 * 1024 * 1024;

type ValidationState = {
  rawText: string;
  projectPackage: ProjectImportPackage | null;
  issues: ImportValidationIssue[];
  sourceHash: string;
  duplicateCheck: ProjectImportDuplicateCheck | null;
};

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

function IssueList({ issues, emptyLabel }: { issues: ImportValidationIssue[]; emptyLabel: string }) {
  if (issues.length === 0) {
    return <p>{emptyLabel}</p>;
  }

  return (
    <div className="issue-list">
      {issues.map((issue, index) => (
        <article className={`issue-card ${issue.severity}`} key={`${issue.code}-${issue.path}-${index}`}>
          <strong>{issue.code}</strong>
          <span>{issue.path}</span>
          <p>{issue.message}</p>
        </article>
      ))}
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function ProjectImportPage({ projectState, role, onProjectImported }: ProjectPageProps) {
  const [inputText, setInputText] = useState("");
  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [createClient, setCreateClient] = useState(false);
  const [personUserIds, setPersonUserIds] = useState<Record<string, string | null>>({});
  const [projectOwnerUserId, setProjectOwnerUserId] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [result, setResult] = useState<ProjectImportResult | null>(null);
  const packageIssues = validation ? splitImportIssues(validation.issues) : { errors: [], warnings: [] };

  const overrides: ProjectImportOverrides = useMemo(() => ({
    clientId,
    createClient,
    personUserIds,
    projectOwnerUserId
  }), [clientId, createClient, personUserIds, projectOwnerUserId]);

  const plan = useMemo(() => {
    if (!validation?.projectPackage) {
      return null;
    }

    return createProjectImportPlan(validation.projectPackage, projectState, overrides);
  }, [overrides, projectState, validation?.projectPackage]);

  const planIssues = plan ? splitImportIssues(plan.issues) : { errors: [], warnings: [] };
  const fatalErrors = packageIssues.errors.length + planIssues.errors.length;
  const duplicateBlocked = Boolean(validation?.duplicateCheck?.duplicate);
  const authorized = role === "admin" || role === "project_manager";
  const canImport = Boolean(validation?.projectPackage && plan && fatalErrors === 0 && !duplicateBlocked && approved && authorized && !importing);

  async function validateInput(text = inputText) {
    setImportError("");
    setResult(null);
    setApproved(false);
    const validationResult = parseAndValidateProjectImportText(text);
    const sourceHash = validationResult.package ? await createProjectImportSourceHash(validationResult.package) : "";
    let duplicateCheck: ProjectImportDuplicateCheck | null = null;

    if (validationResult.package && authorized) {
      try {
        duplicateCheck = await checkProjectImportDuplicate(validationResult.package, sourceHash, projectState);
      } catch (error) {
        validationResult.issues.push({
          severity: "warning",
          code: "duplicate_check_unavailable",
          path: "$.packageId",
          message: error instanceof Error ? error.message : "Could not check existing import manifests during preview."
        });
      }
    }

    setValidation({
      rawText: text,
      projectPackage: validationResult.package,
      issues: validationResult.issues,
      sourceHash,
      duplicateCheck
    });

    if (validationResult.package) {
      const proposedPlan = createProjectImportPlan(validationResult.package, projectState);
      setClientId(proposedPlan.clientResolution.selectedClientId);
      setCreateClient(proposedPlan.clientResolution.action === "create");
      setPersonUserIds(Object.fromEntries(proposedPlan.personResolutions.map((person) => [person.alias, person.selectedUserId])));
      setProjectOwnerUserId(proposedPlan.projectOwnerUserId);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!file.name.endsWith(".json") && !file.name.endsWith(".accelproject.json")) {
      setValidation({
        rawText: inputText,
        projectPackage: null,
        issues: [{
          severity: "error",
          code: "unsupported_file_extension",
          path: "$",
          message: "Choose a .json or .accelproject.json file."
        }],
        sourceHash: "",
        duplicateCheck: null
      });
      return;
    }

    if (file.size > maxImportFileBytes) {
      setValidation({
        rawText: inputText,
        projectPackage: null,
        issues: [{
          severity: "error",
          code: "file_too_large",
          path: "$",
          message: "Import files must be 2 MB or smaller."
        }],
        sourceHash: "",
        duplicateCheck: null
      });
      return;
    }

    const text = await file.text();
    setInputText(text);
    await validateInput(text);
  }

  function resetImport() {
    setInputText("");
    setValidation(null);
    setClientId(null);
    setCreateClient(false);
    setPersonUserIds({});
    setProjectOwnerUserId(null);
    setApproved(false);
    setImporting(false);
    setImportError("");
    setResult(null);
  }

  async function runImport() {
    if (!validation?.projectPackage || !plan || !canImport) {
      return;
    }

    setImporting(true);
    setImportError("");

    try {
      const importResult = await importProjectPackageToFirestore({
        projectPackage: validation.projectPackage,
        projectState,
        overrides
      });
      setResult(importResult);
      await onProjectImported(importResult.projectId);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Project import failed.");
    } finally {
      setImporting(false);
    }
  }

  if (!authorized) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Import Project</h1>
            <p>Your current role cannot manage project imports.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="page-stack import-page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Preview first import</p>
            <h1>Import Project</h1>
            <p>Paste or select an AccelProjects Project Package. Nothing writes to Firestore until validation passes and you approve the import.</p>
          </div>
          <button className="secondary-button" type="button" onClick={resetImport}>
            <RotateCcw size={18} aria-hidden="true" />
            Reset
          </button>
        </div>
        <div className="form-grid">
          <label className="full-width">
            Package JSON
            <textarea
              className="json-input"
              placeholder="Paste AccelProjects Project Package JSON here..."
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
            />
          </label>
          <label>
            Upload package file
            <input type="file" accept=".json,.accelproject.json,application/json" onChange={(event) => void handleFile(event.target.files?.[0])} />
          </label>
          <div className="button-row import-actions">
            <button className="action-button" type="button" onClick={() => void validateInput()} disabled={!inputText.trim()}>
              <FileJson size={18} aria-hidden="true" />
              Validate Package
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                const sampleText = JSON.stringify(sampleProjectImport, null, 2);
                setInputText(sampleText);
                void validateInput(sampleText);
              }}
            >
              <Upload size={18} aria-hidden="true" />
              Load Sample Fixture
            </button>
          </div>
        </div>
        <p className="panel-note">Supported schema: accelprojects.project version 1.0. Accepted files: .json and .accelproject.json up to 2 MB.</p>
      </section>

      {validation ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Validation Results</h2>
              <p>{validation.projectPackage ? validation.projectPackage.source.name : "Package could not be validated."}</p>
            </div>
            {validation.sourceHash ? <span className="status-badge info">hash ready</span> : null}
          </div>
          {validation.projectPackage ? (
            <div className="page-grid four">
              <SummaryMetric label="Schema" value={validation.projectPackage.schemaVersion} />
              <SummaryMetric label="Client" value={validation.projectPackage.client.name} />
              <SummaryMetric label="Project" value={validation.projectPackage.project.name} />
              <SummaryMetric label="Package ID" value={validation.projectPackage.packageId} />
            </div>
          ) : null}
          {validation.duplicateCheck?.duplicate ? (
            <div className="error-message form-status">
              Duplicate package blocked. Existing import: {validation.duplicateCheck.existingManifest?.projectName} ({validation.duplicateCheck.existingManifest?.status}).
            </div>
          ) : null}
          <div className="page-grid two form-status">
            <div>
              <h3>Errors</h3>
              <IssueList issues={packageIssues.errors} emptyLabel="No fatal package errors." />
            </div>
            <div>
              <h3>Warnings</h3>
              <IssueList issues={packageIssues.warnings} emptyLabel="No package warnings." />
            </div>
          </div>
        </section>
      ) : null}

      {validation?.projectPackage && plan ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Client and People Matching</h2>
                <p>Match imported people to existing AccelProjects users. Unresolved contributors can import as unassigned tasks.</p>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Client resolution
                <select
                  value={createClient ? "__create" : clientId ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCreateClient(value === "__create");
                    setClientId(value === "__create" ? null : value);
                  }}
                >
                  <option value="__create">Create new client: {validation.projectPackage.client.name}</option>
                  {projectState.clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name} ({client.email})</option>
                  ))}
                </select>
              </label>
              <label>
                Project owner
                <select value={projectOwnerUserId ?? ""} onChange={(event) => setProjectOwnerUserId(event.target.value || null)}>
                  <option value="">Select project owner</option>
                  {projectState.users.filter((user) => user.role !== "client" && user.role !== "viewer").map((user) => (
                    <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="table-wrap form-status">
              <table>
                <thead>
                  <tr>
                    <th>Alias</th>
                    <th>Package person</th>
                    <th>Email</th>
                    <th>Proposed user</th>
                    <th>Resolution</th>
                    <th>Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.personResolutions.map((person) => {
                    const proposedUser = projectState.users.find((user) => user.id === person.proposedUserId);

                    return (
                      <tr key={person.alias}>
                        <td><strong>{person.alias}</strong></td>
                        <td>{person.packageName}</td>
                        <td>{person.packageEmail || "No email"}</td>
                        <td>{proposedUser ? `${proposedUser.name} (${proposedUser.email})` : "No automatic match"}</td>
                        <td>
                          <select
                            value={personUserIds[person.alias] ?? ""}
                            onChange={(event) => setPersonUserIds((current) => ({
                              ...current,
                              [person.alias]: event.target.value || null
                            }))}
                          >
                            <option value="">Leave unresolved</option>
                            {projectState.users.map((user) => (
                              <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                            ))}
                          </select>
                        </td>
                        <td>{person.taskCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Import Preview</h2>
                <p>Review the records that will be created after approval.</p>
              </div>
            </div>
            <div className="page-grid four">
              {Object.entries(plan.proposedCounts).map(([label, value]) => (
                <SummaryMetric key={label} label={formatLabel(label)} value={value} />
              ))}
            </div>
            <div className="page-grid two form-status">
              <div>
                <h3>Plan Errors</h3>
                <IssueList issues={planIssues.errors} emptyLabel="No fatal plan errors." />
              </div>
              <div>
                <h3>Plan Warnings</h3>
                <IssueList issues={planIssues.warnings} emptyLabel="No plan warnings." />
              </div>
            </div>
            <div className="table-wrap form-status">
              <h3>Tasks</h3>
              <table>
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assignee</th>
                    <th>Start</th>
                    <th>Due</th>
                    <th>Hours</th>
                    <th>Dependencies</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.projectPackage.tasks.map((task) => {
                    const phase = validation.projectPackage?.phases.find((item) => item.key === task.phaseKey);
                    const assignee = task.assigneeAlias ? plan.personResolutions.find((person) => person.alias === task.assigneeAlias) : undefined;
                    const user = projectState.users.find((item) => item.id === assignee?.selectedUserId);

                    return (
                      <tr key={task.key}>
                        <td>{phase?.name ?? task.phaseKey}</td>
                        <td><strong>{task.title}</strong><span>{task.description}</span></td>
                        <td><span className={`status-badge status-${task.status}`}>{formatLabel(task.status)}</span></td>
                        <td>{formatLabel(task.priority)}</td>
                        <td>{user ? user.name : <span className="text-warning">Unassigned</span>}</td>
                        <td>{task.startDate}</td>
                        <td>{task.dueDate}</td>
                        <td>{task.estimateHours}</td>
                        <td>{task.dependencies.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="page-grid two form-status">
              <PreviewTable title="Phases" rows={validation.projectPackage.phases.map((phase) => [phase.name, formatLabel(phase.status), `${phase.startDate} to ${phase.endDate}`])} />
              <PreviewTable title="Milestones" rows={validation.projectPackage.milestones.map((milestone) => [milestone.name, formatLabel(milestone.status), milestone.date])} />
              <PreviewTable title="Risks" rows={validation.projectPackage.risks.map((risk) => [risk.title, formatLabel(risk.severity), formatLabel(risk.status)])} />
              <PreviewTable title="Metrics" rows={validation.projectPackage.metrics.map((metric) => [metric.label, `${metric.value}${metric.suffix}`, formatLabel(metric.tone)])} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Confirmation</h2>
                <p>Approval is required before any Firestore records are created.</p>
              </div>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
              I reviewed this import and approve creating these records.
            </label>
            {importError ? <div className="error-message form-status">{importError}</div> : null}
            <div className="button-row form-status">
              <button className="action-button" type="button" disabled={!canImport} onClick={() => void runImport()}>
                <CheckCircle2 size={18} aria-hidden="true" />
                {importing ? "Importing..." : "Import Approved Project"}
              </button>
            </div>
          </section>
        </>
      ) : null}

      {result ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Import Results</h2>
              <p>{result.projectName} was imported and the manifest is complete.</p>
            </div>
            <a className="action-button" href={buildProjectPath(result.projectId, "plan")}>Open Imported Project</a>
          </div>
          <div className="page-grid four">
            <SummaryMetric label="Project" value={result.projectName} />
            <SummaryMetric label="Client" value={result.clientName} />
            <SummaryMetric label="Unresolved people" value={result.unresolvedPeople.length} />
            <SummaryMetric label="Unassigned tasks" value={result.unassignedTaskCount} />
          </div>
          <div className="test-readout">
            <strong>Manifest</strong>
            <span>Status: {result.manifest.status}</span>
            <span>Package ID: {result.manifest.packageId}</span>
            <span>Source hash: {result.manifest.sourceHash}</span>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PreviewTable({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <h3>{title}</h3>
      <table className="compact-table">
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${title}-${index}`}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
