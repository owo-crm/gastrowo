export type Role = "ADMIN" | "MANAGER" | "STAFF";

export type OrganizationSettings = {
  staff_can_submit_revenue_reports: boolean;
  staff_can_delete_revenue_reports: boolean;
  manager_can_submit_revenue_reports: boolean;
  manager_can_delete_revenue_reports: boolean;
  manager_can_view_full_dashboard: boolean;
  manager_can_view_payroll: boolean;
  manager_can_manage_team: boolean;
  manager_can_manage_business_settings: boolean;
  manager_can_access_notes: boolean;
  manager_can_access_inventory: boolean;
};

export type MembershipPermissionOverrides = {
  staff_can_submit_revenue_reports_override: boolean | null;
  staff_can_delete_revenue_reports_override: boolean | null;
  manager_can_submit_revenue_reports_override: boolean | null;
  manager_can_delete_revenue_reports_override: boolean | null;
  manager_can_view_full_dashboard_override: boolean | null;
  manager_can_view_payroll_override: boolean | null;
  manager_can_manage_team_override: boolean | null;
  manager_can_manage_business_settings_override: boolean | null;
  manager_can_access_notes_override: boolean | null;
  manager_can_access_inventory_override: boolean | null;
};

export type MembershipSummary = {
  organization_id: string;
  role: Role;
  max_hours_per_week: number;
  staff_position?: string | null;
} & MembershipPermissionOverrides;

export type Envelope<T> = {
  data: T;
  meta: Record<string, unknown>;
  error: { code: string; message: string; details?: unknown } | null;
};

export type AuthLoginResponse = {
  access_token: string;
  token_type: string;
  status: "linked" | "pending_link";
  memberships: MembershipSummary[];
  active_organization_id: string | null;
  role: Role | null;
};

export type SessionBootstrapResponse = {
  access_token: string;
  token_type: string;
  status: "linked" | "pending_link";
  memberships: MembershipSummary[];
  active_organization_id: string | null;
  role: Role | null;
};

export type OtpSendPurpose = "login" | "owner_signup" | "worker_signup" | "invite_join";

export type OtpSendResponse = {
  sent: boolean;
  expires_in_seconds: number;
  debug_code?: string | null;
};

export type OtpVerifyResponse = {
  access_token?: string | null;
  token_type: string;
  status: "linked" | "pending_link" | "owner_verified";
  memberships: MembershipSummary[];
  active_organization_id: string | null;
  role: Role | null;
  verification_token?: string | null;
};

export type MeResponse = {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  active_organization_id: string | null;
  active_organization_name: string | null;
  role: Role | null;
  is_linked: boolean;
  memberships: MembershipSummary[];
  organization_settings: OrganizationSettings | null;
  subscription: SubscriptionSummary | null;
};

export type SubscriptionPlan = "free" | "pro" | "business" | "enterprise";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";

export type SubscriptionSummary = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  billing_cycle: string;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  active_members_count: number;
  active_locations_count: number;
  member_cap: number | null;
  location_cap: number | null;
  soft_limit_reached: boolean;
};

export type LinkMemberByEmailResponse =
  | {
      status: "linked";
      user_id: string;
      organization_id: string;
      role: Role;
    }
  | {
      status: "already_member";
      user_id: string;
      organization_id: string;
      role: Role;
    }
  | {
      status: "invited";
      email: string;
      expires_at: string;
      debug_join_link?: string | null;
    };

export type Location = { id: string; name: string; timezone: string; manager_user_ids: string[]; manager_names: string[] };
export type ShiftTemplate = {
  id: string;
  location_id: string;
  day_of_week: number;
  template_name: string;
  start_time: string;
  end_time: string;
  required_role: Role;
  staff_position?: string | null;
  required_count: number;
  usage_count: number;
};

export type PositionCatalog = {
  id: string;
  name: string;
  is_active: boolean;
};

export type User = {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  role: Role;
  max_hours_per_week: number;
  staff_position?: string | null;
  hourly_rate_pln?: string;
};

export type LocationMember = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  staff_position?: string | null;
  max_hours_per_week: number;
  hourly_rate_pln: string;
  priority: number;
  permission_overrides?: MembershipPermissionOverrides | null;
};

export type WorkerSetupRow = LocationMember;

export type WorkerSetupLocation = {
  location_id: string;
  location_name: string;
  priority: number;
  hourly_rate_pln: string;
};

