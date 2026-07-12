import { Archive, MoreHorizontal, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { applyRecordLifecycle, previewRecordLifecycle } from "../../data/api";
import { normalizeLifecycle } from "../../lifecycle/policy";
import type { LifecycleAction, LifecycleEntityType, LifecycleImpact, RecordLifecycleMetadata } from "../../lifecycle/types";
import type { UserRole } from "../../types";

export function LifecycleStatusBadge({ lifecycle }: { lifecycle?: RecordLifecycleMetadata }) {
  const state = normalizeLifecycle(lifecycle).state;
  return <span className={`lifecycle-badge lifecycle-${state}`}>{state}</span>;
}

export function LifecycleReasonField({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="lifecycle-field"><span>Reason <strong aria-hidden="true">*</strong></span><textarea disabled={disabled} required value={value} onChange={(event) => onChange(event.target.value)} placeholder="Explain why this lifecycle change is needed." /></label>;
}

export function TypedConfirmationField({ expected, value, onChange, disabled = false }: { expected: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="lifecycle-field"><span>Type <strong>{expected}</strong> to confirm</span><input autoComplete="off" disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function PurgeEligibilityNotice({ lifecycle }: { lifecycle?: RecordLifecycleMetadata }) {
  if (lifecycle?.legalHold) return <p className="lifecycle-notice danger">This record is under legal hold and cannot be purged.</p>;
  if (!lifecycle?.purgeEligibleAt) return <p className="lifecycle-notice">This record is not purge eligible.</p>;
  return <p className="lifecycle-notice">Purge eligible {new Date(lifecycle.purgeEligibleAt).toLocaleString()}.</p>;
}

export function ReassignmentPlanner({ strategy, onChange, children }: { strategy: string; onChange: (value: string) => void; children?: ReactNode }) {
  return <fieldset className="lifecycle-strategy"><legend>Relationship handling</legend><label><input checked={strategy === "retain_related"} name="strategy" onChange={() => onChange("retain_related")} type="radio" /> Retain related history</label><label><input checked={strategy === "cascade_trash"} name="strategy" onChange={() => onChange("cascade_trash")} type="radio" /> Trash contained active records</label><label><input checked={strategy === "reassign"} name="strategy" onChange={() => onChange("reassign")} type="radio" /> Reassign active records</label>{children}</fieldset>;
}

function ImpactGroup({ title, items }: { title: string; items: LifecycleImpact[keyof Pick<LifecycleImpact, "transition" | "reassign" | "removeRelationships" | "retainImmutable">] }) {
  if (!items.length) return null;
  return <section><h3>{title}</h3><ul>{items.map((item) => <li key={`${title}-${item.entityType}`}>{item.count} {item.entityType}{item.count === 1 ? "" : " records"}</li>)}</ul></section>;
}

export function LifecycleOperationResult({ message, error }: { message?: string; error?: string }) {
  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (message) return <p className="form-success" role="status">{message}</p>;
  return null;
}

type ActionRequest = {
  projectId: string;
  entityType: LifecycleEntityType;
  entityId: string;
  label: string;
  lifecycle?: RecordLifecycleMetadata;
  projectRevision: number;
  role: UserRole;
  action: LifecycleAction;
  onApplied: () => Promise<void> | void;
};

export function LifecycleImpactDialog({ request, onClose }: { request: ActionRequest; onClose: () => void }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [strategy, setStrategy] = useState("retain_related");
  const [resolutionId, setResolutionId] = useState("");
  const [impact, setImpact] = useState<LifecycleImpact | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const requiresTyped = request.action === "purge" || request.entityType === "project" || (request.entityType === "risk" && request.action === "trash");

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    const cancel = (event: Event) => { event.preventDefault(); onClose(); };
    dialog?.addEventListener("cancel", cancel);
    return () => dialog?.removeEventListener("cancel", cancel);
  }, [onClose]);

  async function loadImpact() {
    setWorking(true); setError("");
    try {
      const result = await previewRecordLifecycle(request.projectId, request.entityType, request.entityId, { action: request.action, expectedProjectRevision: request.projectRevision, idempotencyKey: crypto.randomUUID(), reason: { code: "user_requested", note: reason || undefined }, strategy, ...(request.entityType === "phase" ? { destinationPhaseId: resolutionId } : {}), ...(request.entityType === "projectMember" ? { replacementUserId: resolutionId } : {}) });
      setImpact(result.impact); setToken(result.previewToken);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impact preview failed."); }
    finally { setWorking(false); }
  }

  async function apply() {
    if (!impact || !token || !reason.trim() || (requiresTyped && typed !== request.label)) return;
    setWorking(true); setError("");
    try {
      await applyRecordLifecycle(request.projectId, request.entityType, request.entityId, { action: request.action, expectedProjectRevision: request.projectRevision, idempotencyKey: crypto.randomUUID(), reason: { code: "user_requested", note: reason.trim() }, previewToken: token, strategy, confirmed: true, ...(request.entityType === "phase" ? { destinationPhaseId: resolutionId } : {}), ...(request.entityType === "projectMember" ? { replacementUserId: resolutionId } : {}) });
      await request.onApplied(); onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Lifecycle action failed.";
      setError(message.includes("stale_preview") || message.includes("revision_conflict") ? "The project changed after preview. Refresh impact analysis before trying again." : message);
      if (message.includes("stale") || message.includes("revision")) { setImpact(null); setToken(""); }
    } finally { setWorking(false); }
  }

  return <dialog aria-labelledby={titleId} className="lifecycle-dialog" ref={dialogRef}>
    <div className="lifecycle-dialog-header"><div><p className="eyebrow">Lifecycle impact</p><h2 id={titleId}>{request.action} {request.label}</h2></div><button aria-label="Close lifecycle dialog" className="icon-button" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></div>
    <LifecycleReasonField disabled={working || Boolean(impact)} onChange={setReason} value={reason} />
    {(["phase", "projectMember", "task"] as LifecycleEntityType[]).includes(request.entityType) ? <ReassignmentPlanner onChange={setStrategy} strategy={strategy}>{strategy === "reassign" ? <label className="lifecycle-field"><span>{request.entityType === "phase" ? "Destination phase ID" : "Replacement user ID"}</span><input value={resolutionId} onChange={(event) => setResolutionId(event.target.value)} /></label> : null}</ReassignmentPlanner> : null}
    {!impact ? <button className="secondary-button" disabled={working || !reason.trim()} onClick={() => void loadImpact()} type="button">{working ? "Analyzing…" : "Preview impact"}</button> : <div className="lifecycle-impact"><ImpactGroup items={impact.transition} title="Records transitioned" /><ImpactGroup items={impact.reassign} title="Records reassigned" /><ImpactGroup items={impact.removeRelationships} title="Relationships removed" /><ImpactGroup items={impact.retainImmutable} title="Immutable history retained" />{impact.blockers.map((blocker) => <p className="lifecycle-notice danger" key={blocker}>{blocker.replaceAll("_", " ")}</p>)}{impact.warnings.map((warning) => <p className="lifecycle-notice" key={warning}>{warning.replaceAll("_", " ")}</p>)}</div>}
    {impact && requiresTyped ? <TypedConfirmationField disabled={working} expected={request.label} onChange={setTyped} value={typed} /> : null}
    {request.action === "purge" ? <PurgeEligibilityNotice lifecycle={request.lifecycle} /> : null}
    <LifecycleOperationResult error={error} />
    <div className="button-row lifecycle-dialog-actions"><button className="secondary-button" disabled={working} onClick={onClose} type="button">Cancel</button>{impact ? <button className={request.action === "restore" ? "action-button" : "danger-button"} disabled={working || !reason.trim() || (requiresTyped && typed !== request.label) || impact.blockers.length > 0} onClick={() => void apply()} type="button">{working ? "Applying…" : `Confirm ${request.action}`}</button> : null}</div>
  </dialog>;
}

export function RecordActionsMenu(props: Omit<ActionRequest, "action"> & { actions: LifecycleAction[] }) {
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const close = () => { setAction(null); queueMicrotask(() => triggerRef.current?.focus()); };
  return <><details className="record-actions-menu"><summary aria-label={`Lifecycle actions for ${props.label}`} ref={triggerRef}><MoreHorizontal aria-hidden="true" size={18} /></summary><div role="menu">{props.actions.map((candidate) => <button key={candidate} onClick={(event) => { (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); setAction(candidate); }} role="menuitem" type="button">{candidate === "restore" ? <RotateCcw aria-hidden="true" size={15} /> : candidate === "archive" ? <Archive aria-hidden="true" size={15} /> : <Trash2 aria-hidden="true" size={15} />}{candidate}</button>)}</div></details>{action ? <LifecycleImpactDialog onClose={close} request={{ ...props, action }} /> : null}</>;
}

export function RestoreAction(props: Omit<ActionRequest, "action">) { return <RecordActionsMenu {...props} actions={["restore"]} />; }
