# AccelProjects Prototype

AccelProjects is currently a local, high-fidelity project-management platform prototype with the existing Billing module preserved from the original Mini Billing Messenger learning app.

## What Is Still Mocked

- Authentication and authorization are simulated with a role selector.
- Project, client, task, phase, milestone, risk, document, metric, and message data are stored in frontend mock data.
- Project-management edits persist to `localStorage`, not a database.
- Client-safe preview is a UI demonstration, not a security boundary.
- Gantt/timeline dependency rendering is visual only and does not use a scheduling engine.

## What Is Interactive Now

- Switch active projects from the project context header.
- Search tasks, files, and people.
- Filter tasks by status, owner, and phase.
- Create tasks with a simple form.
- Open task details in a side panel.
- Edit task status, owner, due date, and priority.
- Add task activity notes.
- Add and update risks.
- Toggle between internal and client-safe preview modes.
- Billing, Admin, Integration Test Center, Microsoft email, Twilio SMS, Stripe Checkout/webhook routes, and logs remain available.

## Backend/API Work Needed Next

- Add real authentication and enforce role permissions server-side.
- Replace project-management `localStorage` persistence with API-backed storage.
- Add backend models/routes for projects, clients, phases, tasks, risks, documents, messages, and activity.
- Connect project messages to the existing Microsoft Graph email log foundation.
- Connect project billing records to the existing order/payment module.
- Replace the visual Gantt with dependency-aware scheduling logic.

## Recommended Next Phase

Build the project-management backend API and JSON/file-backed storage first, mirroring the existing order/log API pattern before introducing a database or authentication provider.