export type WorkerSetup = {
  user_id: string;
  full_name: string;
  role: Role;
  staff_position?: string | null;
  locations: WorkerSetupLocation[];
  permission_overrides: MembershipPermissionOverrides;
};

export type Assignment = {
  id: string;
  user_id: string;
  status: "assigned" | "in_shift" | "completed";
  started_at: string | null;
  ended_at?: string | null;
  override_reason?: string | null;
  overridden_by?: string | null;
  overridden_at?: string | null;
};

export type Shift = {
  id: string;
  location_id: string;
  date: string;
  start_time: string;
  end_time: string;
  required_role: Role;
  staff_position?: string | null;
  required_count: number;
  source: "manual" | "auto";
  assignments: Assignment[];
};

export type AvailabilityPreferenceSlot = {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
};

export type AvailabilityPreferenceWeek = {
  id: string;
  user_id: string;
  week_start: string;
  desired_hours: number;
  locked_at: string | null;
  locked_by: string | null;
  slots: AvailabilityPreferenceSlot[];
};

export type TeamAvailabilitySummaryRow = {
  user_id: string;
  full_name: string;
  desired_hours: number;
  slots_count: number;
  status: "filled" | "partial" | "empty";
  slots: AvailabilityPreferenceSlot[];
};

export type SchedulePreviewAssignment = {
  shift_key: string;
  template_id: string;
  location_id: string;
  location_name: string;
  date: string;
  start_time: string;
  end_time: string;
  required_role: Role;
  user_id: string;
  user_name: string;
  priority: number;
  assigned_hours_after: number;
  cost_pln: string;
};

export type SchedulePreviewOpenShift = {
  shift_key: string;
  template_id: string;
  location_id: string;
  location_name: string;
  date: string;
  start_time: string;
  end_time: string;
  required_role: Role;
  required_count: number;
  assigned_count: number;
  unfilled_count: number;
};

export type SchedulePreviewRejectedCandidate = {
  shift_key: string;
  template_id: string;
  location_id: string;
  date: string;
  start_time: string;
  end_time: string;
  user_id: string;
  user_name: string;
  reasons: string[];
};

export type SchedulePreview = {
  created_shifts: number;
  created_assignments: number;
  assignments: SchedulePreviewAssignment[];
  open_shifts: SchedulePreviewOpenShift[];
  warnings: string[];
  rejected_candidates: SchedulePreviewRejectedCandidate[];
  labor_cost_summary: {
    total_pln: string;
    by_day: Array<{ date: string; labor_cost_pln: string }>;
    by_location: Array<{ location_id: string; location_name: string; labor_cost_pln: string }>;
  };
  fairness_summary: Array<{
    user_id: string;
    user_name: string;
    assigned_hours: number;
    desired_hours: number;
    desired_gap: number;
  }>;
  coverage_summary: {
    total_slots: number;
    filled_slots: number;
    fill_rate_pct: number;
  };
  start_coverage_alerts: Array<{
    shift_key: string;
    template_id: string;
    location_id: string;
    location_name: string;
    date: string;
    start_time: string;
    end_time: string;
    required_role: Role;
    staff_position?: string | null;
    message: string;
  }>;
  apply_blocked: boolean;
};

export type WeeklyShiftOverride = {
  id: string;
  week_start: string;
  source_template_id?: string | null;
  location_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  required_role: Role;
  staff_position?: string | null;
  required_count: number;
  is_deleted?: boolean;
  assigned_user_id?: string | null;
};

export type SchedulePreviewEdit = {
  week_start: string;
  shift_key: string;
  action?: "upsert" | "delete" | "create";
  location_id?: string;
  day_of_week?: number;
  start_time?: string;
  end_time?: string;
  required_role?: Role;
  staff_position?: string | null;
  required_count?: number;
  assigned_user_id?: string | null;
};

export type SchedulePreviewMaterializeRequest = {
  week_start: string;
  location_id: string;
};

export type SchedulePreviewCalendarCell = {
  shift_key: string;
  location_id: string;
  location_name: string;
  date: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  required_role: Role;
  staff_position?: string | null;
  required_count: number;
  assigned_users: Array<{ user_id: string; user_name: string; priority: number }>;
  missing_count: number;
  source: string;
};

export type SchedulePreviewCalendarRow = {
  user_id: string;
  user_name: string;
  role: Role;
  staff_position?: string | null;
  days: Record<string, SchedulePreviewCalendarCell[]>;
};

