import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CalendarDays, Coins, MailPlus, MapPin, Plus, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { WorkerAvatar } from "@/components/worker-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatTime, getMonday } from "@/lib/date";
import { useToast } from "@/lib/toast";
import type { PositionCatalog, Role, ShiftTemplate } from "@/lib/types";

type WorkerDraft = {
  hourly_rate_pln: string;
  priority: string;
  staff_position: string;
};

const templateDayOptions = [
  { label: "Monday", value: "0" },
  { label: "Tuesday", value: "1" },
  { label: "Wednesday", value: "2" },
  { label: "Thursday", value: "3" },
  { label: "Friday", value: "4" },
  { label: "Saturday", value: "5" },
  { label: "Sunday", value: "6" },
];
const templateDayShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function positionTone(position?: string | null) {
  const key = (position ?? "").trim().toLowerCase();
  if (key === "cook" || key === "chef" || key === "kucharz") return "border-amber-200 bg-amber-50 text-amber-700";
  if (key === "waiter" || key === "kelner") return "border-sky-200 bg-sky-50 text-sky-700";
  if (key === "bartender" || key === "barman") return "border-violet-200 bg-violet-50 text-violet-700";
  if (key === "manager" || key === "kierownik") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

const templateRoleOptions = [
  { label: "Line staff", value: "STAFF" },
  { label: "Manager", value: "MANAGER" },
  { label: "ADMIN", value: "ADMIN" },
];

function getNextWeekMondayIso() {
  const mondayIso = getMonday();
  const mondayDate = new Date(`${mondayIso}T00:00:00`);
  mondayDate.setDate(mondayDate.getDate() + 7);
  const year = mondayDate.getFullYear();
  const month = `${mondayDate.getMonth() + 1}`.padStart(2, "0");
  const day = `${mondayDate.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function TeamPage() {
  const { token, me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canEditWorkers = me?.role === "ADMIN" || me?.role === "MANAGER";
  const nextWeekStart = useMemo(() => getNextWeekMondayIso(), []);
  const currentWeekStart = useMemo(() => getMonday(), []);

  const [activeTab, setActiveTab] = useState<"directory" | "locations">("directory");
  const [directorySearch, setDirectorySearch] = useState("");
  const [workerSetupUserId, setWorkerSetupUserId] = useState<string | null>(null);
  const [workerSetupDraft, setWorkerSetupDraft] = useState<Record<string, { priority: string; hourly_rate_pln: string }>>({});
  const [workerPositionDraft, setWorkerPositionDraft] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, WorkerDraft>>({});
  const [locationDrafts, setLocationDrafts] = useState<Record<string, { name: string; timezone: string; manager_user_ids: string[] }>>({});
  const [newLocation, setNewLocation] = useState({ name: "", timezone: "Europe/Warsaw" });
  const [createLocationOpen, setCreateLocationOpen] = useState(false);
  const [locationSettingsId, setLocationSettingsId] = useState<string | null>(null);
  const [deletePopupOpen, setDeletePopupOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [linkEmail, setLinkEmail] = useState("");
  const [selectedTemplateDay, setSelectedTemplateDay] = useState("0");
  const [templateDrafts, setTemplateDrafts] = useState<
    Record<
      string,
      {
        template_name: string;
        start_time: string;
        end_time: string;
        required_role: Role;
        staff_position: string;
        required_count: string;
      }
    >
  >({});
  const [copiedDayTemplates, setCopiedDayTemplates] = useState<
    Array<{
      template_name: string;
      start_time: string;
      end_time: string;
      required_role: Role;
      staff_position: string;
      required_count: number;
    }>
  >([]);
  const [templateInput, setTemplateInput] = useState({
    template_name: "",
    day_of_week: selectedTemplateDay,
    shift_count: "1",
    staff_position: "Cook",
    shift_1_start: "08:00:00",
    shift_1_end: "20:00:00",
    shift_2_start: "14:00:00",
    shift_2_end: "20:00:00",
    required_role: "STAFF" as Role,
    required_count: "1",
  });

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.listUsers(token!), enabled: Boolean(token) });
  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: () => api.listLocations(token!), enabled: Boolean(token) });
  const positionsQuery = useQuery({ queryKey: ["positions"], queryFn: () => api.listPositions(token!), enabled: Boolean(token) });
  const locationMembersQuery = useQuery({
    queryKey: ["location-members", selectedLocationId],
    queryFn: () => api.listLocationMembers(token!, selectedLocationId),
    enabled: Boolean(token) && Boolean(selectedLocationId),
  });
  const templatesQuery = useQuery({
    queryKey: ["templates", locationSettingsId],
    queryFn: () => api.listTemplates(token!, locationSettingsId || undefined),
    enabled: Boolean(token) && Boolean(locationSettingsId),
  });
  const workerSetupQuery = useQuery({
    queryKey: ["worker-setup", workerSetupUserId],
    queryFn: () => api.getWorkerSetup(token!, workerSetupUserId!),
    enabled: Boolean(token) && Boolean(workerSetupUserId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const teamAvailabilitySummaryQuery = useQuery({
    queryKey: ["team-availability-summary", nextWeekStart],
    queryFn: () => api.getTeamAvailabilitySummary(token!, nextWeekStart),
    enabled: Boolean(token) && canEditWorkers,
  });
  const workerAvailabilityQuery = useQuery({
    queryKey: ["worker-availability", workerSetupUserId, nextWeekStart],
    queryFn: () => api.getAvailability(token!, nextWeekStart, workerSetupUserId!),
    enabled: Boolean(token) && canEditWorkers && Boolean(workerSetupUserId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const weekShiftsQuery = useQuery({
    queryKey: ["team-week-shifts", currentWeekStart],
    queryFn: () => api.listShifts(token!, currentWeekStart),
    enabled: Boolean(token) && canEditWorkers,
  });

  useEffect(() => {
    if (!selectedLocationId && locationsQuery.data?.[0]?.id) {
      setSelectedLocationId(locationsQuery.data[0].id);
    }
  }, [locationsQuery.data, selectedLocationId]);

  useEffect(() => {
    setTemplateInput((current) => ({ ...current, day_of_week: selectedTemplateDay }));
  }, [selectedTemplateDay]);

  useEffect(() => {
    const nextDrafts: Record<string, WorkerDraft> = {};
    for (const member of locationMembersQuery.data ?? []) {
      nextDrafts[member.id] = {
        hourly_rate_pln: member.hourly_rate_pln,
        priority: String(member.priority),
        staff_position: member.staff_position || "",
      };
    }
    setDrafts(nextDrafts);
  }, [locationMembersQuery.data]);

  useEffect(() => {
    const next: Record<string, { name: string; timezone: string; manager_user_ids: string[] }> = {};
    for (const location of locationsQuery.data ?? []) {
      next[location.id] = { name: location.name, timezone: location.timezone, manager_user_ids: location.manager_user_ids ?? [] };
    }
    setLocationDrafts(next);
  }, [locationsQuery.data]);

  useEffect(() => {
    const next: Record<
      string,
      {
        template_name: string;
        start_time: string;
        end_time: string;
        required_role: Role;
        staff_position: string;
        required_count: string;
      }
    > = {};
    for (const template of templatesQuery.data ?? []) {
      next[template.id] = {
        template_name: template.template_name || "Default template",
        start_time: template.start_time,
        end_time: template.end_time,
        required_role: template.required_role,
        staff_position: template.staff_position || "Cook",
        required_count: String(template.required_count),
      };
    }
    setTemplateDrafts(next);
  }, [templatesQuery.data]);
  useEffect(() => {
    const data = workerSetupQuery.data;
    if (!data) return;
    const next: Record<string, { priority: string; hourly_rate_pln: string }> = {};
    for (const item of data.locations) {
      next[item.location_id] = {
        priority: String(item.priority),
        hourly_rate_pln: item.hourly_rate_pln,
      };
    }
    setWorkerSetupDraft(next);
    setWorkerPositionDraft(data.staff_position || "");
  }, [workerSetupQuery.data]);

  const saveWorkerMutation = useMutation({
    mutationFn: ({ userId, draft }: { userId: string; draft: WorkerDraft }) =>
      api.patchLocationMember(token!, selectedLocationId, userId, {
        hourly_rate_pln: draft.hourly_rate_pln,
        priority: Number(draft.priority),
      }),
    onSuccess: async (_, variables) => {
      await api.patchStaffPosition(token!, variables.userId, variables.draft.staff_position);
      void queryClient.invalidateQueries({ queryKey: ["location-members", selectedLocationId] });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      toast.success("Worker saved");
    },
    onError: (error) => {
      toast.error("Failed to save worker", error instanceof Error ? error.message : undefined);
    },
  });

  const createLocationMutation = useMutation({
    mutationFn: () => api.createLocation(token!, newLocation),
    onSuccess: () => {
      setNewLocation({ name: "", timezone: "Europe/Warsaw" });
      setCreateLocationOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Location created");
    },
    onError: (error) => {
      toast.error("Failed to create location", error instanceof Error ? error.message : undefined);
    },
  });

  const patchLocationMutation = useMutation({
    mutationFn: ({ locationId, name, timezone, manager_user_ids }: { locationId: string; name: string; timezone: string; manager_user_ids: string[] }) =>
      api.patchLocation(token!, locationId, { name, timezone, manager_user_ids }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Location saved");
    },
    onError: (error) => {
      toast.error("Failed to save location", error instanceof Error ? error.message : undefined);
    },
  });
  const deleteLocationMutation = useMutation({
    mutationFn: (locationId: string) => api.deleteLocation(token!, locationId),
    onSuccess: (_, locationId) => {
      if (selectedLocationId === locationId) {
        setSelectedLocationId("");
      }
      if (locationSettingsId === locationId) {
        setLocationSettingsId(null);
      }
      setDeletePopupOpen(false);
      setDeleteText("");
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
      void queryClient.invalidateQueries({ queryKey: ["location-members"] });
      toast.success("Location deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete location", error instanceof Error ? error.message : undefined);
    },
  });

  const linkByEmailMutation = useMutation({
    mutationFn: () =>
      api.linkMemberByEmail(token!, {
        email: linkEmail.trim().toLowerCase(),
      }),
    onSuccess: (data) => {
      if (data.status === "linked") {
        toast.success("User added to your team", linkEmail.trim().toLowerCase());
      } else if (data.status === "already_member") {
        toast.info("Already on your team", linkEmail.trim().toLowerCase());
      } else {
        toast.success("Invite sent", linkEmail.trim().toLowerCase());
      }
      setLinkEmail("");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["worker-setup"] });
    },
    onError: (error) => {
      toast.error("Failed to link by email", error instanceof Error ? error.message : undefined);
    },
  });
  const saveWorkerSetupMutation = useMutation({
    mutationFn: async () => {
      if (!workerSetupUserId || !workerSetupQuery.data) return;
      await api.patchWorkerSetup(token!, workerSetupUserId, {
        locations: workerSetupQuery.data.locations.map((item) => ({
          location_id: item.location_id,
          priority: Number(workerSetupDraft[item.location_id]?.priority ?? "0"),
          hourly_rate_pln: workerSetupDraft[item.location_id]?.hourly_rate_pln ?? "0",
        })),
      });
      if ((workerSetupQuery.data.role === "STAFF" || workerSetupQuery.data.role === "MANAGER") && workerPositionDraft) {
        await api.patchStaffPosition(token!, workerSetupUserId, workerPositionDraft);
      }
    },
    onSuccess: () => {
      toast.success("Worker setup saved");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["worker-setup", workerSetupUserId] });
    },
    onError: (error) => {
      toast.error("Failed to save worker setup", error instanceof Error ? error.message : undefined);
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const staffPosition = templateInput.required_role === "STAFF" ? templateInput.staff_position.trim() : undefined;
      const payloads = [
        {
          location_id: locationId,
          day_of_week: Number(templateInput.day_of_week),
          template_name: templateInput.template_name.trim(),
          start_time: templateInput.shift_1_start,
          end_time: templateInput.shift_1_end,
          required_role: templateInput.required_role,
          staff_position: staffPosition,
          required_count: Number(templateInput.required_count),
        },
      ];
      if (templateInput.shift_count === "2") {
        payloads.push({
          location_id: locationId,
          day_of_week: Number(templateInput.day_of_week),
          template_name: `${templateInput.template_name.trim()} (2)`,
          start_time: templateInput.shift_2_start,
          end_time: templateInput.shift_2_end,
          required_role: templateInput.required_role,
          staff_position: staffPosition,
          required_count: Number(templateInput.required_count),
        });
      }
      return Promise.all(payloads.map((payload) => api.createTemplate(token!, payload)));
    },
    onSuccess: async (createdTemplates) => {
      toast.success("Template saved", `Saved ${createdTemplates.length} template${createdTemplates.length > 1 ? "s" : ""}.`);
      setTemplateInput((current) => ({ ...current, template_name: "" }));
      if (locationSettingsId) {
        queryClient.setQueryData<ShiftTemplate[]>(["templates", locationSettingsId], (current) => {
          const existing = current ?? [];
          return [...existing, ...createdTemplates];
        });
        await queryClient.invalidateQueries({ queryKey: ["templates", locationSettingsId] });
        await queryClient.refetchQueries({ queryKey: ["templates", locationSettingsId], type: "active" });
      }
    },
    onError: (error) => {
      toast.error("Failed to create template", error instanceof Error ? error.message : undefined);
    },
  });

  const patchTemplateMutation = useMutation({
    mutationFn: ({
      templateId,
      draft,
    }: {
      templateId: string;
      draft: { template_name: string; start_time: string; end_time: string; required_role: Role; staff_position: string; required_count: string };
    }) =>
      api.patchTemplate(token!, templateId, {
        day_of_week: Number(selectedTemplateDay),
        template_name: draft.template_name,
        start_time: draft.start_time,
        end_time: draft.end_time,
        required_role: draft.required_role,
        staff_position: draft.required_role === "STAFF" ? draft.staff_position : null,
        required_count: Number(draft.required_count),
        is_active: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["templates", locationSettingsId] });
      toast.success("Template updated");
    },
    onError: (error) => {
      toast.error("Failed to update template", error instanceof Error ? error.message : undefined);
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId: string) => api.deleteTemplate(token!, templateId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["templates", locationSettingsId] });
      toast.success("Template deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete template", error instanceof Error ? error.message : undefined);
    },
  });

  const pasteTemplatesMutation = useMutation({
    mutationFn: async (locationId: string) => {
      if (!copiedDayTemplates.length) return;
      await Promise.all(
        copiedDayTemplates.map((item) =>
          api.createTemplate(token!, {
            location_id: locationId,
            day_of_week: Number(selectedTemplateDay),
            template_name: item.template_name,
            start_time: item.start_time,
            end_time: item.end_time,
            required_role: item.required_role,
            staff_position: item.required_role === "STAFF" ? item.staff_position : null,
            required_count: item.required_count,
          }),
        ),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["templates", locationSettingsId] });
      toast.success("Templates pasted");
    },
    onError: (error) => {
      toast.error("Failed to paste templates", error instanceof Error ? error.message : undefined);
    },
  });

  const roleTotals = useMemo(() => {
    const totals = { ADMIN: 0, MANAGER: 0, STAFF: 0 };
    for (const user of usersQuery.data ?? []) totals[user.role] += 1;
    return totals;
  }, [usersQuery.data]);
  const availabilitySummaryByUser = useMemo(() => {
    const map: Record<string, { status: "filled" | "partial" | "empty"; desired_hours: number; slots_count: number }> = {};
    for (const item of teamAvailabilitySummaryQuery.data ?? []) {
      map[item.user_id] = {
        status: item.status,
        desired_hours: item.desired_hours,
        slots_count: item.slots_count,
      };
    }
    return map;
  }, [teamAvailabilitySummaryQuery.data]);
  const scheduledHoursByUser = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const shift of weekShiftsQuery.data ?? []) {
      const [startHour, startMinute] = shift.start_time.split(":").map((item) => Number(item));
      const [endHour, endMinute] = shift.end_time.split(":").map((item) => Number(item));
      let duration = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
      if (duration < 0) duration += 24 * 60;
      const hours = duration / 60;
      for (const assignment of shift.assignments) {
        totals[assignment.user_id] = (totals[assignment.user_id] ?? 0) + hours;
      }
    }
    return totals;
  }, [weekShiftsQuery.data]);
  const filteredUsers = useMemo(() => {
    const query = directorySearch.trim().toLowerCase();
    if (!query) return usersQuery.data ?? [];
    return (usersQuery.data ?? []).filter((user) => user.full_name.toLowerCase().includes(query));
  }, [usersQuery.data, directorySearch]);
  const managerCandidates = useMemo(
    () => (usersQuery.data ?? []).filter((user) => user.role === "MANAGER"),
    [usersQuery.data],
  );

  const templatePositionOptions = useMemo(() => {
    const fixedOrder = ["Cook", "Waiter", "Bartender", "Manager"];
    const catalogNames = new Set((positionsQuery.data ?? []).map((position: PositionCatalog) => position.name));
    const resolved = fixedOrder.filter((name) => catalogNames.has(name));
    const fallback = resolved.length ? resolved : fixedOrder;
    return fallback.map((name) => ({ label: name, value: name }));
  }, [positionsQuery.data]);

  const completedTemplateDays = useMemo(() => {
    const completed = new Set<number>();
    for (const item of templatesQuery.data ?? []) {
      const hasName = Boolean(item.template_name?.trim());
      const hasPosition = item.required_role !== "STAFF" || Boolean(item.staff_position?.trim());
      const hasWindow = item.end_time > item.start_time;
      if (hasName && hasPosition && hasWindow) completed.add(item.day_of_week);
    }
    return completed;
  }, [templatesQuery.data]);

  const completedDaysCount = completedTemplateDays.size;
  const templateProgress = Math.round((completedDaysCount / 7) * 100);
  const templateValidationIssues: string[] = [];
  if (templateInput.template_name.trim().length < 2) templateValidationIssues.push("Template name must be at least 2 characters.");
  if (Number(templateInput.required_count) < 1) templateValidationIssues.push("People per shift must be at least 1.");
  if (templateInput.shift_1_end <= templateInput.shift_1_start) templateValidationIssues.push("Shift 1 end must be later than shift 1 start.");
  if (templateInput.required_role === "STAFF" && !templateInput.staff_position.trim()) {
    templateValidationIssues.push("Position is required for staff templates.");
  }
  if (templateInput.shift_count === "2" && templateInput.shift_2_end <= templateInput.shift_2_start) {
    templateValidationIssues.push("Shift 2 end must be later than shift 2 start.");
  }
  const templateInputValid = templateValidationIssues.length === 0;

  return (
    <AppShell
      title="Team"
      subtitle="Directory and location templates with worker setup by priority matrix, rate, and position."
      action={<Badge>{usersQuery.data?.length ?? 0} members</Badge>}
    >
      <div className="stagger-children space-y-5">
        <div className="inline-flex rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1">
          <button
            type="button"
            className={`min-h-11 rounded-[1rem] px-4 text-sm font-semibold transition ${activeTab === "directory" ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--color-text-muted)] hover:bg-white hover:text-[var(--color-heading)]"}`}
            onClick={() => setActiveTab("directory")}
          >
            Team Directory
          </button>
          <button
            type="button"
            className={`min-h-11 rounded-[1rem] px-4 text-sm font-semibold transition ${activeTab === "locations" ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--color-text-muted)] hover:bg-white hover:text-[var(--color-heading)]"}`}
            onClick={() => setActiveTab("locations")}
          >
            Locations & Templates
          </button>
        </div>

        {activeTab === "directory" ? (
          <div className="stagger-grid grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_420px]">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Organization members</CardTitle>
                    <CardDescription>Search people, open setup, and check next week readiness.</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>ADMIN {roleTotals.ADMIN}</Badge>
                    <Badge>Managers {roleTotals.MANAGER}</Badge>
                    <Badge>Staff {roleTotals.STAFF}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[260px] flex-1">
                    <Input
                      placeholder="Search people by name"
                      value={directorySearch}
                      onChange={(event) => setDirectorySearch(event.target.value)}
                    />
                  </div>
                  <Badge>{filteredUsers.length} found</Badge>
                </div>
                <div className="overflow-hidden rounded-[1.25rem] border border-[var(--color-border)] bg-white">
                  {filteredUsers.map((user, index) => {
                    const availabilitySummary = availabilitySummaryByUser[user.id] ?? {
                      status: "empty" as const,
                      desired_hours: 0,
                      slots_count: 0,
                    };
                    const needsPosition = (user.role === "STAFF" || user.role === "MANAGER") && !user.staff_position;
                    const scheduledHours = scheduledHoursByUser[user.id] ?? 0;
                    const isAvailabilityFilled = availabilitySummary.status === "filled";
                    return (
                      <button
                        key={user.id}
                        type="button"
                        disabled={!canEditWorkers}
                        onClick={() => {
                          if (!canEditWorkers) return;
                          setWorkerSetupUserId(user.id);
                        }}
                        className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 text-left transition ${
                          index === filteredUsers.length - 1 ? "" : "border-b border-[var(--color-divider)]"
                        } ${canEditWorkers ? "cursor-pointer hover:bg-emerald-50/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200" : "cursor-default"}`}
                      >
                        <WorkerAvatar name={user.full_name} size={44} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-base font-semibold text-[var(--color-heading)]">{user.full_name}</p>
                            {user.staff_position ? (
                              <Badge className={`border ${positionTone(user.staff_position)}`}>{user.staff_position}</Badge>
                            ) : null}
                            {needsPosition ? (
                              <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                                <AlertTriangle className="mr-1 size-3.5" />
                                Assign position
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            <span className={isAvailabilityFilled ? "font-medium text-emerald-700" : "font-medium text-rose-600"}>
                              {isAvailabilityFilled ? "Next week schedule is filled" : "Next week schedule is not filled"}
                            </span>
                            <span className="text-[var(--color-text-muted)]">{scheduledHours.toFixed(1)}h / {user.max_hours_per_week}h this week</span>
                            {(me?.role === "ADMIN" || me?.role === "MANAGER") ? (
                              <span className="text-[var(--color-text-muted)]">{Number(user.hourly_rate_pln ?? 0).toFixed(2)} PLN/h</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="hidden text-right md:block">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Setup</p>
                          <p className="mt-1 text-sm text-[var(--color-heading)]">{availabilitySummary.slots_count} slots</p>
                        </div>
                      </button>
                    );
                  })}
                  {!filteredUsers.length ? (
                    <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No members match this search.</div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Member access</CardTitle>
                  <CardDescription>Link existing worker accounts and keep setup in the profile popup.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {canEditWorkers ? (
                  <div className="rounded-[1.25rem] border border-emerald-100 bg-emerald-50/65 px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="grid size-11 place-items-center rounded-[1rem] bg-emerald-700 text-white">
                        <MailPlus className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[var(--color-heading)]">Add worker by email</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">Use the email the worker used to create their account.</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <Input placeholder="worker@restaurant.com" type="email" value={linkEmail} onChange={(event) => setLinkEmail(event.target.value)} />
                        <Button className="bg-emerald-700 text-white hover:bg-emerald-800" onClick={() => linkByEmailMutation.mutate()} disabled={!linkEmail || linkByEmailMutation.isPending}>
                          <MailPlus className="size-4" /> Add by email
                        </Button>
                      </div>
                  </div>
                ) : null}
                {[
                  { icon: ShieldCheck, title: "Permissions", body: "Access level is managed after joining, not during invite." },
                  { icon: Building2, title: "Location priority", body: "Priority 0 means unavailable; 5 means preferred for that location." },
                  { icon: Coins, title: "Rates", body: "Hourly rate is configured per location and feeds labor cost." },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3 rounded-[1.15rem] border border-[var(--color-border)] bg-white px-4 py-3">
                    <div className="grid size-10 place-items-center rounded-[0.9rem] bg-slate-100 text-emerald-700">
                      <item.icon className="size-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--color-heading)]">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{item.body}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="stagger-grid grid gap-5">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Locations</CardTitle>
                    <CardDescription>Open a venue to edit managers, templates, and operating setup.</CardDescription>
                  </div>
                  {canEditWorkers ? (
                    <Button
                      variant="secondary"
                      className="size-11 rounded-full border-emerald-200 bg-emerald-50 p-0 text-emerald-800 hover:bg-emerald-100"
                      onClick={() => setCreateLocationOpen(true)}
                      aria-label="Create location"
                    >
                      <Plus className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                {(locationsQuery.data ?? []).map((location) => {
                  const managers = location.manager_names?.length ? location.manager_names.join(", ") : "No manager assigned";
                  return (
                    <div
                      key={location.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setLocationSettingsId(location.id);
                        setSelectedLocationId(location.id);
                        setDeletePopupOpen(false);
                        setDeleteText("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setLocationSettingsId(location.id);
                          setSelectedLocationId(location.id);
                          setDeletePopupOpen(false);
                          setDeleteText("");
                        }
                      }}
                      className="cursor-pointer rounded-[1.25rem] border border-[var(--color-border)] bg-white px-4 py-4 transition hover:border-emerald-200 hover:bg-emerald-50/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="grid size-10 place-items-center rounded-[0.95rem] bg-emerald-50 text-emerald-700">
                              <MapPin className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-[var(--color-heading)]">{location.name}</p>
                              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{location.timezone}</p>
                            </div>
                          </div>
                        </div>
                        <div className="max-w-[45%] text-right">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Managers</p>
                          <p className="mt-1 text-sm font-medium text-[var(--color-heading)]">{managers}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {createLocationOpen ? (
        <div className="mobile-sheet-backdrop lg:grid lg:place-items-center lg:p-4">
          <div className="mobile-sheet-panel lg:surface-elevated lg:w-full lg:max-w-md lg:rounded-[1.4rem]">
            <div className="flex items-center justify-between border-b border-[var(--color-divider)] px-4 py-4 lg:px-5">
              <div>
                <p className="text-base font-semibold text-[var(--color-heading)]">Create location</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Add a venue to manage templates and managers.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setCreateLocationOpen(false)}>
                Cancel
              </Button>
            </div>
            <div className="mobile-sheet-scroll px-4 py-4 lg:px-5">
              <div className="grid gap-3">
              <Input
                placeholder="Location name"
                value={newLocation.name}
                onChange={(event) => setNewLocation((current) => ({ ...current, name: event.target.value }))}
              />
              <Input
                placeholder="Timezone (e.g. Europe/Warsaw)"
                value={newLocation.timezone}
                onChange={(event) => setNewLocation((current) => ({ ...current, timezone: event.target.value }))}
              />
            </div>
            </div>
            <div className="border-t border-[var(--color-divider)] px-4 py-4 lg:px-5">
              <Button
                className="w-full bg-emerald-700 text-white hover:bg-emerald-800"
                onClick={() => createLocationMutation.mutate()}
                disabled={!newLocation.name || !newLocation.timezone || createLocationMutation.isPending}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {workerSetupUserId ? (
        <div className="mobile-sheet-backdrop lg:grid lg:place-items-center lg:p-4">
          <div className="mobile-sheet-panel lg:surface-elevated lg:w-full lg:max-w-4xl lg:rounded-[1.6rem] lg:p-5">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-4 lg:mb-4 lg:border-b-0 lg:px-0 lg:py-0">
              <div className="flex items-center gap-3">
                {workerSetupQuery.data ? <WorkerAvatar name={workerSetupQuery.data.full_name} size={40} /> : null}
                <div>
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--color-heading)] lg:text-2xl">Worker setup</h3>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Priority matrix by location. Priority 0 means not assigned to this location.
                  </p>
                  {workerSetupQuery.data ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">{workerSetupQuery.data.full_name}</p> : null}
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setWorkerSetupUserId(null);
                }}
              >
                Close
              </Button>
            </div>

            {workerSetupQuery.isLoading ? (
              <div className="mobile-sheet-scroll px-4 py-10 text-center text-sm text-[var(--color-text-muted)] lg:px-0">Loading worker setup...</div>
            ) : workerSetupQuery.isError ? (
              <div className="mobile-sheet-scroll px-4 py-8 text-center lg:px-0">
                <p className="text-sm text-[var(--color-danger)]">Failed to load worker setup.</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{(workerSetupQuery.error as Error | undefined)?.message ?? "Unknown error"}</p>
              </div>
            ) : workerSetupQuery.data ? (
              <div className="mobile-sheet-scroll px-4 py-4 lg:px-0">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[240px_1fr]">
                  <div>
                    <p className="mb-1 text-xs text-[var(--color-text-muted)]">Worker</p>
                    <div className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-heading)]">{workerSetupQuery.data.full_name}</div>
                  </div>
                  {workerSetupQuery.data.role === "STAFF" ? (
                    <div>
                      <p className="mb-1 text-xs text-[var(--color-text-muted)]">Position</p>
                      <Select
                        options={templatePositionOptions}
                        value={workerPositionDraft}
                        onChange={(event) => setWorkerPositionDraft(event.target.value)}
                      />
                    </div>
                  ) : workerSetupQuery.data.role === "MANAGER" ? (
                    <div>
                      <p className="mb-1 text-xs text-[var(--color-text-muted)]">Position</p>
                      <Select
                        options={templatePositionOptions}
                        value={workerPositionDraft}
                        onChange={(event) => setWorkerPositionDraft(event.target.value)}
                      />
                    </div>
                  ) : (
                    <div>
                      <p className="mb-1 text-xs text-[var(--color-text-muted)]">Position</p>
                      <div className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text-muted)]">
                        Not used for ADMIN
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-[1rem] border border-[var(--color-border)] bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Availability (Next week)</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">Week of {nextWeekStart}</p>
                  {workerAvailabilityQuery.isLoading ? (
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">Loading availability...</p>
                  ) : workerAvailabilityQuery.isError ? (
                    <p className="mt-2 text-sm text-[var(--color-danger)]">Failed to load weekly availability.</p>
                  ) : workerAvailabilityQuery.data ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-[var(--color-heading)]">Desired hours: {workerAvailabilityQuery.data.desired_hours}h</p>
                      {workerAvailabilityQuery.data.slots.length ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          {[...workerAvailabilityQuery.data.slots]
                            .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
                            .map((slot, index) => (
                              <div key={`${slot.day_of_week}-${slot.start_time}-${index}`} className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs text-[var(--color-text)]">
                                <span className="font-medium">{templateDayShort[slot.day_of_week]}</span> {formatTime(slot.start_time)}-{formatTime(slot.end_time)}
                              </div>
                            ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--color-text-muted)]">No availability submitted for next week.</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">No availability submitted for next week.</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setWorkerSetupDraft((current) => {
                        const next = { ...current };
                        for (const row of workerSetupQuery.data.locations) {
                          next[row.location_id] = {
                            priority: "0",
                            hourly_rate_pln: current[row.location_id]?.hourly_rate_pln ?? row.hourly_rate_pln,
                          };
                        }
                        return next;
                      })
                    }
                  >
                    All 0
                  </Button>
                </div>

                <div className="space-y-2">
                  {workerSetupQuery.data.locations.map((row) => {
                    const draft = workerSetupDraft[row.location_id] ?? {
                      priority: String(row.priority),
                      hourly_rate_pln: row.hourly_rate_pln,
                    };
                    return (
                      <div key={row.location_id} className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-white px-3 py-3 md:grid-cols-[minmax(0,1fr)_180px_220px_auto] md:items-end">
                        <div className="grid gap-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Location</span>
                          <div className="truncate text-sm font-medium text-[var(--color-heading)]">{row.location_name}</div>
                        </div>
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Priority</span>
                          <Select
                            value={draft.priority}
                            onChange={(event) =>
                              setWorkerSetupDraft((current) => ({
                                ...current,
                                [row.location_id]: { ...draft, priority: event.target.value },
                              }))
                            }
                            options={[
                              { label: "0 - Not assigned", value: "0" },
                              { label: "1", value: "1" },
                              { label: "2", value: "2" },
                              { label: "3", value: "3" },
                              { label: "4", value: "4" },
                              { label: "5 - Preferred", value: "5" },
                            ]}
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Hourly rate (PLN/h)</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={draft.hourly_rate_pln}
                            onChange={(event) =>
                              setWorkerSetupDraft((current) => ({
                                ...current,
                                [row.location_id]: { ...draft, hourly_rate_pln: event.target.value },
                              }))
                            }
                          />
                        </label>
                        <Button
                          variant="secondary"
                          className="md:self-end"
                          onClick={() =>
                            setWorkerSetupDraft((current) => ({
                              ...current,
                              [row.location_id]: {
                                priority: "5",
                                hourly_rate_pln: current[row.location_id]?.hourly_rate_pln ?? row.hourly_rate_pln,
                              },
                            }))
                          }
                        >
                          Set 5
                        </Button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setWorkerSetupUserId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-emerald-700 text-white hover:bg-emerald-800"
                    onClick={() => saveWorkerSetupMutation.mutate()}
                    disabled={saveWorkerSetupMutation.isPending}
                  >
                    Save worker setup
                  </Button>
                </div>
              </div>
              </div>
            ) : (
              <div className="mobile-sheet-scroll px-4 py-8 text-center text-sm text-[var(--color-text-muted)] lg:px-0">No worker setup data returned.</div>
            )}
          </div>
        </div>
      ) : null}

      {locationSettingsId ? (
        <div className="mobile-sheet-backdrop lg:grid lg:place-items-center lg:p-4">
          <div className="mobile-sheet-panel lg:max-h-[92vh] lg:w-full lg:max-w-[1400px] lg:overflow-y-auto lg:rounded-[1.6rem] lg:bg-white lg:shadow-[0_28px_90px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-4 lg:mb-4 lg:px-5">
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--color-heading)] lg:text-2xl">Location settings</h3>
              <Button
                variant="secondary"
                onClick={() => {
                  setLocationSettingsId(null);
                  setDeletePopupOpen(false);
                  setDeleteText("");
                }}
              >
                Close
              </Button>
            </div>

            {(() => {
              const location = (locationsQuery.data ?? []).find((item) => item.id === locationSettingsId);
              if (!location) return <div className="px-4 py-6 text-sm text-[var(--color-text-muted)] lg:px-5">Location not found.</div>;
              const draft = locationDrafts[location.id] ?? { name: location.name, timezone: location.timezone, manager_user_ids: location.manager_user_ids ?? [] };
              return (
                <div className="mobile-sheet-scroll px-4 py-4 lg:px-5">
                <div className="space-y-4">
                  <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-4 py-4">
                    <p className="text-sm font-semibold text-[var(--color-heading)]">Template builder</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">Create named templates with position and unified shift windows.</p>

                    <div className="mt-3">
                      <div className="h-1.5 rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[#68f05d]" style={{ width: `${templateProgress}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-[var(--color-text-muted)]">{completedDaysCount}/7 days completed</p>
                      <div className="mt-2 flex gap-1 overflow-x-auto pb-1 lg:grid lg:min-w-0 lg:grid-cols-7">
                        {templateDayShort.map((label, index) => {
                          const dayValue = String(index);
                          const count = (templatesQuery.data ?? []).filter((item) => item.day_of_week === index).length;
                          const completed = completedTemplateDays.has(index);
                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() => setSelectedTemplateDay(dayValue)}
                              className={`min-w-[68px] rounded-lg border px-2 py-2 text-xs transition ${
                                selectedTemplateDay === dayValue
                                  ? "border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]"
                                  : "border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                              }`}
                            >
                              <div className="font-medium">{label}</div>
                              <div className={`text-[10px] opacity-80 ${completed ? "text-emerald-700" : ""}`}>{completed ? "ready" : count}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Template name</p>
                        <Input
                          placeholder="e.g. Weekday lunch coverage"
                          value={templateInput.template_name}
                          onChange={(event) => setTemplateInput((current) => ({ ...current, template_name: event.target.value }))}
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Shift role</p>
                        <Select
                          options={templateRoleOptions}
                          value={templateInput.required_role}
                          onChange={(event) =>
                            setTemplateInput((current) => ({
                              ...current,
                              required_role: event.target.value as Role,
                              staff_position: event.target.value === "STAFF" ? current.staff_position : "",
                            }))
                          }
                        />
                      </div>
                      {templateInput.required_role === "STAFF" ? (
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Position</p>
                          <Select
                            options={templatePositionOptions}
                            value={templateInput.staff_position}
                            onChange={(event) => setTemplateInput((current) => ({ ...current, staff_position: event.target.value }))}
                          />
                        </div>
                      ) : null}
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">How many shifts in this day</p>
                        <Select
                          options={[
                            { label: "1 shift", value: "1" },
                            { label: "2 shifts", value: "2" },
                          ]}
                          value={templateInput.shift_count}
                          onChange={(event) => setTemplateInput((current) => ({ ...current, shift_count: event.target.value }))}
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">People per shift</p>
                        <Input
                          type="number"
                          min={1}
                          max={25}
                          value={templateInput.required_count}
                          onChange={(event) => setTemplateInput((current) => ({ ...current, required_count: event.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="mt-3 rounded-[1rem] border border-[var(--color-border)] bg-white p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600">Shift windows</p>
                      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Shift 1 start</p>
                          <Input
                            type="time"
                            value={templateInput.shift_1_start.slice(0, 5)}
                            onChange={(event) => setTemplateInput((current) => ({ ...current, shift_1_start: `${event.target.value}:00` }))}
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Shift 1 end</p>
                          <Input
                            type="time"
                            value={templateInput.shift_1_end.slice(0, 5)}
                            onChange={(event) => setTemplateInput((current) => ({ ...current, shift_1_end: `${event.target.value}:00` }))}
                          />
                        </div>
                      </div>
                      {templateInput.shift_count === "2" ? (
                        <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Shift 2 start</p>
                            <Input
                              type="time"
                              value={templateInput.shift_2_start.slice(0, 5)}
                              onChange={(event) => setTemplateInput((current) => ({ ...current, shift_2_start: `${event.target.value}:00` }))}
                            />
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Shift 2 end</p>
                            <Input
                              type="time"
                              value={templateInput.shift_2_end.slice(0, 5)}
                              onChange={(event) => setTemplateInput((current) => ({ ...current, shift_2_end: `${event.target.value}:00` }))}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                      <div className={`text-xs ${templateInputValid ? "text-emerald-700" : "text-[var(--color-danger)]"}`}>
                        {templateInputValid ? (
                          <p>Template is valid and ready to save.</p>
                        ) : (
                          <p>{templateValidationIssues[0]}</p>
                        )}
                      </div>
                      <Button
                        className="w-full bg-[#68f05d] text-[#0c130f] hover:bg-[#82f57a] sm:w-auto"
                        onClick={() => {
                          createTemplateMutation.mutate(location.id);
                        }}
                        disabled={createTemplateMutation.isPending || !templateInputValid}
                      >
                        <CalendarDays className="size-4" /> Create template
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                      <Button
                        variant="secondary"
                        className="border-[var(--color-border)] bg-white text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)]"
                        onClick={() => {
                          const dayTemplates = (templatesQuery.data ?? [])
                            .filter((item) => item.day_of_week === Number(selectedTemplateDay))
                            .map((item) => ({
                              template_name: item.template_name || "Default template",
                              start_time: item.start_time,
                              end_time: item.end_time,
                              required_role: item.required_role,
                              staff_position: item.staff_position || "Cook",
                              required_count: item.required_count,
                            }));
                          setCopiedDayTemplates(dayTemplates);
                        }}
                      >
                        Copy day templates
                      </Button>
                      <Button
                        variant="secondary"
                        className="border-[var(--color-border)] bg-white text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)]"
                        onClick={() => pasteTemplatesMutation.mutate(location.id)}
                        disabled={!copiedDayTemplates.length || pasteTemplatesMutation.isPending}
                      >
                        Paste to selected day
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-white px-4 py-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--color-heading)]">
                        Saved templates for {templateDayOptions.find((item) => item.value === selectedTemplateDay)?.label}
                      </p>
                      <Badge className="border-slate-200 bg-slate-100 text-slate-700">
                        {(templatesQuery.data ?? []).filter((item) => item.day_of_week === Number(selectedTemplateDay)).length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {(templatesQuery.data ?? []).filter((item) => item.day_of_week === Number(selectedTemplateDay)).length ? (
                        <div className="hidden gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid md:grid-cols-6">
                          <span>Name</span>
                          <span>Start</span>
                          <span>End</span>
                          <span>Role</span>
                          <span>Position</span>
                          <span>Count</span>
                        </div>
                      ) : null}
                      {(templatesQuery.data ?? [])
                        .filter((item) => item.day_of_week === Number(selectedTemplateDay))
                        .map((template) => {
                          const draft = templateDrafts[template.id] ?? {
                            template_name: template.template_name || "Default template",
                            start_time: template.start_time,
                            end_time: template.end_time,
                            required_role: template.required_role,
                            staff_position: template.staff_position || "Cook",
                            required_count: String(template.required_count),
                          };
                          return (
                            <div key={template.id} className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-3">
                              <div className="grid gap-2 md:grid-cols-6">
                                <Input
                                  value={draft.template_name}
                                  onChange={(event) =>
                                    setTemplateDrafts((current) => ({
                                      ...current,
                                      [template.id]: { ...draft, template_name: event.target.value },
                                    }))
                                  }
                                />
                                <Input
                                  type="time"
                                  value={draft.start_time.slice(0, 5)}
                                  onChange={(event) =>
                                    setTemplateDrafts((current) => ({
                                      ...current,
                                      [template.id]: { ...draft, start_time: `${event.target.value}:00` },
                                    }))
                                  }
                                />
                                <Input
                                  type="time"
                                  value={draft.end_time.slice(0, 5)}
                                  onChange={(event) =>
                                    setTemplateDrafts((current) => ({
                                      ...current,
                                      [template.id]: { ...draft, end_time: `${event.target.value}:00` },
                                    }))
                                  }
                                />
                                <Select
                                  options={templateRoleOptions}
                                  value={draft.required_role}
                                  onChange={(event) =>
                                    setTemplateDrafts((current) => ({
                                      ...current,
                                      [template.id]: {
                                        ...draft,
                                        required_role: event.target.value as Role,
                                        staff_position: event.target.value === "STAFF" ? draft.staff_position : "",
                                      },
                                    }))
                                  }
                                />
                                <Select
                                  options={templatePositionOptions}
                                  value={draft.staff_position}
                                  disabled={draft.required_role !== "STAFF"}
                                  onChange={(event) =>
                                    setTemplateDrafts((current) => ({
                                      ...current,
                                      [template.id]: { ...draft, staff_position: event.target.value },
                                    }))
                                  }
                                />
                                <Input
                                  type="number"
                                  min={1}
                                  max={25}
                                  value={draft.required_count}
                                  onChange={(event) =>
                                    setTemplateDrafts((current) => ({
                                      ...current,
                                      [template.id]: { ...draft, required_count: event.target.value },
                                    }))
                                  }
                                />
                              </div>
                              <div className="mt-2 flex justify-end gap-2">
                                <Button
                                  variant="secondary"
                                  className="border-[var(--color-border)] bg-white text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)]"
                                  onClick={() => patchTemplateMutation.mutate({ templateId: template.id, draft })}
                                  disabled={patchTemplateMutation.isPending}
                                >
                                  Save
                                </Button>
                                <Button
                                  variant="secondary"
                                  className="border-[#ff6b6b]/28 bg-[#ff6b6b]/10 text-[#ff6b6b] hover:bg-[#ff6b6b]/16"
                                  onClick={() => deleteTemplateMutation.mutate(template.id)}
                                  disabled={deleteTemplateMutation.isPending}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      {!((templatesQuery.data ?? []).filter((item) => item.day_of_week === Number(selectedTemplateDay)).length) ? (
                        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-4 text-sm text-[var(--color-text-muted)]">
                          No templates saved for this day.
                        </div>
                      ) : null}
                    </div>
                  </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                    <Input
                      value={draft.name}
                      disabled={!canEditWorkers}
                      onChange={(event) =>
                        setLocationDrafts((current) => ({
                          ...current,
                          [location.id]: { ...draft, name: event.target.value },
                        }))
                      }
                    />
                    <Input
                      value={draft.timezone}
                      disabled={!canEditWorkers}
                      onChange={(event) =>
                        setLocationDrafts((current) => ({
                          ...current,
                          [location.id]: { ...draft, timezone: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-muted)]">Location managers</p>
                    <div className="flex flex-wrap gap-2">
                      {managerCandidates.length ? (
                        managerCandidates.map((manager) => {
                          const selected = draft.manager_user_ids.includes(manager.id);
                          return (
                            <button
                              key={manager.id}
                              type="button"
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                selected
                                  ? "border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]"
                                  : "border-[var(--color-border)] bg-white text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                              }`}
                              onClick={() =>
                                setLocationDrafts((current) => {
                                  const currentDraft = current[location.id] ?? draft;
                                  const exists = currentDraft.manager_user_ids.includes(manager.id);
                                  return {
                                    ...current,
                                    [location.id]: {
                                      ...currentDraft,
                                      manager_user_ids: exists
                                        ? currentDraft.manager_user_ids.filter((id) => id !== manager.id)
                                        : [...currentDraft.manager_user_ids, manager.id],
                                    },
                                  };
                                })
                              }
                            >
                              {manager.full_name}
                            </button>
                          );
                        })
                      ) : (
                        <p className="text-sm text-[var(--color-text-muted)]">No managers available.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Badge className="border-slate-200 bg-slate-100 text-slate-700">ID {location.id.slice(0, 8)}</Badge>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Button
                        className="bg-[#68f05d] text-[#0c130f] hover:bg-[#82f57a]"
                        onClick={() =>
                          patchLocationMutation.mutate({
                            locationId: location.id,
                            name: draft.name,
                            timezone: draft.timezone,
                            manager_user_ids: draft.manager_user_ids,
                          })
                        }
                        disabled={!draft.name || !draft.timezone || patchLocationMutation.isPending}
                      >
                        Save location
                      </Button>
                      <Button
                        variant="secondary"
                        className="border-[#ff6b6b]/28 bg-[#ff6b6b]/10 text-[#ff6b6b] hover:bg-[#ff6b6b]/16"
                        onClick={() => {
                          setDeletePopupOpen(true);
                          setDeleteText("");
                        }}
                        disabled={deleteLocationMutation.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
                </div>
              );
            })()}
          </div>

          {deletePopupOpen ? (
            <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4">
              <div className="surface-elevated w-full max-w-md rounded-[1.2rem] p-4">
                <p className="text-base font-semibold text-[var(--color-heading)]">Confirm delete location</p>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">Type <span className="font-mono text-[var(--color-heading)]">DELETE</span> to continue.</p>
                <Input className="mt-3" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} />
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDeletePopupOpen(false);
                      setDeleteText("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    className="border-[#ff6b6b]/28 bg-[#ff6b6b]/10 text-[#ff6b6b] hover:bg-[#ff6b6b]/16"
                    disabled={deleteText !== "DELETE" || !locationSettingsId || deleteLocationMutation.isPending}
                    onClick={() => {
                      if (!locationSettingsId) return;
                      deleteLocationMutation.mutate(locationSettingsId);
                    }}
                  >
                    Delete location
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}

