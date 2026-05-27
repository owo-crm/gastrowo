import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CalendarDays, Coins, MailPlus, MapPin, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { WorkerAvatar } from "@/components/worker-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { Select } from "@/components/ui/select";
import { canManageBusinessSettings, canManageTeam } from "@/lib/access";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatTime, getMonday } from "@/lib/date";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { MembershipPermissionOverrides, PositionCatalog, Role, ShiftTemplate } from "@/lib/types";

type WorkerDraft = {
  hourly_rate_pln: string;
  priority: string;
  staff_position: string;
};

type PermissionDraftValue = "inherit" | "allow" | "block";

const emptyMembershipPermissionOverrides: MembershipPermissionOverrides = {
  staff_can_submit_revenue_reports_override: null,
  staff_can_delete_revenue_reports_override: null,
  manager_can_submit_revenue_reports_override: null,
  manager_can_delete_revenue_reports_override: null,
  manager_can_view_full_dashboard_override: null,
  manager_can_view_payroll_override: null,
  manager_can_manage_team_override: null,
  manager_can_manage_business_settings_override: null,
  manager_can_access_notes_override: null,
  manager_can_access_inventory_override: null,
};

const permissionFieldMeta: Record<keyof MembershipPermissionOverrides, { label: string }> = {
  staff_can_submit_revenue_reports_override: {
    label: "Create reports",
  },
  staff_can_delete_revenue_reports_override: {
    label: "Delete reports",
  },
  manager_can_submit_revenue_reports_override: {
    label: "Create reports",
  },
  manager_can_delete_revenue_reports_override: {
    label: "Delete reports",
  },
  manager_can_view_full_dashboard_override: {
    label: "Full dashboard",
  },
  manager_can_view_payroll_override: {
    label: "Payroll",
  },
  manager_can_manage_team_override: {
    label: "Team management",
  },
  manager_can_manage_business_settings_override: {
    label: "Business settings",
  },
  manager_can_access_notes_override: {
    label: "Documents & Contacts",
  },
  manager_can_access_inventory_override: {
    label: "Inventory",
  },
};

const managerPermissionKeys: Array<keyof MembershipPermissionOverrides> = [
  "manager_can_submit_revenue_reports_override",
  "manager_can_delete_revenue_reports_override",
  "manager_can_view_full_dashboard_override",
  "manager_can_view_payroll_override",
  "manager_can_manage_team_override",
  "manager_can_manage_business_settings_override",
  "manager_can_access_notes_override",
  "manager_can_access_inventory_override",
];

const staffPermissionKeys: Array<keyof MembershipPermissionOverrides> = [
  "staff_can_submit_revenue_reports_override",
  "staff_can_delete_revenue_reports_override",
];

function permissionDraftValue(value: boolean | null | undefined): PermissionDraftValue {
  if (value === true) return "allow";
  if (value === false) return "block";
  return "inherit";
}

function permissionDraftPayload(input: Record<keyof MembershipPermissionOverrides, PermissionDraftValue>): MembershipPermissionOverrides {
  const toValue = (value: PermissionDraftValue): boolean | null => {
    if (value === "allow") return true;
    if (value === "block") return false;
    return null;
  };
  return {
    staff_can_submit_revenue_reports_override: toValue(input.staff_can_submit_revenue_reports_override),
    staff_can_delete_revenue_reports_override: toValue(input.staff_can_delete_revenue_reports_override),
    manager_can_submit_revenue_reports_override: toValue(input.manager_can_submit_revenue_reports_override),
    manager_can_delete_revenue_reports_override: toValue(input.manager_can_delete_revenue_reports_override),
    manager_can_view_full_dashboard_override: toValue(input.manager_can_view_full_dashboard_override),
    manager_can_view_payroll_override: toValue(input.manager_can_view_payroll_override),
    manager_can_manage_team_override: toValue(input.manager_can_manage_team_override),
    manager_can_manage_business_settings_override: toValue(input.manager_can_manage_business_settings_override),
    manager_can_access_notes_override: toValue(input.manager_can_access_notes_override),
    manager_can_access_inventory_override: toValue(input.manager_can_access_inventory_override),
  };
}

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
const flatFieldClass =
  "h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-none focus-visible:border-slate-400 focus-visible:ring-0 sm:h-9";
const plainTimeFieldClass = `${flatFieldClass} plain-time-input`;

function permissionOverrideLabel(value: PermissionDraftValue) {
  if (value === "allow") return "Allowed";
  if (value === "block") return "Blocked";
  return "Workspace default";
}