export type SchedulePreviewCalendar = {
  week_start: string;
  rows: SchedulePreviewCalendarRow[];
  open_shifts_by_day: Record<string, SchedulePreviewCalendarCell[]>;
  summary: {
    total_slots: number;
    filled_slots: number;
    fill_rate_pct: number;
  };
};

export type AssignmentOverridePayload = {
  user_id: string;
  override_reason?: string | null;
};

export type StaffShiftCard = {
  shift_id: string;
  location_id: string;
  location_name: string;
  date: string;
  start_time: string;
  end_time: string;
  required_role: Role;
  staff_position?: string | null;
  required_count: number;
  assignment_count: number;
  is_mine: boolean;
  can_request_pickup: boolean;
  assignments: Array<{ id: string; user_id: string; user_name: string; status: "assigned" | "in_shift" | "completed" }>;
};

export type StaffCalendarDay = {
  date: string;
  day_of_week: number;
  shifts: StaffShiftCard[];
};

export type ShiftRequest = {
  id: string;
  shift_id: string;
  requester_user_id: string;
  requester_name: string;
  request_type: "pickup" | "swap";
  status: "pending" | "approved" | "rejected" | "cancelled";
  requester_assignment_id: string | null;
  target_assignment_id: string | null;
  note: string | null;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type Task = {
  id: string;
  location_id: string | null;
  title: string;
  description: string;
  assigned_to: string;
  created_by?: string | null;
  status: "pending" | "done";
  created_at: string;
  completed_at: string | null;
  photos: Array<{ id: string; photo_url: string; uploaded_by: string | null }>;
};

export type NotificationItem = {
  id: string;
  type: "general" | "schedule" | "task" | "report" | "shift_request" | "timesheet" | "team" | "billing";
  title: string;
  body: string;
  action_url?: string | null;
  entity_kind?: string | null;
  entity_id?: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationListResponse = {
  items: NotificationItem[];
  unread_count: number;
};

export type MemberRemovalImpact = {
  user_id: string;
  full_name: string;
  role: Role;
  future_assignments_count: number;
  pending_shift_requests_count: number;
  location_count: number;
  can_remove: boolean;
  blocking_reason: string | null;
};

export type MemberRemovalResult = MemberRemovalImpact & {
  removed: boolean;
};

export type DashboardData = {
  totals_by_location: Array<{ location_id: string; location_name: string; revenue: string }>;
  totals_by_day: Array<{ date: string; revenue: string }>;
  labor_cost_by_day: Array<{ date: string; labor_cost_pln: string }>;
  labor_cost_by_location: Array<{ location_id: string; location_name: string; labor_cost_pln: string }>;
  revenue_vs_labor: Array<{ date: string; revenue: string; labor_cost_pln: string }>;
  reports?: Array<{ id: string; location_id: string; location_name: string; photo_url: string | null; report_date: string; revenue: string; created_at: string }>;
  photo_reports: Array<{ id: string; location_id: string; location_name: string; photo_url: string; report_date: string; revenue: string }>;
  timesheets_summary?: { pending_count: number; approved_worked_hours: string };
  employee_payroll?: Array<{
    user_id: string;
    full_name: string;
    role: Role;
    staff_position?: string | null;
    approved_hours: string;
    hourly_rate_default_pln: string;
    payroll_pln: string;
    restricted_hours?: string;
  }>;
};

export type PayrollSummaryRow = {
  user_id: string;
  full_name: string;
  role: Role;
  staff_position?: string | null;
  approved_hours: string;
  hourly_rate_default_pln: string;
  payroll_pln: string;
  restricted_hours?: string;
};

export type PayrollSummary = {
  period_start: string;
  period_end: string;
  viewer_scope: "self" | "team";
  total_hours: string;
  total_payroll_pln: string;
  rows: PayrollSummaryRow[];
};

export type ShiftEndPayload = {
  assignment_id: string;
  status: "completed";
  ended_at: string;
};

export type TimesheetStatus = "pending" | "approved" | "rejected" | "corrected";

export type TimesheetEntry = {
  id: string;
  organization_id: string;
  user_id: string;
  shift_id: string | null;
  work_date: string;
  arrived_at: string;
  left_at: string;
  note: string | null;
  is_restricted_entry: boolean;
  status: TimesheetStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TimesheetReviewAction = {
  action: "approve" | "reject" | "correct";
  arrived_at?: string;
  left_at?: string;
  review_note?: string;
};
