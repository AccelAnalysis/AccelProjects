import type {
  Client,
  Organization,
  Phase,
  Project,
  ProjectActivityEvent,
  ProjectDocument,
  ProjectMember,
  ProjectRisk,
  Task,
  TaskDependency,
  User
} from "../types";

export const mockOrganization: Organization = {
  id: "org_accel_projects",
  name: "AccelProjects",
  slug: "accel-projects",
  createdAt: "2026-07-01T12:00:00.000Z"
};

export const mockUsers: User[] = [
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
    role: "operations",
    avatarInitials: "MT"
  },
  {
    id: "user_elena",
    organizationId: mockOrganization.id,
    name: "Elena Rivera",
    email: "elena@example.com",
    role: "admin",
    avatarInitials: "ER"
  }
];

export const mockClients: Client[] = [
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
];

export const mockProjects: Project[] = [
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
    updatedAt: "2026-07-09T14:00:00.000Z"
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
    updatedAt: "2026-07-08T16:30:00.000Z"
  }
];

export const mockProjectMembers: ProjectMember[] = [
  { id: "member_sarah_hampton", projectId: "project_hampton_workforce", userId: "user_sarah", role: "lead" },
  { id: "member_marcus_hampton", projectId: "project_hampton_workforce", userId: "user_marcus", role: "contributor" },
  { id: "member_elena_hampton", projectId: "project_hampton_workforce", userId: "user_elena", role: "contributor" }
];

export const mockPhases: Phase[] = [
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
  }
];

export const mockTasks: Task[] = [
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
  }
];

export const mockTaskDependencies: TaskDependency[] = [
  {
    id: "dependency_assumptions_before_maps",
    taskId: "task_map_priority_zones",
    dependsOnTaskId: "task_client_data_approval",
    type: "finish_to_start"
  }
];

export const mockProjectRisks: ProjectRisk[] = [
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
];

export const mockProjectDocuments: ProjectDocument[] = [
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
];

export const mockProjectActivityEvents: ProjectActivityEvent[] = [
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
];

export const mockTeamCapacity = [
  { name: "Sarah J.", role: "Project Lead", capacity: 72, status: "steady" },
  { name: "Marcus T.", role: "Analysis Support", capacity: 112, status: "overloaded" },
  { name: "Elena R.", role: "Data Analyst", capacity: 64, status: "available" }
];
