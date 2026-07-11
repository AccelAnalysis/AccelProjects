import type { Organization, ProjectState, UserRole } from "../types";

export const mockOrganization: Organization = {
  id: "org_accel_projects",
  name: "AccelProjects",
  slug: "accel-projects",
  createdAt: "2026-07-01T12:00:00.000Z"
};

export const demoRoles: Array<{ role: UserRole; label: string }> = [
  { role: "admin", label: "Admin" },
  { role: "project_manager", label: "Project Manager" },
  { role: "contributor", label: "Contributor" },
  { role: "client", label: "Client" },
  { role: "viewer", label: "Viewer" }
];

export const initialProjectState: ProjectState = {
  users: [
    {
      id: "user_sarah",
      organizationId: mockOrganization.id,
      name: "Sarah Jenkins",
      email: "sarah@example.com",
      role: "project_manager",
      avatarInitials: "SJ"
    },
    {
      id: "user_marcus",
      organizationId: mockOrganization.id,
      name: "Marcus Turner",
      email: "marcus@example.com",
      role: "contributor",
      avatarInitials: "MT"
    },
    {
      id: "user_elena",
      organizationId: mockOrganization.id,
      name: "Elena Rivera",
      email: "elena@example.com",
      role: "admin",
      avatarInitials: "ER"
    },
    {
      id: "user_dana",
      organizationId: mockOrganization.id,
      name: "Dana Whitfield",
      email: "dana@hampton.example",
      role: "client",
      avatarInitials: "DW"
    },
    {
      id: "user_viewer",
      organizationId: mockOrganization.id,
      name: "Victor Lee",
      email: "victor@example.com",
      role: "viewer",
      avatarInitials: "VL"
    }
  ],
  clients: [
    {
      id: "client_hampton",
      organizationId: mockOrganization.id,
      name: "Hampton Economic Development",
      contactName: "Dana Whitfield",
      email: "dana@hampton.example",
      phone: "+15555550101",
      status: "active"
    },
    {
      id: "client_northstar",
      organizationId: mockOrganization.id,
      name: "Northstar Manufacturing",
      contactName: "Priya Shah",
      email: "priya@northstar.example",
      phone: "+15555550102",
      status: "active"
    },
    {
      id: "client_harbor",
      organizationId: mockOrganization.id,
      name: "Harbor Field Services",
      contactName: "Marcus Lane",
      email: "marcus@harbor.example",
      phone: "+15555550103",
      status: "lead"
    }
  ],
  projects: [
    {
      id: "project_hampton_workforce",
      organizationId: mockOrganization.id,
      clientId: "client_hampton",
      name: "City of Hampton - Demographic & Workforce Analysis",
      summary: "A ProjectOS delivery workspace for demographic research, workforce analysis, stakeholder review, and final reporting.",
      status: "active",
      health: "at_risk",
      priority: "high",
      startDate: "2026-06-15",
      targetDate: "2026-08-30",
      budget: 64000,
      currency: "usd",
      ownerId: "user_sarah",
      createdAt: "2026-06-10T12:00:00.000Z",
      updatedAt: "2026-07-09T14:00:00.000Z",
      revision: 1,
      lastStructuralChangeAt: "2026-07-09T14:00:00.000Z"
    },
    {
      id: "project_northstar_portal",
      organizationId: mockOrganization.id,
      clientId: "client_northstar",
      name: "Operations Reporting Portal",
      summary: "A reporting portal for production leaders to review weekly metrics, documents, and action items.",
      status: "planning",
      health: "on_track",
      priority: "medium",
      startDate: "2026-07-20",
      targetDate: "2026-10-02",
      budget: 42000,
      currency: "usd",
      ownerId: "user_elena",
      createdAt: "2026-07-03T12:00:00.000Z",
      updatedAt: "2026-07-08T16:30:00.000Z",
      revision: 1,
      lastStructuralChangeAt: "2026-07-08T16:30:00.000Z"
    }
  ],
  projectMembers: [
    { id: "member_sarah_hampton", projectId: "project_hampton_workforce", userId: "user_sarah", role: "lead" },
    { id: "member_marcus_hampton", projectId: "project_hampton_workforce", userId: "user_marcus", role: "contributor" },
    { id: "member_elena_hampton", projectId: "project_hampton_workforce", userId: "user_elena", role: "contributor" },
    { id: "member_dana_hampton", projectId: "project_hampton_workforce", userId: "user_dana", role: "observer" },
    { id: "member_elena_northstar", projectId: "project_northstar_portal", userId: "user_elena", role: "lead" }
  ],
  phases: [
    {
      id: "phase_data_collection",
      projectId: "project_hampton_workforce",
      name: "Data Collection",
      status: "complete",
      startDate: "2026-06-15",
      endDate: "2026-07-05",
      sortOrder: 1
    },
    {
      id: "phase_draft_development",
      projectId: "project_hampton_workforce",
      name: "Draft Development",
      status: "active",
      startDate: "2026-07-06",
      endDate: "2026-07-31",
      sortOrder: 2
    },
    {
      id: "phase_review",
      projectId: "project_hampton_workforce",
      name: "Review",
      status: "planned",
      startDate: "2026-08-01",
      endDate: "2026-08-16",
      sortOrder: 3
    },
    {
      id: "phase_final_delivery",
      projectId: "project_hampton_workforce",
      name: "Final Delivery",
      status: "planned",
      startDate: "2026-08-17",
      endDate: "2026-08-30",
      sortOrder: 4
    },
    {
      id: "phase_northstar_discovery",
      projectId: "project_northstar_portal",
      name: "Discovery",
      status: "active",
      startDate: "2026-07-20",
      endDate: "2026-08-07",
      sortOrder: 1
    }
  ],
  milestones: [
    { id: "milestone_data_locked", projectId: "project_hampton_workforce", name: "Source data locked", date: "2026-07-05", status: "complete" },
    { id: "milestone_draft_review", projectId: "project_hampton_workforce", name: "Draft review packet", date: "2026-08-02", status: "at_risk" },
    { id: "milestone_final_delivery", projectId: "project_hampton_workforce", name: "Final delivery", date: "2026-08-30", status: "planned" },
    { id: "milestone_northstar_scope", projectId: "project_northstar_portal", name: "Scope signoff", date: "2026-08-07", status: "planned" }
  ],
  tasks: [
    {
      id: "task_clean_workforce_data",
      projectId: "project_hampton_workforce",
      phaseId: "phase_draft_development",
      title: "Clean workforce participation dataset",
      description: "Normalize source fields and flag missing census tract rows before analysis.",
      status: "done",
      priority: "high",
      assigneeId: "user_elena",
      startDate: "2026-07-06",
      dueDate: "2026-07-08",
      estimateHours: 8,
      completedAt: "2026-07-08T16:30:00.000Z"
    },
    {
      id: "task_draft_demographic_findings",
      projectId: "project_hampton_workforce",
      phaseId: "phase_draft_development",
      title: "Draft demographic findings narrative",
      description: "Summarize population, income, commute, and workforce shifts for the executive report.",
      status: "in_progress",
      priority: "high",
      assigneeId: "user_sarah",
      startDate: "2026-07-09",
      dueDate: "2026-07-15",
      estimateHours: 14,
      completedAt: null
    },
    {
      id: "task_client_data_approval",
      projectId: "project_hampton_workforce",
      phaseId: "phase_draft_development",
      title: "Confirm employer survey assumptions",
      description: "Client needs to approve weighting assumptions before final charts are generated.",
      status: "waiting_on_client",
      priority: "medium",
      assigneeId: "user_marcus",
      startDate: "2026-07-10",
      dueDate: "2026-07-16",
      estimateHours: 4,
      completedAt: null
    },
    {
      id: "task_map_priority_zones",
      projectId: "project_hampton_workforce",
      phaseId: "phase_draft_development",
      title: "Map priority investment zones",
      description: "Create map-ready zone groupings for report visuals and stakeholder discussion.",
      status: "blocked",
      priority: "urgent",
      assigneeId: "user_marcus",
      startDate: "2026-07-11",
      dueDate: "2026-07-18",
      estimateHours: 10,
      completedAt: null
    },
    {
      id: "task_prepare_review_packet",
      projectId: "project_hampton_workforce",
      phaseId: "phase_review",
      title: "Prepare client review packet",
      description: "Assemble draft PDF, assumptions memo, chart appendix, and approval checklist.",
      status: "not_started",
      priority: "medium",
      assigneeId: "user_elena",
      startDate: "2026-07-28",
      dueDate: "2026-08-02",
      estimateHours: 6,
      completedAt: null
    },
    {
      id: "task_northstar_stakeholder_map",
      projectId: "project_northstar_portal",
      phaseId: "phase_northstar_discovery",
      title: "Map Northstar stakeholder workflow",
      description: "Document weekly report owners and approval sequence.",
      status: "in_progress",
      priority: "medium",
      assigneeId: "user_elena",
      startDate: "2026-07-22",
      dueDate: "2026-07-29",
      estimateHours: 5,
      completedAt: null
    }
  ],
  taskDependencies: [
    {
      id: "dependency_assumptions_before_maps",
      taskId: "task_map_priority_zones",
      dependsOnTaskId: "task_client_data_approval",
      type: "finish_to_start"
    },
    {
      id: "dependency_review_after_draft",
      taskId: "task_prepare_review_packet",
      dependsOnTaskId: "task_draft_demographic_findings",
      type: "finish_to_start"
    }
  ],
  taskComments: [
    {
      id: "comment_initial_review",
      taskId: "task_draft_demographic_findings",
      authorId: "user_sarah",
      body: "Draft outline is ready. Need the latest commute trend notes before finalizing.",
      visibility: "internal",
      createdAt: "2026-07-09T15:40:00.000Z"
    }
  ],
  risks: [
    {
      id: "risk_survey_assumptions",
      projectId: "project_hampton_workforce",
      title: "Employer survey assumptions are not yet approved",
      severity: "high",
      probability: "medium",
      status: "mitigating",
      mitigationPlan: "Send decision memo and request approval before map generation begins."
    },
    {
      id: "risk_marcus_capacity",
      projectId: "project_hampton_workforce",
      title: "Marcus is over capacity this week",
      severity: "medium",
      probability: "high",
      status: "monitoring",
      mitigationPlan: "Move non-critical analysis support to Elena if client approval slips."
    }
  ],
  documents: [
    {
      id: "doc_project_brief",
      projectId: "project_hampton_workforce",
      title: "Project Brief",
      type: "brief",
      url: "#",
      ownerId: "user_sarah",
      createdAt: "2026-06-15T13:00:00.000Z"
    },
    {
      id: "doc_source_data_inventory",
      projectId: "project_hampton_workforce",
      title: "Source Data Inventory",
      type: "technical_note",
      url: "#",
      ownerId: "user_elena",
      createdAt: "2026-07-02T15:00:00.000Z"
    },
    {
      id: "doc_billing_statement",
      projectId: "project_hampton_workforce",
      title: "Billing Statement",
      type: "contract",
      url: "#",
      ownerId: "user_marcus",
      createdAt: "2026-07-08T15:00:00.000Z"
    }
  ],
  metrics: [
    { id: "metric_project_completion", projectId: "project_hampton_workforce", label: "Project completion", value: 68, suffix: "%", tone: "info" },
    { id: "metric_overdue_work", projectId: "project_hampton_workforce", label: "Overdue work", value: 18, suffix: "%", tone: "danger" },
    { id: "metric_budget_hours", projectId: "project_hampton_workforce", label: "Budget hours", value: 75, suffix: "%", tone: "warning" },
    { id: "metric_response_delay", projectId: "project_hampton_workforce", label: "Client response delays", value: 42, suffix: "%", tone: "warning" },
    { id: "metric_team_workload", projectId: "project_hampton_workforce", label: "Team workload", value: 86, suffix: "%", tone: "info" }
  ],
  activityEvents: [
    {
      id: "event_update_sent",
      projectId: "project_hampton_workforce",
      actorId: "user_sarah",
      type: "client_update_sent",
      message: "Client update sent with draft progress and open assumptions.",
      metadata: { channel: "email" },
      createdAt: "2026-07-09T14:00:00.000Z"
    },
    {
      id: "event_approval_pending",
      projectId: "project_hampton_workforce",
      actorId: "user_marcus",
      type: "approval_request_pending",
      message: "Approval request pending for employer survey assumptions.",
      metadata: { taskId: "task_client_data_approval" },
      createdAt: "2026-07-09T15:30:00.000Z"
    },
    {
      id: "event_email_logged",
      projectId: "project_hampton_workforce",
      actorId: "user_elena",
      type: "email_logged",
      message: "Email logged to project activity history.",
      metadata: { provider: "microsoft_graph" },
      createdAt: "2026-07-09T16:10:00.000Z"
    }
  ],
  projectCommunications: [],
  projectCalendarEvents: [],
  clientProgressReports: [],
  clientReportSnapshots: [],
  clientReportArtifacts: [],
  projectVersions: [
    {
      id: "version_hampton_initial",
      projectId: "project_hampton_workforce",
      revision: 1,
      previousRevision: 0,
      changeType: "project_imported",
      summary: "Initial project workspace seeded.",
      actorId: "user_sarah",
      metadata: { source: "demo_seed" },
      createdAt: "2026-07-09T14:00:00.000Z"
    },
    {
      id: "version_northstar_initial",
      projectId: "project_northstar_portal",
      revision: 1,
      previousRevision: 0,
      changeType: "project_imported",
      summary: "Initial project workspace seeded.",
      actorId: "user_elena",
      metadata: { source: "demo_seed" },
      createdAt: "2026-07-08T16:30:00.000Z"
    }
  ]
};

export const mockTeamCapacity = [
  { userId: "user_sarah", name: "Sarah J.", role: "Project Lead", capacity: 72, status: "steady" },
  { userId: "user_marcus", name: "Marcus T.", role: "Analysis Support", capacity: 112, status: "overloaded" },
  { userId: "user_elena", name: "Elena R.", role: "Data Analyst", capacity: 64, status: "available" }
];

export const mockClients = initialProjectState.clients;
export const mockProjects = initialProjectState.projects;
export const mockUsers = initialProjectState.users;
export const mockPhases = initialProjectState.phases;
export const mockTasks = initialProjectState.tasks;
export const mockTaskDependencies = initialProjectState.taskDependencies;
export const mockProjectRisks = initialProjectState.risks;
export const mockProjectDocuments = initialProjectState.documents;
export const mockProjectActivityEvents = initialProjectState.activityEvents;