function permissionDraftChecked(value: PermissionDraftValue) {
  return value === "allow";
}

function roleOptionLabel(value: Role) {
  return templateRoleOptions.find((option) => option.value === value)?.label ?? value;
}

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
  const { t } = useLanguage();
  const { token, me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canEditWorkers = canManageTeam(me);
  const canEditBusinessOverrides = canManageBusinessSettings(me);
  const nextWeekStart = useMemo(() => getNextWeekMondayIso(), []);
  const currentWeekStart = useMemo(() => getMonday(), []);

  const [activeTab, setActiveTab] = useState<"directory" | "locations">("directory");
  const [directorySearch, setDirectorySearch] = useState("");
  const [workerSetupUserId, setWorkerSetupUserId] = useState<string | null>(null);
  const [isEditingWorkerSetup, setIsEditingWorkerSetup] = useState(false);
  const [workerSetupDraft, setWorkerSetupDraft] = useState<Record<string, { priority: string; hourly_rate_pln: string }>>({});
  const [workerPositionDraft, setWorkerPositionDraft] = useState("");
  const [workerPermissionDraft, setWorkerPermissionDraft] = useState<Record<keyof MembershipPermissionOverrides, PermissionDraftValue>>({
    staff_can_submit_revenue_reports_override: "inherit",
    staff_can_delete_revenue_reports_override: "inherit",
    manager_can_submit_revenue_reports_override: "inherit",
    manager_can_delete_revenue_reports_override: "inherit",
    manager_can_view_full_dashboard_override: "inherit",
    manager_can_view_payroll_override: "inherit",
    manager_can_manage_team_override: "inherit",
    manager_can_manage_business_settings_override: "inherit",
    manager_can_access_notes_override: "inherit",
    manager_can_access_inventory_override: "inherit",
  });
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, WorkerDraft>>({});
  const [locationDrafts, setLocationDrafts] = useState<Record<string, { name: string; timezone: string; manager_user_ids: string[] }>>({});
  const [newLocation, setNewLocation] = useState({ name: "", timezone: "Europe/Warsaw" });
  const [createLocationOpen, setCreateLocationOpen] = useState(false);
  const [locationSettingsId, setLocationSettingsId] = useState<string | null>(null);
  const [isEditingLocationDetails, setIsEditingLocationDetails] = useState(false);
  const [deletePopupOpen, setDeletePopupOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [linkEmail, setLinkEmail] = useState("");
  const [memberRemovalOpen, setMemberRemovalOpen] = useState(false);
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
  const [showTemplateComposer, setShowTemplateComposer] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
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
  const memberRemovalImpactQuery = useQuery({
    queryKey: ["member-removal-impact", workerSetupUserId],
    queryFn: () => api.getMemberRemovalImpact(token!, workerSetupUserId!),
    enabled: Boolean(token) && Boolean(workerSetupUserId) && memberRemovalOpen,
    retry: false,
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
    const permissionOverrides = data.permission_overrides ?? emptyMembershipPermissionOverrides;
    const next: Record<string, { priority: string; hourly_rate_pln: string }> = {};
    for (const item of data.locations) {
      next[item.location_id] = {
        priority: String(item.priority),
        hourly_rate_pln: item.hourly_rate_pln,
      };
    }
    setWorkerSetupDraft(next);
    setWorkerPositionDraft(data.staff_position || "");
    setWorkerPermissionDraft({
      staff_can_submit_revenue_reports_override: permissionDraftValue(permissionOverrides.staff_can_submit_revenue_reports_override),
      staff_can_delete_revenue_reports_override: permissionDraftValue(permissionOverrides.staff_can_delete_revenue_reports_override),
      manager_can_submit_revenue_reports_override: permissionDraftValue(permissionOverrides.manager_can_submit_revenue_reports_override),
      manager_can_delete_revenue_reports_override: permissionDraftValue(permissionOverrides.manager_can_delete_revenue_reports_override),
      manager_can_view_full_dashboard_override: permissionDraftValue(permissionOverrides.manager_can_view_full_dashboard_override),
      manager_can_view_payroll_override: permissionDraftValue(permissionOverrides.manager_can_view_payroll_override),
      manager_can_manage_team_override: permissionDraftValue(permissionOverrides.manager_can_manage_team_override),
      manager_can_manage_business_settings_override: permissionDraftValue(permissionOverrides.manager_can_manage_business_settings_override),
      manager_can_access_notes_override: permissionDraftValue(permissionOverrides.manager_can_access_notes_override),
      manager_can_access_inventory_override: permissionDraftValue(permissionOverrides.manager_can_access_inventory_override),
    });
  }, [workerSetupQuery.data]);

  useEffect(() => {
    if (!workerSetupUserId) {
      setIsEditingWorkerSetup(false);
      setMemberRemovalOpen(false);
    }
  }, [workerSetupUserId]);

  useEffect(() => {
    if (!locationSettingsId) {
      setIsEditingLocationDetails(false);
      setShowTemplateComposer(false);
      setEditingTemplateId(null);
    }
  }, [locationSettingsId]);

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
      setIsEditingLocationDetails(false);
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
        permission_overrides: canEditBusinessOverrides ? permissionDraftPayload(workerPermissionDraft) : undefined,
      });
      if ((workerSetupQuery.data.role === "STAFF" || workerSetupQuery.data.role === "MANAGER") && workerPositionDraft) {
        await api.patchStaffPosition(token!, workerSetupUserId, workerPositionDraft);
      }
    },
    onSuccess: () => {
      setIsEditingWorkerSetup(false);
      toast.success(t("team.worker_setup_saved"));
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["worker-setup", workerSetupUserId] });
    },
    onError: (error) => {
      toast.error(t("team.worker_setup_save_failed"), error instanceof Error ? error.message : undefined);
    },
  });
  const removeMemberMutation = useMutation({
    mutationFn: () => api.removeMember(token!, workerSetupUserId!),
    onSuccess: (data) => {
      toast.success("Member removed", `${data.full_name} lost workspace access.`);
      setMemberRemovalOpen(false);
      setWorkerSetupUserId(null);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["worker-setup"] });
      void queryClient.invalidateQueries({ queryKey: ["location-members"] });
      void queryClient.invalidateQueries({ queryKey: ["subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error("Failed to remove member", error instanceof Error ? error.message : undefined);
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
      setShowTemplateComposer(false);
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
      setEditingTemplateId(null);
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
      title={t("team.title")}
      subtitle={t("team.subtitle")}
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
        <OverlayPortal>
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
        </OverlayPortal>
      ) : null}

      {workerSetupUserId ? (
        <OverlayPortal>
        <div className="mobile-sheet-backdrop lg:grid lg:place-items-center lg:p-4">
          <div className="mobile-sheet-panel lg:max-h-[92vh] lg:w-full lg:max-w-4xl lg:overflow-hidden lg:rounded-[1.6rem] lg:border lg:border-[var(--color-divider)] lg:bg-white lg:p-4 lg:shadow-none">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-3 lg:mb-3 lg:border-b-0 lg:px-0 lg:py-0">
              <div className="flex items-center gap-3">
                {workerSetupQuery.data ? <WorkerAvatar name={workerSetupQuery.data.full_name} size={36} /> : null}
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-[-0.03em] text-[var(--color-heading)] lg:text-2xl">{t("team.worker_setup_title")}</h3>
                  <p className="text-xs text-[var(--color-text-muted)] lg:text-sm">
                    {t("team.worker_setup_subtitle")}
                  </p>
                  {workerSetupQuery.data ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">{workerSetupQuery.data.full_name}</p> : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(canEditWorkers || canEditBusinessOverrides) && workerSetupQuery.data ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-9 rounded-full border border-slate-200 bg-white px-3 text-sky-700 shadow-none hover:bg-sky-50 hover:text-sky-800"
                    onClick={() => {
                      setIsEditingWorkerSetup((current) => !current);
                    }}
                  >
                    <Pencil className="size-4" />
                    {isEditingWorkerSetup ? t("common.cancel") : t("common.edit")}
                  </Button>
                ) : null}
                {canEditWorkers && workerSetupQuery.data ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-9 rounded-full border border-rose-200 bg-white px-3 text-rose-700 shadow-none hover:bg-rose-50 hover:text-rose-800"
                    onClick={() => setMemberRemovalOpen((current) => !current)}
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-9 rounded-full border border-slate-200 bg-white px-3 text-[var(--color-heading)] shadow-none hover:bg-slate-50"
                  onClick={() => {
                    setWorkerSetupUserId(null);
                  }}
                >
                  {t("common.close")}
                </Button>
              </div>
            </div>

            {workerSetupQuery.isLoading ? (
              <div className="mobile-sheet-scroll px-4 py-10 text-center text-sm text-[var(--color-text-muted)] lg:px-0">{t("team.worker_setup_loading")}</div>
            ) : workerSetupQuery.isError ? (
              <div className="mobile-sheet-scroll px-4 py-8 text-center lg:px-0">
                <p className="text-sm text-[var(--color-danger)]">{t("team.worker_setup_failed")}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{(workerSetupQuery.error as Error | undefined)?.message ?? "Unknown error"}</p>
              </div>
            ) : workerSetupQuery.data ? (
              <div className="mobile-sheet-scroll px-4 py-4 lg:px-0">
                <div className="space-y-3">
                {memberRemovalOpen ? (
                  <div className="rounded-[1.1rem] border border-rose-200 bg-rose-50/70 p-4">
                    {memberRemovalImpactQuery.isLoading ? (
                      <p className="text-sm text-rose-700">Checking impact...</p>
                    ) : memberRemovalImpactQuery.data ? (
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-heading)]">Remove from workspace</p>
                          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                            Future shifts: {memberRemovalImpactQuery.data.future_assignments_count}, pending requests:{" "}
                            {memberRemovalImpactQuery.data.pending_shift_requests_count}, assigned locations: {memberRemovalImpactQuery.data.location_count}.
                          </p>
                          {memberRemovalImpactQuery.data.blocking_reason ? (
                            <p className="mt-2 text-sm font-medium text-rose-700">{memberRemovalImpactQuery.data.blocking_reason}</p>
                          ) : (
                            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                              Historical records stay intact. Future assignments and pending requests will be cleared automatically.
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={!memberRemovalImpactQuery.data.can_remove || removeMemberMutation.isPending}
                            onClick={() => removeMemberMutation.mutate()}
                          >
                            <Trash2 className="size-4" />
                            Confirm removal
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setMemberRemovalOpen(false)}>
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-rose-700">{(memberRemovalImpactQuery.error as Error | undefined)?.message ?? "Failed to load impact."}</p>
                    )}
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{t("team.worker_label")}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-[var(--color-heading)]">{workerSetupQuery.data.full_name}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{t("team.position_label")}</p>
                    {workerSetupQuery.data.role === "STAFF" || workerSetupQuery.data.role === "MANAGER" ? (
                      isEditingWorkerSetup ? (
                        <Select
                          className={flatFieldClass}
                          options={templatePositionOptions}
                          value={workerPositionDraft}
                          onChange={(event) => setWorkerPositionDraft(event.target.value)}
                        />
                      ) : (
                        <p className="text-sm font-medium text-[var(--color-heading)]">{workerPositionDraft || t("team.position_not_used")}</p>
                      )
                    ) : (
                      <p className="text-[13px] text-[var(--color-text-muted)]">{t("team.position_not_used")}</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-[var(--color-divider)] pt-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{t("team.availability_next_week")}</p>
                      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Week of {nextWeekStart}</p>
                    </div>
                    {workerAvailabilityQuery.data ? (
                      <p className="text-xs font-semibold text-[var(--color-heading)]">{workerAvailabilityQuery.data.desired_hours}h</p>
                    ) : null}
                  </div>
                  {workerAvailabilityQuery.isLoading ? (
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">{t("team.availability_loading")}</p>
                  ) : workerAvailabilityQuery.isError ? (
                    <p className="mt-2 text-xs text-[var(--color-danger)]">{t("team.availability_failed")}</p>
                  ) : workerAvailabilityQuery.data?.slots.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[...workerAvailabilityQuery.data.slots]
                        .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
                        .map((slot, index) => (
                          <span
                            key={`${slot.day_of_week}-${slot.start_time}-${index}`}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-[var(--color-text)]"
                          >
                            <span className="font-semibold">{templateDayShort[slot.day_of_week]}</span>
                            <span>{formatTime(slot.start_time)}-{formatTime(slot.end_time)}</span>
                          </span>
                        ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">{t("team.availability_empty")}</p>
                  )}
                </div>

                {canEditBusinessOverrides && (workerSetupQuery.data.role === "STAFF" || workerSetupQuery.data.role === "MANAGER") ? (
                  <div className="border-t border-[var(--color-divider)] pt-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{t("team.permission_overrides_title")}</p>
                    </div>
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      {(workerSetupQuery.data.role === "STAFF" ? staffPermissionKeys : managerPermissionKeys).map((key) => (
                        <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-white/80 bg-white px-3 py-2 shadow-none">
                          <p className="text-[13px] font-semibold text-[var(--color-heading)]">{permissionFieldMeta[key].label}</p>
                          {isEditingWorkerSetup ? (
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={permissionDraftChecked(workerPermissionDraft[key])}
                              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
                                permissionDraftChecked(workerPermissionDraft[key])
                                  ? "border-sky-500 bg-sky-500"
                                  : "border-slate-300 bg-slate-200"
                              }`}
                              onClick={() =>
                                setWorkerPermissionDraft((current) => ({
                                  ...current,
                                  [key]: permissionDraftChecked(current[key]) ? "block" : "allow",
                                }))
                              }
                            >
                              <span
                                className={`absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white transition ${
                                  permissionDraftChecked(workerPermissionDraft[key]) ? "translate-x-5" : "translate-x-0"
                                }`}
                              />
                            </button>
                          ) : (
                            <p className={`text-xs font-semibold ${permissionDraftChecked(workerPermissionDraft[key]) ? "text-emerald-700" : "text-slate-500"}`}>
                              {permissionOverrideLabel(workerPermissionDraft[key])}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-0">
                  {workerSetupQuery.data.locations.map((row) => {
                    const draft = workerSetupDraft[row.location_id] ?? {
                      priority: String(row.priority),
                      hourly_rate_pln: row.hourly_rate_pln,
                    };
                    return (
                      <div key={row.location_id} className="grid gap-3 border-t border-[var(--color-divider)] py-3 md:grid-cols-[minmax(0,1fr)_140px_160px] md:items-end">
                        <div className="min-w-0">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{t("team.location_label")}</span>
                          <div className="truncate text-sm font-semibold text-[var(--color-heading)]">{row.location_name}</div>
                        </div>
                        {isEditingWorkerSetup ? (
                          <>
                            <label className="grid gap-1">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{t("team.priority_label")}</span>
                              <Select
                                className={flatFieldClass}
                                value={draft.priority}
                                onChange={(event) =>
                                  setWorkerSetupDraft((current) => ({
                                    ...current,
                                    [row.location_id]: { ...draft, priority: event.target.value },
                                  }))
                                }
                                options={[
                                  { label: t("team.priority_zero"), value: "0" },
                                  { label: "1", value: "1" },
                                  { label: "2", value: "2" },
                                  { label: "3", value: "3" },
                                  { label: "4", value: "4" },
                                  { label: t("team.priority_five"), value: "5" },
                                ]}
                              />
                            </label>
                            <label className="grid gap-1">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{t("team.hourly_rate_label")}</span>
                              <Input
                                className={flatFieldClass}
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
                          </>
                        ) : (
                          <>
                            <div className="grid gap-1">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{t("team.priority_label")}</span>
                              <p className="text-sm font-medium text-[var(--color-heading)]">{draft.priority}</p>
                            </div>
                            <div className="grid gap-1">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{t("team.hourly_rate_label")}</span>
                              <p className="text-sm font-medium text-[var(--color-heading)]">{draft.hourly_rate_pln} PLN/h</p>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isEditingWorkerSetup ? (
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-9 rounded-full border border-slate-200 bg-white px-3 text-[var(--color-heading)] shadow-none hover:bg-slate-50"
                      onClick={() => {
                        setIsEditingWorkerSetup(false);
                        if (workerSetupQuery.data) {
                          const permissionOverrides = workerSetupQuery.data.permission_overrides ?? emptyMembershipPermissionOverrides;
                          const next: Record<string, { priority: string; hourly_rate_pln: string }> = {};
                          for (const item of workerSetupQuery.data.locations) {
                            next[item.location_id] = {
                              priority: String(item.priority),
                              hourly_rate_pln: item.hourly_rate_pln,
                            };
                          }
                          setWorkerSetupDraft(next);
                          setWorkerPositionDraft(workerSetupQuery.data.staff_position || "");
                          setWorkerPermissionDraft({
                            staff_can_submit_revenue_reports_override: permissionDraftValue(permissionOverrides.staff_can_submit_revenue_reports_override),
                            staff_can_delete_revenue_reports_override: permissionDraftValue(permissionOverrides.staff_can_delete_revenue_reports_override),
                            manager_can_submit_revenue_reports_override: permissionDraftValue(permissionOverrides.manager_can_submit_revenue_reports_override),
                            manager_can_delete_revenue_reports_override: permissionDraftValue(permissionOverrides.manager_can_delete_revenue_reports_override),
                            manager_can_view_full_dashboard_override: permissionDraftValue(permissionOverrides.manager_can_view_full_dashboard_override),
                            manager_can_view_payroll_override: permissionDraftValue(permissionOverrides.manager_can_view_payroll_override),
                            manager_can_manage_team_override: permissionDraftValue(permissionOverrides.manager_can_manage_team_override),
                            manager_can_manage_business_settings_override: permissionDraftValue(permissionOverrides.manager_can_manage_business_settings_override),
                            manager_can_access_notes_override: permissionDraftValue(permissionOverrides.manager_can_access_notes_override),
                            manager_can_access_inventory_override: permissionDraftValue(permissionOverrides.manager_can_access_inventory_override),
                          });
                        }
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-700 text-white shadow-none hover:bg-emerald-800"
                      onClick={() => saveWorkerSetupMutation.mutate()}
                      disabled={saveWorkerSetupMutation.isPending}
                    >
                      {t("team.save_worker_setup")}
                    </Button>
                  </div>
                ) : null}
              </div>
              </div>
            ) : (
              <div className="mobile-sheet-scroll px-4 py-8 text-center text-sm text-[var(--color-text-muted)] lg:px-0">{t("team.worker_setup_empty")}</div>
            )}
          </div>
        </div>
        </OverlayPortal>
      ) : null}

      {locationSettingsId ? (
        <OverlayPortal>
        <div className="mobile-sheet-backdrop lg:grid lg:place-items-center lg:p-4">
          <div className="mobile-sheet-panel lg:max-h-[92vh] lg:w-full lg:max-w-[1400px] lg:overflow-y-auto lg:rounded-[1.6rem] lg:border lg:border-[var(--color-divider)] lg:bg-white lg:shadow-none">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-4 lg:mb-4 lg:px-5">
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--color-heading)] lg:text-2xl">Location settings</h3>
              <div className="flex items-center gap-2">
                {canEditWorkers ? (
                  <Button
                    variant="ghost"
                    className="min-h-9 rounded-full border border-slate-200 bg-white px-3 text-sky-700 shadow-none hover:bg-sky-50 hover:text-sky-800"
                    onClick={() => setIsEditingLocationDetails((current) => !current)}
                  >
                    <Pencil className="size-4" />
                    {isEditingLocationDetails ? t("common.cancel") : t("common.edit")}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  className="min-h-9 rounded-full border border-slate-200 bg-white px-3 text-[var(--color-heading)] shadow-none hover:bg-slate-50"
                  onClick={() => {
                    setLocationSettingsId(null);
                    setDeletePopupOpen(false);
                    setDeleteText("");
                  }}
                >
                  {t("common.close")}
                </Button>
              </div>
            </div>

            {(() => {
              const location = (locationsQuery.data ?? []).find((item) => item.id === locationSettingsId);
              if (!location) return <div className="px-4 py-6 text-sm text-[var(--color-text-muted)] lg:px-5">Location not found.</div>;
              const draft = locationDrafts[location.id] ?? { name: location.name, timezone: location.timezone, manager_user_ids: location.manager_user_ids ?? [] };
              return (
                <div className="mobile-sheet-scroll px-4 py-4 lg:px-5">
                <div className="space-y-5">
                  <div className="grid gap-4 border-b border-[var(--color-divider)] pb-4 xl:grid-cols-[1fr_0.95fr]">
                    <div className="space-y-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Location name</p>
                        {isEditingLocationDetails ? (
                          <Input
                            className={flatFieldClass}
                            value={draft.name}
                            onChange={(event) =>
                              setLocationDrafts((current) => ({
                                ...current,
                                [location.id]: { ...draft, name: event.target.value },
                              }))
                            }
                          />
                        ) : (
                          <p className="mt-1 text-sm font-medium text-[var(--color-heading)]">{draft.name}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Timezone</p>
                        {isEditingLocationDetails ? (
                          <Input
                            className={flatFieldClass}
                            value={draft.timezone}
                            onChange={(event) =>
                              setLocationDrafts((current) => ({
                                ...current,
                                [location.id]: { ...draft, timezone: event.target.value },
                              }))
                            }
                          />
                        ) : (
                          <p className="mt-1 text-sm font-medium text-[var(--color-heading)]">{draft.timezone}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Location managers</p>
                        {isEditingLocationDetails ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {managerCandidates.length ? (
                              managerCandidates.map((manager) => {
                                const selected = draft.manager_user_ids.includes(manager.id);
                                return (
                                  <button
                                    key={manager.id}
                                    type="button"
                                    className={`rounded-full border px-3 py-1.5 text-xs font-medium shadow-none transition ${
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
                        ) : (
                          <p className="mt-1 text-sm font-medium text-[var(--color-heading)]">
                            {managerCandidates
                              .filter((manager) => draft.manager_user_ids.includes(manager.id))
                              .map((manager) => manager.full_name)
                              .join(", ") || "No managers assigned"}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 xl:border-l xl:border-[var(--color-divider)] xl:pl-4">
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-heading)]">{t("team.template_blueprint_title")}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t("team.template_blueprint_description")}</p>
                      </div>
                      <div>
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
                                className={`min-w-[68px] rounded-lg border px-2 py-2 text-xs shadow-none transition ${
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
                      {canEditWorkers ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                          <Button
                            variant="ghost"
                            className="min-h-9 rounded-full border border-slate-200 bg-white px-3 text-sky-700 shadow-none hover:bg-sky-50 hover:text-sky-800"
                            onClick={() => {
                              setShowTemplateComposer((current) => !current);
                              setEditingTemplateId(null);
                            }}
                          >
                            <CalendarDays className="size-4" />
                            {showTemplateComposer ? t("common.cancel") : t("team.create_template_button")}
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-9 rounded-full border border-slate-200 bg-white px-3 text-[var(--color-heading)] shadow-none hover:bg-slate-50"
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
                            Copy day
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-9 rounded-full border border-slate-200 bg-white px-3 text-[var(--color-heading)] shadow-none hover:bg-slate-50"
                            onClick={() => pasteTemplatesMutation.mutate(location.id)}
                            disabled={!copiedDayTemplates.length || pasteTemplatesMutation.isPending}
                          >
                            Paste day
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {showTemplateComposer ? (
                    <div className="space-y-3 border-b border-[var(--color-divider)] pb-4">
                      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Template name</p>
                          <Input
                            className={flatFieldClass}
                            placeholder="e.g. Weekday lunch coverage"
                            value={templateInput.template_name}
                            onChange={(event) => setTemplateInput((current) => ({ ...current, template_name: event.target.value }))}
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Shift role</p>
                          <Select
                            className={flatFieldClass}
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
                              className={flatFieldClass}
                              options={templatePositionOptions}
                              value={templateInput.staff_position}
                              onChange={(event) => setTemplateInput((current) => ({ ...current, staff_position: event.target.value }))}
                            />
                          </div>
                        ) : null}
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">How many shifts in this day</p>
                          <Select
                            className={flatFieldClass}
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
                            className={flatFieldClass}
                            type="number"
                            min={1}
                            max={25}
                            value={templateInput.required_count}
                            onChange={(event) => setTemplateInput((current) => ({ ...current, required_count: event.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="border-t border-[var(--color-divider)] pt-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-600">Shift windows</p>
                        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Shift 1 start</p>
                            <Input
                              className={plainTimeFieldClass}
                              type="time"
                              value={templateInput.shift_1_start.slice(0, 5)}
                              onChange={(event) => setTemplateInput((current) => ({ ...current, shift_1_start: `${event.target.value}:00` }))}
                            />
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Shift 1 end</p>
                            <Input
                              className={plainTimeFieldClass}
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
                                className={plainTimeFieldClass}
                                type="time"
                                value={templateInput.shift_2_start.slice(0, 5)}
                                onChange={(event) => setTemplateInput((current) => ({ ...current, shift_2_start: `${event.target.value}:00` }))}
                              />
                            </div>
                            <div>
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Shift 2 end</p>
                              <Input
                                className={plainTimeFieldClass}
                                type="time"
                                value={templateInput.shift_2_end.slice(0, 5)}
                                onChange={(event) => setTemplateInput((current) => ({ ...current, shift_2_end: `${event.target.value}:00` }))}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                        <div className={`text-xs ${templateInputValid ? "text-emerald-700" : "text-[var(--color-danger)]"}`}>
                          {templateInputValid ? <p>Template is valid and ready to save.</p> : <p>{templateValidationIssues[0]}</p>}
                        </div>
                        <Button
                          className="w-full bg-[#68f05d] text-[#0c130f] shadow-none hover:bg-[#82f57a] sm:w-auto"
                          onClick={() => {
                            createTemplateMutation.mutate(location.id);
                          }}
                          disabled={createTemplateMutation.isPending || !templateInputValid}
                        >
                          <CalendarDays className="size-4" /> {t("team.create_template_button")}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2 border-b border-[var(--color-divider)] pb-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--color-heading)]">
                        Saved templates for {templateDayOptions.find((item) => item.value === selectedTemplateDay)?.label}
                      </p>
                      <p className="text-xs font-medium text-[var(--color-text-muted)]">
                        {(templatesQuery.data ?? []).filter((item) => item.day_of_week === Number(selectedTemplateDay)).length} saved
                      </p>
                    </div>
                    <div className="space-y-3">
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
                          const isEditingTemplate = editingTemplateId === template.id;
                          return (
                            <div key={template.id} className="border-t border-[var(--color-divider)] py-3">
                              {isEditingTemplate ? (
                                <>
                                  <div className="grid gap-2 md:grid-cols-6">
                                    <Input
                                      className={flatFieldClass}
                                      value={draft.template_name}
                                      onChange={(event) =>
                                        setTemplateDrafts((current) => ({
                                          ...current,
                                          [template.id]: { ...draft, template_name: event.target.value },
                                        }))
                                      }
                                    />
                                    <Input
                                      className={plainTimeFieldClass}
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
                                      className={plainTimeFieldClass}
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
                                      className={flatFieldClass}
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
                                      className={flatFieldClass}
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
                                      className={flatFieldClass}
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
                                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                                    <Button
                                      variant="ghost"
                                      className="min-h-9 rounded-full border border-slate-200 bg-white px-3 text-[var(--color-heading)] shadow-none hover:bg-slate-50"
                                      onClick={() => setEditingTemplateId(null)}
                                    >
                                      {t("common.cancel")}
                                    </Button>
                                    <Button
                                      className="bg-emerald-700 text-white shadow-none hover:bg-emerald-800"
                                      onClick={() => patchTemplateMutation.mutate({ templateId: template.id, draft })}
                                      disabled={patchTemplateMutation.isPending}
                                    >
                                      {t("common.save")}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      className="min-h-9 rounded-full border border-[#ff6b6b]/28 bg-[#ff6b6b]/10 px-3 text-[#ff6b6b] shadow-none hover:bg-[#ff6b6b]/16"
                                      onClick={() => deleteTemplateMutation.mutate(template.id)}
                                      disabled={deleteTemplateMutation.isPending}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <div className="grid flex-1 gap-2 md:grid-cols-6">
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Name</p>
                                      <p className="mt-1 text-sm font-medium text-[var(--color-heading)]">{draft.template_name}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Start</p>
                                      <p className="mt-1 text-sm font-medium text-[var(--color-heading)]">{draft.start_time.slice(0, 5)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">End</p>
                                      <p className="mt-1 text-sm font-medium text-[var(--color-heading)]">{draft.end_time.slice(0, 5)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Role</p>
                                      <p className="mt-1 text-sm font-medium text-[var(--color-heading)]">{roleOptionLabel(draft.required_role)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Position</p>
                                      <p className="mt-1 text-sm font-medium text-[var(--color-heading)]">{draft.required_role === "STAFF" ? draft.staff_position : "—"}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Count</p>
                                      <p className="mt-1 text-sm font-medium text-[var(--color-heading)]">{draft.required_count}</p>
                                    </div>
                                  </div>
                                  {canEditWorkers ? (
                                    <Button
                                      variant="ghost"
                                      className="min-h-9 rounded-full border border-slate-200 bg-white px-3 text-sky-700 shadow-none hover:bg-sky-50 hover:text-sky-800"
                                      onClick={() => {
                                        setEditingTemplateId(template.id);
                                        setShowTemplateComposer(false);
                                      }}
                                    >
                                      <Pencil className="size-4" />
                                      {t("common.edit")}
                                    </Button>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      {!((templatesQuery.data ?? []).filter((item) => item.day_of_week === Number(selectedTemplateDay)).length) ? (
                        <div className="px-0 py-3 text-sm text-[var(--color-text-muted)]">No templates saved for this day.</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-[var(--color-text-muted)]">ID {location.id.slice(0, 8)}</p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      {isEditingLocationDetails ? (
                        <>
                          <Button
                            variant="ghost"
                            className="min-h-9 rounded-full border border-slate-200 bg-white px-3 text-[var(--color-heading)] shadow-none hover:bg-slate-50"
                            onClick={() => {
                              setIsEditingLocationDetails(false);
                              setLocationDrafts((current) => ({
                                ...current,
                                [location.id]: { name: location.name, timezone: location.timezone, manager_user_ids: location.manager_user_ids ?? [] },
                              }));
                            }}
                          >
                            {t("common.cancel")}
                          </Button>
                          <Button
                            className="bg-[#68f05d] text-[#0c130f] shadow-none hover:bg-[#82f57a]"
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
                        </>
                      ) : null}
                      <Button
                        variant="ghost"
                        className="min-h-9 rounded-full border border-[#ff6b6b]/28 bg-[#ff6b6b]/10 px-3 text-[#ff6b6b] shadow-none hover:bg-[#ff6b6b]/16"
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
              <div className="fixed inset-0 z-[122] grid place-items-center bg-slate-950/45 p-4">
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
        </OverlayPortal>
      ) : null}
    </AppShell>
  );
}
