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

## Backend/API Work Needed Next

- Add Firestore role/user-profile records and enforce role permissions with stricter Firestore rules.
- Expand project API coverage for clients, phases, documents, metrics, messages, and dependencies.
- Connect project messages to the existing Microsoft Graph email log foundation.
- Connect project billing records to the existing order/payment module.
- Replace the visual Gantt with dependency-aware scheduling logic.

## Recommended Next Phase

Add Firestore user profile records and stricter role-based security rules, then migrate more project modules beyond tasks, comments, and risks.
