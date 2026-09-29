import type {
  PlatformAction,
  PlatformBusiness,
  PlatformLogItem,
  PlatformStats,
  ClockMe,
  ClockMode,
  ClockSessionInfo,
  KioskDeviceItem,
  KioskPunchResult,
  AssignmentOverridePayload,
  BillingCheckoutCycle,
  BillingCheckoutSession,
  BillingPortalSession,
  AuthLoginResponse,
  AvailabilityPreferenceSlot,
  AvailabilityPreferenceWeek,
  TeamAvailabilitySummaryRow,
  DashboardData,
  Envelope,
  LinkMemberByEmailResponse,
  Location,
  LocationMember,
  MeResponse,
  PositionCatalog,
  OtpSendPurpose,
  OtpSendResponse,
  SessionBootstrapResponse,
  OtpVerifyResponse,
  NotificationListResponse,
  SchedulePreviewCalendar,
  SchedulePreviewEdit,
  SchedulePreviewMaterializeRequest,
  SchedulePreview,
  Shift,
  ShiftTemplate,
  ShiftRequest,
  StaffCalendarDay,
  SubscriptionPlan,
  Task,
  TimesheetEntry,
  TimesheetReviewAction,
  NotificationItem,
  SubscriptionSummary,
  PayrollSummary,
  User,
  WeeklyShiftOverride,
  WaitlistLead,
  WaitlistSignupResponse,
  WorkerSetup,
  ShiftEndPayload,
  MemberRemovalImpact,
  MemberRemovalResult, MemberPosition } from "@/lib/types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Absolute URL of an API path, also when VITE_API_URL is relative (e.g. "/api" behind the proxy). */
export function apiAbsoluteUrl(path: string): string {
  return new URL(`${API_URL}${path}`, window.location.origin).toString();
}

