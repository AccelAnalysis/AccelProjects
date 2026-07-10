# AccelProjects Prototype

AccelProjects is a high-fidelity project-management platform prototype with Firebase Authentication and Firestore-backed project data. The existing Billing module is preserved from the original Mini Billing Messenger learning app.

## What Is Still Mocked

- Authorization is still simulated with a Preview Role selector. Firebase Authentication identifies the signed-in user, but the preview role is not a security boundary.
- Project, client, task, phase, milestone, risk, document, metric, and message data can be seeded from mock data into Firestore.
- Project-management task, comment, and risk edits persist to Firestore.
- Browser `localStorage` is only used for UI preferences such as selected project, preview role, and client-safe preview.
- Client-safe preview is a UI demonstration, not a security boundary.
- Gantt/timeline dependency rendering is visual only and does not use a scheduling engine.

## What Is Interactive Now

- Switch active projects from the project context header.
- Import validated AccelProjects Project Package JSON through `/projects/import`.
- Export an existing project and safely update that same project from a verified exported file.
- Search tasks, files, and people.
- Filter tasks by status, owner, and phase.
- Create tasks with a simple form.
- Open task details in a side panel.
- Edit task status, owner, due date, and priority.
- Add task activity notes.
- Add and update risks.
- Sign in and sign out with Firebase email/password authentication.
- Load, seed, update, reset, and manually test project state through Firestore.
- The backend project API remains available in System Tests for compatibility checks.
- Toggle between internal and client-safe preview modes.
- Billing, Admin, Integration Test Center, Microsoft email, Twilio SMS, Stripe Checkout/webhook routes, and logs remain available.

## Firebase Setup

Copy `.env.example` to `.env`, fill in the `VITE_FIREBASE_*` values for the `accelprojects` Firebase project, and restart Vite. If these values are missing, the app shows a setup message instead of a blank screen.

## Project Imports And Updates

AccelProjects has two separate file workflows:

- **Import New Project** at `/projects/import` creates a new project from package type `accelprojects.project` schema `1.0`.
- **Update via File** at `/projects/{projectId}/update` updates only the selected existing project from package type `accelprojects.project.export`.

The selected-project update workflow never creates a second project or client. The portfolio import workflow remains create-only.

### Import New Project

AccelProjects supports a preview-first project import workflow for structured project packages from any source, including AI-generated project plans, manually prepared JSON packages, converted project documentation, planning conversations, requirements documents, repository analysis, and future supported conversion tools. Import files must be strict JSON using package type `accelprojects.project` and schema version `1.0`; accepted file extensions are `.json` and `.accelproject.json`.

Workflow:

1. Open `/projects/import`.
2. Paste package JSON or choose a package file up to 2 MB.
3. Validate the package schema and relationship rules.
4. Review client matching, people matching, proposed counts, warnings, and preview tables.
5. Resolve the project owner to an existing AccelProjects user.
6. Check the explicit approval box.
7. Import the package into Firestore.

Validation checks required fields, supported enum values, date formats, numeric values, unique keys and aliases, missing references, duplicate dependencies, circular dependencies, and date ordering. Fatal errors block import. Warnings remain visible in the preview and import manifest.

Client matching supports `match_or_create` only. Existing clients are matched by exact normalized email first, then exact normalized name. People are matched to existing AccelProjects users by exact normalized email or manual selection. Imports do not create Firebase Authentication users, fake users, update existing projects, merge data, replace data, or delete records.

Every import creates an audit manifest at `organizations/org_accel_projects/imports/{importId}`. The manifest records package ID, source hash, project/client IDs, generated entity mappings, counts, user, timestamps, status, warnings, and error details. Completed or processing manifests with the same package ID or source hash block duplicate imports by default.

The sample fixture is at `src/imports/fixtures/sampleProjectImport.json`. Use Import New Project or the Import Package Tests section on System Tests to load, validate, preview, optionally write, reload, and duplicate-check the sample project package. Before importing the first production project package, validate it through the preview workflow and confirm the target users and clients are correct.

### Update Via File

Update via File uses a canonical project export as the editable contract. New exports use schema `1.1` and include `exportSnapshotId` provenance metadata. Legacy schema `1.0` exports can be used only when exactly one matching immutable export snapshot exists for the selected project and its stored package hash verifies.

The update page verifies:

- The uploaded file is valid JSON, package type `accelprojects.project.export`, and schema `1.0` or `1.1`.
- The export snapshot exists, belongs to the selected project, and matches the stored source hash.
- The file targets the selected project and current base revision.
- Client identity, project owner, project membership, and immutable IDs are unchanged.
- Existing entity IDs remain stable.
- New records use temporary IDs beginning with `new_`, such as `new_task_client_review`.
- Temporary IDs are resolved to Firestore IDs before persistence; no `new_` IDs are stored.
- Assignees and document owners are existing project members.
- Dependencies remain valid after additions, edits, removals, and temporary-ID resolution.
- Tasks with comments are not deleted by file update.

Supported update scope:

- Project fields: name, summary, status, health, priority, start date, target date, budget, currency.
- Collections: phases, milestones, tasks, task dependencies, risks, documents, metrics.

Not supported through update files:

- Client record edits, project owner changes, project membership changes, organization users, Firebase Authentication users, task comments, activity history rewrites, prior versions, prior snapshots, import manifests, or arbitrary version restore.

Update apply is one Firestore transaction. A successful file update creates exactly one project revision, one `ProjectVersion` with change type `project_file_updated`, one activity event, one immutable update manifest keyed by the uploaded-file SHA-256 hash, and one canonical result snapshot. Duplicate files are blocked by the update manifest. No-op files do not create revisions.

Safety limits:

- Maximum planned writes: 450.
- Maximum canonical snapshot JSON size: 700,000 UTF-8 bytes.
- Larger updates are blocked instead of split into multiple non-atomic batches.

Stale protection:

- Preview requires the selected project revision to match the export base revision.
- Apply re-reads the project, source snapshot, and deterministic update manifest inside the transaction.
- If the project changed after preview, no changes are applied; export the current project again.

Version History shows file-update revisions with added, modified, removed counts, uploaded-file hash, result-state hash, and base revision. Rollback/restore from historical versions is not implemented yet.

A generic non-sensitive update fixture is available at `src/updates/fixtures/genericProjectUpdateExport.json`.

Run unit tests and build checks with:

```bash
npm test
npm run build
git diff --check
```

Run Firestore rules tests with:

```bash
npm run test:rules
```

The Firestore rules test command requires a local Java runtime because the Firebase Firestore emulator depends on Java.

## Backend/API Work Needed Next

- Expand project API coverage for clients, phases, documents, metrics, messages, and dependencies.
- Connect project messages to the existing Microsoft Graph email log foundation.
- Connect project billing records to the existing order/payment module.
- Replace the visual Gantt with dependency-aware scheduling logic.

## Recommended Next Phase

Add server-side large-project update processing or restore workflows once snapshot coverage is designed for all relevant revisions.