/** An error answered by the API, with its HTTP status (401 = the sign-in token is no longer valid). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("NETWORK_ERROR");
    }
    throw error;
  }

  const rawPayload = (await response.json().catch(() => null)) as (Envelope<T> & { detail?: unknown }) | null;
  const payload = rawPayload as Envelope<T> | null;
  if (!response.ok || payload?.error) {
    const detail = rawPayload?.detail;
    const detailMessage =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((item) => {
                if (item && typeof item === "object" && "msg" in item) return String((item as { msg: unknown }).msg);
                return String(item);
              })
              .join("; ")
          : undefined;
    throw new ApiError(payload?.error?.message ?? detailMessage ?? `Request failed: ${response.status}`, response.status);
  }

  return payload!.data;
}

export const api = {
  login(input: { email: string; password: string }) {
    return request<AuthLoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  devLogin(secret?: string | null, asRole: "admin" | "staff" = "admin") {
    return request<AuthLoginResponse>("/auth/dev-login", { method: "POST", body: JSON.stringify({ secret: secret ?? null, as_role: asRole }) });
  },
  loginWithPassword(input: { email: string; password: string }) {
    return request<AuthLoginResponse>("/auth/login/password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  sendOtp(input: { email: string; purpose: OtpSendPurpose; invite_token?: string | null }) {
    return request<OtpSendResponse>("/auth/otp/send", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  verifyOtp(input: { email: string; code: string; purpose: OtpSendPurpose; full_name?: string; invite_token?: string | null }) {
    return request<OtpVerifyResponse>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  completeOwnerOnboarding(input: { verification_token: string; full_name: string; organization_name: string; password: string; source: string; country?: "US" | "PL" }) {
    return request<AuthLoginResponse>("/auth/onboarding/owner/complete", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  acceptInvite(input: { email: string; invite_token: string; full_name: string; password: string }) {
    return request<AuthLoginResponse>("/auth/invites/join/accept", { method: "POST", body: JSON.stringify(input) });
  },
  verifyInviteJoin(input: { email: string; code: string; invite_token: string; full_name?: string }) {
    return request<AuthLoginResponse>("/auth/invites/join/verify", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  joinWaitlist(input: { email: string }) {
    return request<WaitlistSignupResponse>("/marketing/waitlist", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  listWaitlist(token: string) {
    return request<WaitlistLead[]>("/marketing/waitlist", {}, token);
  },
  bootstrapSession() {
    return request<SessionBootstrapResponse | null>("/auth/session");
  },
  logout() {
    return request<{ logged_out: boolean }>("/auth/logout", { method: "POST" });
  },
  me(token: string) {
    return request<MeResponse>("/auth/me", {}, token);
  },
  seedDemoRestaurant(token: string) {
    return request<{ people: number; locations: number; shifts: number; timesheets: number; revenue_days: number; tasks: number; requests: number }>(
      "/organizations/current/demo-restaurant",
      { method: "POST" },
      token,
    );
  },
  patchCurrentOrganization(token: string, body: { name?: string; country?: "US" | "PL" }) {
    return request<{ id: string; name: string; country: "US" | "PL"; currency: "USD" | "PLN" }>("/organizations/current", {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token);
  },
  patchCurrentOrganizationSettings(
    token: string,
    body: {
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
    },
  ) {
    return request<typeof body>("/organizations/current/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token);
  },
  listLocations(token: string) {
    return request<Location[]>("/locations", {}, token);
  },
  createLocation(token: string, body: { name: string; timezone: string }) {
    return request<Location>("/locations", {
      method: "POST",
      body: JSON.stringify(body),
    }, token);
  },
  patchLocation(token: string, locationId: string, body: { name: string; timezone: string; manager_user_ids?: string[] }) {
    return request<Location>(`/locations/${locationId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token);
  },
  deleteLocation(token: string, locationId: string) {
    return request<{ deleted: boolean; id: string }>(`/locations/${locationId}`, {
      method: "DELETE",
    }, token);
  },
  listUsers(token: string) {
    return request<User[]>("/users", {}, token);
  },
  patchStaffPosition(token: string, userId: string, staffPosition: string) {
    return request<{ user_id: string; staff_position: string }>(`/users/${userId}/position`, {
      method: "PATCH",
      body: JSON.stringify({ staff_position: staffPosition }),
    }, token);
  },
  patchMe(token: string, body: { full_name: string; avatar_url?: string | null }) {
    return request<{ id: string; full_name: string; avatar_url?: string | null }>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token);
  },
  listLocationMembers(token: string, locationId: string) {
    return request<LocationMember[]>(`/locations/${locationId}/members`, {}, token);
  },
  listInvites(token: string) {
    return request<Array<{ id: string; email: string; expires_at: string }>>("/organizations/invites", {}, token);
  },
  cancelInvite(token: string, inviteId: string) {
    return request<{ deleted: boolean; id: string }>(`/organizations/invites/${inviteId}`, { method: "DELETE" }, token);
  },
  linkMemberByEmail(
    token: string,
    body: {
      email: string;
      name?: string;
    },
  ) {
    return request<LinkMemberByEmailResponse>(
      "/organizations/members/link-by-email",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      token,
    );
  },
  getMemberRemovalImpact(token: string, userId: string) {
    return request<MemberRemovalImpact>(`/organizations/members/${userId}/removal-impact`, {}, token);
  },
  removeMember(token: string, userId: string) {
    return request<MemberRemovalResult>(`/organizations/members/${userId}`, { method: "DELETE" }, token);
  },
  getCurrentSubscription(token: string) {
    return request<SubscriptionSummary>("/organizations/current/subscription", {}, token);
  },
  createCheckoutSession(token: string, body: { plan: SubscriptionPlan; billing_cycle: BillingCheckoutCycle }) {
    return request<BillingCheckoutSession>("/billing/checkout-session", {
      method: "POST",
      body: JSON.stringify(body),
    }, token);
  },
  createBillingPortalSession(token: string) {
    return request<BillingPortalSession>("/billing/portal-session", {
      method: "POST",
    }, token);
  },
  patchLocationMember(
    token: string,
    locationId: string,
    userId: string,
    body: { hourly_rate_pln: string; priority: number; max_hours_per_week?: number },
  ) {
    return request<LocationMember>(`/locations/${locationId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token);
  },
  getWorkerSetup(token: string, userId: string) {
    return request<WorkerSetup>(`/workers/${userId}/setup`, {}, token);
  },
  putWorkerPositions(token: string, userId: string, positions: MemberPosition[]) {
    return request<MemberPosition[]>(`/workers/${userId}/positions`, { method: "PUT", body: JSON.stringify({ positions }) }, token);
  },
  patchWorkerSetup(
    token: string,
    userId: string,
    body: {
      locations: Array<{ location_id: string; priority: number; hourly_rate_pln: string }>;
      permission_overrides?: {
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
    },
  ) {
    return request<{ updated: boolean; user_id: string; count: number }>(`/workers/${userId}/setup`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token);
  },
  getAvailability(token: string, weekStart: string, userId?: string) {
    const suffix = userId ? `?user_id=${userId}` : "";
    return request<AvailabilityPreferenceWeek | null>(`/availability/weeks/${weekStart}${suffix}`, {}, token);
  },
  getTeamAvailabilitySummary(token: string, weekStart: string) {
    return request<TeamAvailabilitySummaryRow[]>(`/availability/weeks/${weekStart}/team-summary`, {}, token);
  },
  putAvailability(
    token: string,
    weekStart: string,
    body: { desired_hours: number; user_id?: string; slots: AvailabilityPreferenceSlot[] },
  ) {
    return request<AvailabilityPreferenceWeek>(`/availability/weeks/${weekStart}`, {
      method: "PUT",
      body: JSON.stringify({
        week_start: weekStart,
        desired_hours: body.desired_hours,
        user_id: body.user_id,
        slots: body.slots,
      }),
    }, token);
  },
  approveAvailability(token: string, weekStart: string, userId: string) {
    return request<AvailabilityPreferenceWeek>(`/availability/weeks/${weekStart}/approve`, {
      method: "PATCH",
      body: JSON.stringify({ user_id: userId }),
    }, token);
  },
  createTemplate(
    token: string,
    body: {
      location_id: string;
      day_of_week: number;
      template_name: string;
      start_time: string;
      end_time: string;
      required_role: "ADMIN" | "MANAGER" | "STAFF";
      staff_position?: string | null;
      required_count: number;
    },
  ) {
    return request<ShiftTemplate>("/schedule/templates", { method: "POST", body: JSON.stringify(body) }, token);
  },
  listTemplates(token: string, locationId?: string) {
    const suffix = locationId ? `?location_id=${locationId}` : "";
    return request<ShiftTemplate[]>(`/schedule/templates${suffix}`, {}, token);
  },
  patchTemplate(
    token: string,
    templateId: string,
    body: {
      day_of_week: number;
      template_name: string;
      start_time: string;
      end_time: string;
      required_role: "ADMIN" | "MANAGER" | "STAFF";
      staff_position?: string | null;
      required_count: number;
      is_active: boolean;
    },
  ) {
    return request<ShiftTemplate>(`/schedule/templates/${templateId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token);
  },
  deleteTemplate(token: string, templateId: string) {
    return request<{ deleted: boolean; id: string }>(`/schedule/templates/${templateId}`, {
      method: "DELETE",
    }, token);
  },
  listPositions(token: string) {
    return request<PositionCatalog[]>("/positions", {}, token);
  },
  createPosition(token: string, name: string) {
    return request<PositionCatalog>("/positions", {
      method: "POST",
      body: JSON.stringify({ name }),
    }, token);
  },
  deletePosition(token: string, positionId: string) {
    return request<{ deleted: boolean; id: string; mode: "soft_disabled" | "hard_deleted" }>(`/positions/${positionId}`, {
      method: "DELETE",
    }, token);
  },
  suggestTemplates(token: string, weekStart: string) {
    return request<Array<Record<string, unknown>>>("/schedule/templates/suggest", {
      method: "POST",
      body: JSON.stringify({ week_start: weekStart }),
    }, token);
  },
  previewSchedule(token: string, weekStart: string, locationId?: string) {
    return request<SchedulePreview>("/schedule/generate/preview", {
      method: "POST",
      body: JSON.stringify({ week_start: weekStart, location_id: locationId ?? null }),
    }, token);
  },
  getPreviewCalendar(token: string, weekStart: string, locationId?: string) {
    const query = locationId
      ? `/schedule/preview/calendar?week_start=${weekStart}&location_id=${locationId}`
      : `/schedule/preview/calendar?week_start=${weekStart}`;
    return request<SchedulePreviewCalendar>(query, {}, token);
  },
  patchPreviewEdit(token: string, body: SchedulePreviewEdit) {
    return request<WeeklyShiftOverride>("/schedule/preview/edits", {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token);
  },
  listWeeklyOverrides(token: string, weekStart: string) {
    return request<WeeklyShiftOverride[]>(`/schedule/overrides?week_start=${weekStart}`, {}, token);
  },
  putWeeklyOverrides(token: string, weekStart: string, overrides: WeeklyShiftOverride[]) {
    return request<WeeklyShiftOverride[]>("/schedule/overrides", {
      method: "PUT",
      body: JSON.stringify({
        week_start: weekStart,
        overrides: overrides.map((item) => ({
          id: item.id,
          week_start: weekStart,
          source_template_id: item.source_template_id ?? null,
          location_id: item.location_id,
          day_of_week: item.day_of_week,
          start_time: item.start_time,
          end_time: item.end_time,
          required_role: item.required_role,
          staff_position: item.staff_position ?? null,
          required_count: item.required_count,
          is_deleted: item.is_deleted ?? false,
          assigned_user_id: item.assigned_user_id ?? null,
        })),
      }),
    }, token);
  },
  freezeAppliedPreview(token: string, weekStart: string, locationId: string) {
    return request<WeeklyShiftOverride[]>("/schedule/preview/freeze-applied", {
      method: "POST",
      body: JSON.stringify({ week_start: weekStart, location_id: locationId }),
    }, token);
  },
  materializePreview(token: string, body: SchedulePreviewMaterializeRequest) {
    return request<WeeklyShiftOverride[]>("/schedule/preview/materialize", {
      method: "POST",
      body: JSON.stringify(body),
    }, token);
  },
  applySchedule(token: string, weekStart: string, locationId?: string) {
    return request<SchedulePreview>("/schedule/generate/apply", {
      method: "POST",
      body: JSON.stringify({ week_start: weekStart, location_id: locationId ?? null }),
    }, token);
  },
  generateSchedule(token: string, weekStart: string, locationId?: string) {
    return request<{ created_shifts: number; created_assignments: number; warnings: string[] }>("/schedule/generate", {
      method: "POST",
      body: JSON.stringify({ week_start: weekStart, location_id: locationId ?? null }),
    }, token);
  },
  listShifts(token: string, weekStart: string) {
    return request<Shift[]>(`/schedule/shifts?week_start=${weekStart}`, {}, token);
  },
  listStaffShifts(token: string, weekStart: string, scope: "my" | "team") {
    return request<StaffCalendarDay[]>(`/schedule/shifts/staff?week_start=${weekStart}&scope=${scope}`, {}, token);
  },
  patchAssignment(token: string, assignmentId: string, body: AssignmentOverridePayload) {
    return request<{ assignment: Shift["assignments"][number]; warnings: string[] }>(`/schedule/assignments/${assignmentId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token);
  },
  createShiftRequest(
    token: string,
    body: {
      shift_id: string;
      request_type: "pickup" | "swap";
      requester_assignment_id?: string | null;
      target_assignment_id?: string | null;
      note?: string | null;
    },
  ) {
    return request<ShiftRequest>("/schedule/requests", {
      method: "POST",
      body: JSON.stringify(body),
    }, token);
  },
  listShiftRequests(token: string, scope: "my" | "incoming") {
    return request<ShiftRequest[]>(`/schedule/requests?scope=${scope}`, {}, token);
  },
  patchShiftRequest(token: string, requestId: string, action: "approve" | "reject" | "cancel") {
    return request<ShiftRequest>(`/schedule/requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }, token);
  },
  startShift(token: string, shiftId: string) {
    return request<{ assignment_id: string; status: string; started_at: string }>(`/shifts/${shiftId}/start`, { method: "POST" }, token);
  },
  endShift(token: string, shiftId: string) {
    return request<ShiftEndPayload>(`/shifts/${shiftId}/end`, { method: "POST" }, token);
  },
  createTimesheet(
    token: string,
    body: { shift_id?: string | null; work_date?: string | null; arrived_at: string; left_at: string; note?: string | null },
  ) {
    return request<TimesheetEntry>("/timesheets", {
      method: "POST",
      body: JSON.stringify(body),
    }, token);
  },
  listTimesheets(
    token: string,
    params: { scope?: "my" | "team" | "pending"; start_date?: string; end_date?: string; user_id?: string } = {},
  ) {
    const search = new URLSearchParams();
    if (params.scope) search.set("scope", params.scope);
    if (params.start_date) search.set("start_date", params.start_date);
    if (params.end_date) search.set("end_date", params.end_date);
    if (params.user_id) search.set("user_id", params.user_id);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request<TimesheetEntry[]>(`/timesheets${suffix}`, {}, token);
  },
  reviewTimesheet(token: string, timesheetId: string, body: TimesheetReviewAction) {
    return request<TimesheetEntry>(`/timesheets/${timesheetId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token);
  },
  listTasks(token: string) {
    return request<Task[]>("/tasks", {}, token);
  },
  createTask(token: string, body: { location_id: string | null; title: string; description: string; assigned_to: string }) {
    return request<Task>("/tasks", { method: "POST", body: JSON.stringify(body) }, token);
  },
  patchTask(token: string, taskId: string, status: "pending" | "done") {
    return request<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) }, token);
  },
  deleteTask(token: string, taskId: string) {
    return request<{ deleted: boolean; id: string }>(`/tasks/${taskId}`, { method: "DELETE" }, token);
  },
  addTaskPhoto(token: string, taskId: string, photoUrl: string) {
    return request<Task>(`/tasks/${taskId}/photos`, {
      method: "POST",
      body: JSON.stringify({ photo_url: photoUrl }),
    }, token);
  },
  addRevenueReport(
    token: string,
    body: { location_id: string; report_date: string; revenue: string; currency: string; photo_url: string | null },
  ) {
    return request("/reports/revenue", { method: "POST", body: JSON.stringify(body) }, token);
  },
  listRevenueReports(token: string, startDate: string, endDate: string) {
    return request<Array<{ id: string; location_id: string; report_date: string; revenue: string; currency: string; photo_url: string | null }>>(
      `/reports/revenue?start_date=${startDate}&end_date=${endDate}`,
      {},
      token,
    );
  },
  deleteRevenueReport(token: string, reportId: string) {
    return request<{ deleted: boolean; id: string }>(`/reports/revenue/${reportId}`, { method: "DELETE" }, token);
  },
  ownerDashboard(token: string, startDate: string, endDate: string) {
    return request<DashboardData>(`/dashboard/owner?start_date=${startDate}&end_date=${endDate}`, {}, token);
  },
  getPayrollSummary(token: string, params: { start_date: string; end_date: string; user_id?: string } ) {
    const search = new URLSearchParams();
    search.set("start_date", params.start_date);
    search.set("end_date", params.end_date);
    if (params.user_id) search.set("user_id", params.user_id);
    return request<PayrollSummary>(`/payroll/summary?${search.toString()}`, {}, token);
  },
  async downloadPayrollCsv(token: string, params: { start_date: string; end_date: string }): Promise<Blob> {
    const search = new URLSearchParams(params);
    const response = await fetch(`${API_URL}/payroll/export.csv?${search.toString()}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as Envelope<unknown> | null;
      throw new Error(payload?.error?.message ?? `Request failed: ${response.status}`);
    }
    return response.blob();
  },
  getCalendarFeed(token: string) {
    return request<{ path: string; expires_in_days: number }>("/calendar/feed", {}, token);
  },
  listNotifications(token: string, limit = 20) {
    return request<NotificationListResponse>(`/notifications?limit=${limit}`, {}, token);
  },
  markNotificationsRead(token: string, ids: string[]) {
    return request<{ updated: number }>("/notifications/mark-read", { method: "POST", body: JSON.stringify({ ids }) }, token);
  },
  deleteNotification(token: string, notificationId: string) {
    return request<{ deleted: boolean; id: string }>(`/notifications/${notificationId}`, { method: "DELETE" }, token);
  },
  clockMe(token: string) {
    return request<ClockMe>("/clock/me", {}, token);
  },
  clockIn(token: string, coords?: { latitude: number; longitude: number; accuracy: number }) {
    return request<ClockSessionInfo>("/clock/in", { method: "POST", body: JSON.stringify(coords ?? {}) }, token);
  },
  clockBreak(token: string, phase: "start" | "end") {
    return request<ClockSessionInfo>(`/clock/break/${phase}`, { method: "POST" }, token);
  },
  setLocationClockArea(token: string, locationId: string, body: { latitude: number | null; longitude: number | null; radius_m: number }) {
    return request<{ id: string }>(`/locations/${locationId}/clock-area`, { method: "PUT", body: JSON.stringify(body) }, token);
  },
  clockOut(token: string) {
    return request<{ session: ClockSessionInfo; timesheet_status: string }>("/clock/out", { method: "POST" }, token);
  },
  setMyClockPin(token: string, pin: string) {
    return request<{ has_pin: boolean }>("/clock/pin", { method: "PUT", body: JSON.stringify({ pin }) }, token);
  },
  resetClockPin(token: string, userId: string) {
    return request<{ pin: string }>(`/clock/pins/${userId}`, { method: "POST" }, token);
  },
  clockTeam(token: string) {
    return request<Array<ClockSessionInfo & { user_id: string; full_name: string }>>("/clock/team", {}, token);
  },
  setScheduleHourLimits(token: string, respectHourLimits: boolean) {
    return request<{ respect_hour_limits: boolean }>("/organizations/current/scheduling", { method: "PATCH", body: JSON.stringify({ respect_hour_limits: respectHourLimits }) }, token);
  },
  setClockMode(token: string, mode: ClockMode) {
    return request<{ mode: ClockMode }>("/clock/settings", { method: "PATCH", body: JSON.stringify({ mode }) }, token);
  },
  listKiosks(token: string) {
    return request<KioskDeviceItem[]>("/clock/kiosks", {}, token);
  },
  createKiosk(token: string, body: { location_id: string; name?: string }) {
    return request<{ id: string; token: string; location_name: string }>("/clock/kiosks", { method: "POST", body: JSON.stringify(body) }, token);
  },
  deleteKiosk(token: string, id: string) {
    return request<{ deleted: boolean }>(`/clock/kiosks/${id}`, { method: "DELETE" }, token);
  },
  kioskDevice(kioskToken: string) {
    return request<{ name: string; business_name: string; location_name: string; timezone: string; enabled: boolean }>("/kiosk/device", {
      headers: { "X-Kiosk-Token": kioskToken },
    });
  },
  kioskPunch(kioskToken: string, pin: string, action: "toggle" | "break" = "toggle") {
    return request<KioskPunchResult>("/kiosk/punch", { method: "POST", body: JSON.stringify({ pin, action }), headers: { "X-Kiosk-Token": kioskToken } });
  },
  platformStats(token: string) {
    return request<PlatformStats>("/platform/stats", {}, token);
  },
  platformBusinesses(token: string, q = "") {
    return request<PlatformBusiness[]>(`/platform/organizations?q=${encodeURIComponent(q)}`, {}, token);
  },
  platformBusiness(token: string, id: string) {
    return request<PlatformBusiness & { log: PlatformLogItem[] }>(`/platform/organizations/${id}`, {}, token);
  },
  platformChange(token: string, id: string, body: PlatformAction) {
    return request<PlatformBusiness & { detail: Record<string, unknown> }>(`/platform/organizations/${id}/subscription`, { method: "POST", body: JSON.stringify(body) }, token);
  },
  platformDelete(token: string, id: string, confirmName: string) {
    return request<{ deleted: boolean }>(`/platform/organizations/${id}`, { method: "DELETE", body: JSON.stringify({ confirm_name: confirmName }) }, token);
  },
  platformAudit(token: string) {
    return request<PlatformLogItem[]>("/platform/audit?limit=30", {}, token);
  },
  pushKey() {
    return request<{ public_key: string }>("/push/key");
  },
  pushSubscribe(token: string, body: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return request<{ subscribed: boolean }>("/push/subscribe", { method: "POST", body: JSON.stringify(body) }, token);
  },
  pushUnsubscribe(token: string, endpoint: string) {
    return request<{ subscribed: boolean }>("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }, token);
  },
  importTeam(token: string, rows: Array<{ email: string; name?: string; position?: string; rate?: number }>) {
    return request<{ invited: string[]; skipped: Array<{ email: string; reason: string }> }>("/organizations/members/import", { method: "POST", body: JSON.stringify({ rows }) }, token);
  },
  lookupInvite(token: string, email: string) {
    return request<{ business_name: string; full_name: string | null; expired: boolean }>(`/auth/invites/lookup?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`);
  },
};
