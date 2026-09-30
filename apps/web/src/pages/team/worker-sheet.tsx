import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, History, Plus, Trash2, X } from "lucide-react";

import { WorkerAvatar } from "@/components/worker-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { canManageBusinessSettings, hasPlanFeature } from "@/lib/access";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { currencyOf, currencySymbol } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { MemberPosition, MembershipPermissionOverrides } from "@/lib/types";
import { UnsavedDialog, useUnsavedChangesBlocker } from "@/lib/unsaved";
import { WorkerHistorySheet } from "@/pages/team/worker-history";

type Override = "inherit" | "allow" | "block";

const MANAGER_KEYS: Array<keyof MembershipPermissionOverrides> = [
  "manager_can_submit_revenue_reports_override",
  "manager_can_delete_revenue_reports_override",
  "manager_can_view_full_dashboard_override",
  "manager_can_view_payroll_override",
  "manager_can_manage_team_override",
  "manager_can_manage_business_settings_override",
];
const STAFF_KEYS: Array<keyof MembershipPermissionOverrides> = ["staff_can_submit_revenue_reports_override", "staff_can_delete_revenue_reports_override"];

const toOverride = (value: boolean | null | undefined): Override => (value === true ? "allow" : value === false ? "block" : "inherit");
const fromOverride = (value: Override): boolean | null => (value === "allow" ? true : value === "block" ? false : null);

/** Section heading inside a sheet. */
function SheetSection({ title, footer, children }: { title: string; footer?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="ios-section-header px-4 pb-2">{title}</h3>
      <div className="ios-island divide-y divide-[#e5e5ea] px-4">{children}</div>
      {footer ? <p className="mt-2 px-4 text-[13px] leading-[18px] text-[#3c3c43]">{footer}</p> : null}
    </section>
  );
}

/**
 * Everything about one person: the positions they can work (one primary, each with an optional rate),
 * where they work and how strongly they are preferred there, and exceptions to workspace permissions.
 */
export function WorkerSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { token, me } = useAuth();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const currency = currencyOf(me);
  const symbol = currencySymbol(currency, lang);

  const setupQuery = useQuery({
    queryKey: ["worker-setup", userId],
    queryFn: () => api.getWorkerSetup(token!, userId!),
    enabled: Boolean(token && userId),
    retry: false,
  });
  const catalogQuery = useQuery({ queryKey: ["positions"], queryFn: () => api.listPositions(token!), enabled: Boolean(token && userId) });

  const [positions, setPositions] = useState<MemberPosition[]>([]);
  const [newPosition, setNewPosition] = useState("");
  const [locations, setLocations] = useState<Record<string, { priority: string; rate: string }>>({});
  const [overrides, setOverrides] = useState<Partial<Record<keyof MembershipPermissionOverrides, Override>>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pinOverride, setPinOverride] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState<string | null>(null);
  const [role, setRole] = useState<"STAFF" | "MANAGER">("STAFF");
  const [askClose, setAskClose] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const setup = setupQuery.data;
  useEffect(() => {
    if (!setup) return;
    setPositions(setup.positions?.length ? setup.positions : setup.staff_position ? [{ position: setup.staff_position, hourly_rate: null, is_primary: true }] : []);
    setLocations(Object.fromEntries(setup.locations.map((item) => [item.location_id, { priority: String(item.priority), rate: String(item.hourly_rate_pln ?? "0") }])));
    setOverrides(Object.fromEntries(Object.entries(setup.permission_overrides ?? {}).map(([key, value]) => [key, toOverride(value as boolean | null)])));
    setNewPosition("");
    setConfirmRemove(false);
    setPinOverride(null);
    setPinDraft(null);
    setRole(setup.role === "MANAGER" ? "MANAGER" : "STAFF");
  }, [setup]);

  const canWorkPositions = setup?.role === "STAFF" || setup?.role === "MANAGER";
  // Managers may adjust staff exceptions only; the owner decides for managers too.
  const canEditOverrides =
    canManageBusinessSettings(me) && hasPlanFeature(me, "permissions") && setup?.role !== "ADMIN" && (me?.role === "ADMIN" || setup?.role === "STAFF");
  const canChangeRole = me?.role === "ADMIN" && setup?.role !== "ADMIN" && setup?.user_id !== me?.id;

  // What the form started with, to tell whether anything changed.
  const snapshot = (value: { positions: MemberPosition[]; locations: typeof locations; overrides: typeof overrides; role: string }) =>
    JSON.stringify([value.positions.map((item) => [item.position, item.hourly_rate ?? "", item.is_primary]), Object.entries(value.locations).sort(), Object.entries(value.overrides).sort(), value.role]);
  const initialSnapshot = useMemo(() => {
    if (!setup) return "";
    return snapshot({
      positions: setup.positions?.length ? setup.positions : setup.staff_position ? [{ position: setup.staff_position, hourly_rate: null, is_primary: true }] : [],
      locations: Object.fromEntries(setup.locations.map((item) => [item.location_id, { priority: String(item.priority), rate: String(item.hourly_rate_pln ?? "0") }])),
      overrides: Object.fromEntries(Object.entries(setup.permission_overrides ?? {}).map(([key, value]) => [key, toOverride(value as boolean | null)])),
      role: setup.role === "MANAGER" ? "MANAGER" : "STAFF",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);
  const dirty = Boolean(setup) && Boolean(userId) && snapshot({ positions, locations, overrides, role }) !== initialSnapshot;
  const blocker = useUnsavedChangesBlocker(dirty);
  // With the history sheet on top, Escape is meant for it, not for this card underneath.
  const requestClose = () => (historyOpen ? undefined : dirty ? setAskClose(true) : onClose());
  const catalogOptions = useMemo(() => {
    const taken = new Set(positions.map((item) => item.position.toLowerCase()));
    return (catalogQuery.data ?? []).filter((item) => !taken.has(item.name.toLowerCase())).map((item) => ({ value: item.name, label: item.name }));
  }, [catalogQuery.data, positions]);

  const addPosition = (name: string) => {
    const clean = name.trim();
    if (clean.length < 2 || positions.some((item) => item.position.toLowerCase() === clean.toLowerCase())) return;
    setPositions((current) => [...current, { position: clean, hourly_rate: null, is_primary: current.length === 0 }]);
    setNewPosition("");
  };

  const removalQuery = useQuery({
    queryKey: ["member-removal-impact", userId],
    queryFn: () => api.getMemberRemovalImpact(token!, userId!),
    enabled: Boolean(token && userId && confirmRemove),
    retry: false,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!userId || !setup) return;
      if (canChangeRole && role !== setup.role) await api.setWorkerRole(token!, userId, role);
      if (canWorkPositions) {
        await api.putWorkerPositions(
          token!,
          userId,
          positions.map((item) => ({ ...item, hourly_rate: item.hourly_rate === "" ? null : item.hourly_rate })),
        );
      }
      await api.patchWorkerSetup(token!, userId, {
        locations: setup.locations.map((item) => ({
          location_id: item.location_id,
          priority: Number(locations[item.location_id]?.priority ?? item.priority),
          hourly_rate_pln: locations[item.location_id]?.rate || "0",
        })),
        permission_overrides: canEditOverrides
          ? (Object.fromEntries([...MANAGER_KEYS, ...STAFF_KEYS, "manager_can_access_notes_override", "manager_can_access_inventory_override"].map((key) => [
              key,
              fromOverride(overrides[key as keyof MembershipPermissionOverrides] ?? "inherit"),
            ])) as MembershipPermissionOverrides)
          : undefined,
      });
    },
    onSuccess: () => {
      toast.success(t("team.worker_setup_saved"));
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["worker-setup", userId] });
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
      void queryClient.invalidateQueries({ queryKey: ["location-members"] });
      onClose();
    },
    onError: (error) => toast.error(t("team.worker_setup_save_failed"), error instanceof Error ? error.message : undefined),
  });

  const resetPin = useMutation({
    mutationFn: () => api.resetClockPin(token!, userId!),
    onSuccess: (data) => setPinOverride(data.pin),
    onError: (error) => toast.error(t("clock.pin_failed"), error instanceof Error ? error.message : undefined),
  });
  const setPin = useMutation({
    mutationFn: (pin: string) => api.setMemberClockPin(token!, userId!, pin),
    onSuccess: (data) => {
      setPinOverride(data.pin);
      setPinDraft(null);
      toast.success(t("clock.pin_saved"));
    },
    onError: (error) => toast.error(t("clock.pin_failed"), error instanceof Error ? error.message : undefined),
  });
  const currentPin = pinOverride ?? setup?.clock_pin ?? null;

  const saveThen = async (after: () => void) => {
    try {
      await save.mutateAsync();
      after();
    } catch {
      // The error toast is already shown; stay on the form.
    }
  };

  const remove = useMutation({
    mutationFn: () => api.removeMember(token!, userId!),
    onSuccess: (data) => {
      toast.success(t("team.member_removed"), data.full_name);
      for (const key of ["users", "worker-setup", "location-members", "subscription", "invites"]) void queryClient.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: (error) => toast.error(t("team.member_remove_failed"), error instanceof Error ? error.message : undefined),
  });

  const priorityOptions = [0, 1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: t(`team.priority_${value}`) }));
  const overrideKeys = setup?.role === "MANAGER" ? MANAGER_KEYS : STAFF_KEYS;

  return (
    <>
    <Sheet
      open={Boolean(userId)}
      onClose={requestClose}
      title={setup?.full_name ?? t("common.loading")}
      subtitle={setup?.role ? t(`shell.role.${setup.role}`) : undefined}
      action={{ label: t("common.save"), onClick: () => save.mutate(), disabled: !setup || save.isPending || (canWorkPositions && positions.length === 0) }}
      size="lg"
      grouped
    >
      {setupQuery.isError ? <p className="text-[15px] text-[var(--color-danger)]">{setupQuery.error instanceof Error ? setupQuery.error.message : ""}</p> : null}
      {setup ? (
        <>
          <div className="mb-6 flex items-center gap-3 px-1">
            <WorkerAvatar name={setup.full_name} size={52} />
            <div className="min-w-0">
              <p className="truncate text-[20px] font-semibold text-black">{setup.full_name}</p>
              <p className="text-[15px] text-[var(--color-text-muted)]">{positions.map((item) => item.position).join(" · ") || t("team.position_none")}</p>
            </div>
          </div>

          {canChangeRole ? (
            <SheetSection title={t("team.access")} footer={role === "MANAGER" ? t("team.access_manager_footer") : t("team.access_staff_footer")}>
              <div className="py-2.5">
                <Segmented
                  className="w-full"
                  ariaLabel={t("team.access")}
                  value={role}
                  onChange={(value) => setRole(value as "STAFF" | "MANAGER")}
                  options={[
                    { value: "STAFF", label: t("shell.role.STAFF") },
                    { value: "MANAGER", label: t("shell.role.MANAGER") },
                  ]}
                />
              </div>
            </SheetSection>
          ) : null}

          {canWorkPositions ? (
            <SheetSection title={t("team.positions")} footer={t("team.positions_footer")}>
              {positions.map((item, index) => (
                <div key={item.position} className="flex flex-wrap items-center gap-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => setPositions((current) => current.map((row, rowIndex) => ({ ...row, is_primary: rowIndex === index })))}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                    aria-pressed={item.is_primary}
                  >
                    <span
                      className={
                        item.is_primary
                          ? "grid size-6 place-items-center rounded-full bg-[var(--color-primary-strong)] text-white"
                          : "size-6 rounded-full border-2 border-[#c7c7cc]"
                      }
                    >
                      {item.is_primary ? <Check className="size-4" strokeWidth={3} /> : null}
                    </span>
                    <span className="truncate text-[16px] font-semibold text-black">{item.position}</span>
                    {item.is_primary ? <Badge tone="blue">{t("team.primary")}</Badge> : null}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[15px] text-[var(--color-text-muted)]">{symbol}</span>
                    <Input
                      inputMode="decimal"
                      className="h-10 w-24 bg-[rgba(118,118,128,0.12)]"
                      placeholder={t("team.location_rate")}
                      aria-label={t("team.rate_for", { position: item.position })}
                      value={item.hourly_rate ?? ""}
                      onChange={(event) =>
                        setPositions((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, hourly_rate: event.target.value.replace(",", ".") } : row)))
                      }
                    />
                    <button
                      type="button"
                      aria-label={t("team.remove_position", { position: item.position })}
                      onClick={() =>
                        setPositions((current) => {
                          const next = current.filter((_row, rowIndex) => rowIndex !== index);
                          if (next.length && !next.some((row) => row.is_primary)) next[0] = { ...next[0], is_primary: true };
                          return next;
                        })
                      }
                      className="grid size-10 place-items-center rounded-full text-[#3c3c43] hover:bg-[var(--color-danger-fill)] hover:text-[var(--color-danger)]"
                    >
                      <X className="size-5" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 py-3">
                {catalogOptions.length ? (
                  <div className="min-w-[160px] flex-1">
                    <Select value="" onChange={(event) => addPosition(event.target.value)} options={[{ value: "", label: t("team.add_from_list") }, ...catalogOptions]} />
                  </div>
                ) : null}
                <div className="flex min-w-[200px] flex-1 gap-2">
                  <Input
                    placeholder={t("team.new_position_placeholder")}
                    value={newPosition}
                    onChange={(event) => setNewPosition(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addPosition(newPosition);
                    }}
                  />
                  <Button variant="tinted" size="icon" aria-label={t("team.add_position")} onClick={() => addPosition(newPosition)} disabled={newPosition.trim().length < 2}>
                    <Plus className="size-5" />
                  </Button>
                </div>
              </div>
            </SheetSection>
          ) : null}

          <SheetSection title={t("team.locations_and_rates")} footer={t("team.priority_footer")}>
            {setup.locations.map((item) => (
              <div key={item.location_id} className="grid gap-2 py-3 sm:grid-cols-[1fr_180px_130px] sm:items-center">
                <p className="text-[16px] font-semibold text-black">{item.location_name}</p>
                <Select
                  value={locations[item.location_id]?.priority ?? String(item.priority)}
                  onChange={(event) => setLocations((current) => ({ ...current, [item.location_id]: { ...current[item.location_id], priority: event.target.value } }))}
                  options={priorityOptions}
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] text-[var(--color-text-muted)]">{symbol}</span>
                  <Input
                    inputMode="decimal"
                    aria-label={t("team.rate_at", { location: item.location_name })}
                    value={locations[item.location_id]?.rate ?? ""}
                    onChange={(event) => setLocations((current) => ({ ...current, [item.location_id]: { ...current[item.location_id], rate: event.target.value.replace(",", ".") } }))}
                  />
                  <span className="text-[15px] text-[var(--color-text-muted)]">/h</span>
                </div>
              </div>
            ))}
          </SheetSection>

          {canEditOverrides ? (
            <SheetSection title={t("team.permission_exceptions")} footer={t("team.permission_exceptions_footer")}>
              {overrideKeys.map((key) => (
                <div key={key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-[15px] text-black">{t(`perm.${key.replace("_override", "")}`)}</span>
                  <Segmented
                    ariaLabel={t(`perm.${key.replace("_override", "")}`)}
                    value={overrides[key] ?? "inherit"}
                    onChange={(value) => setOverrides((current) => ({ ...current, [key]: value }))}
                    options={[
                      { value: "inherit", label: t("perm.default") },
                      { value: "allow", label: t("perm.allow") },
                      { value: "block", label: t("perm.block") },
                    ]}
                  />
                </div>
              ))}
            </SheetSection>
          ) : null}

          {hasPlanFeature(me, "timesheets") ? (
            <SheetSection title={t("history.title")} footer={t("history.card_footer")}>
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="flex min-h-12 w-full items-center gap-3 text-left text-[16px] text-black active:opacity-60"
              >
                <History className="size-5 text-[var(--color-primary-strong)]" />
                <span className="flex-1">{t("history.open")}</span>
                <ChevronRight className="size-4 text-[#c4c4c6]" aria-hidden />
              </button>
            </SheetSection>
          ) : null}

          <SheetSection title={t("clock.header")} footer={t("clock.member_pin_footer")}>
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 py-2">
              <span className="text-[16px] text-black">{t("clock.pin")}</span>
              {pinDraft === null ? (
                <span className="text-[26px] font-semibold tracking-[0.3em] tabular-nums text-black" data-testid="member-pin">
                  {currentPin ?? "—"}
                </span>
              ) : (
                <Input
                  className="w-[140px] text-center text-[20px] tracking-[0.3em]"
                  inputMode="numeric"
                  autoFocus
                  aria-label={t("clock.pin")}
                  value={pinDraft}
                  onChange={(event) => setPinDraft(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2 pb-3">
              {pinDraft === null ? (
                <>
                  <Button size="sm" variant="tinted" onClick={() => setPinDraft("")}>
                    {t("clock.change_pin")}
                  </Button>
                  <Button size="sm" variant="plain" onClick={() => resetPin.mutate()} disabled={resetPin.isPending}>
                    {t("clock.new_pin")}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={() => setPin.mutate(pinDraft)} disabled={!/^\d{4,6}$/.test(pinDraft) || setPin.isPending}>
                    {t("common.save")}
                  </Button>
                  <Button size="sm" variant="plain" onClick={() => setPinDraft(null)}>
                    {t("common.cancel")}
                  </Button>
                </>
              )}
            </div>
          </SheetSection>

          {setup.role !== "ADMIN" && setup.user_id !== me?.id ? (
            <SheetSection title={t("team.danger_zone")}>
              {confirmRemove ? (
                <div className="space-y-3 py-3">
                  <p className="text-[15px] text-black">
                    {removalQuery.data
                      ? t("team.remove_impact", {
                          shifts: removalQuery.data.future_assignments_count,
                          requests: removalQuery.data.pending_shift_requests_count,
                        })
                      : t("common.loading")}
                  </p>
                  {removalQuery.data?.blocking_reason ? <p className="text-[15px] text-[var(--color-danger)]">{removalQuery.data.blocking_reason}</p> : null}
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button variant="danger" onClick={() => remove.mutate()} disabled={!removalQuery.data?.can_remove || remove.isPending}>
                      <Trash2 className="size-4" /> {t("team.remove_confirm")}
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmRemove(true)} className="flex min-h-12 w-full items-center gap-2 text-[16px] font-semibold text-[var(--color-danger)]">
                  <Trash2 className="size-4" /> {t("team.remove_from_team")}
                </button>
              )}
            </SheetSection>
          ) : null}
        </>
      ) : null}
    </Sheet>
    <WorkerHistorySheet userId={historyOpen ? userId : null} name={setup?.full_name ?? ""} onClose={() => setHistoryOpen(false)} />
    <UnsavedDialog
      open={askClose || blocker.state === "blocked"}
      title={t("unsaved.title")}
      body={t("unsaved.body")}
      saveLabel={t("common.save")}
      discardLabel={t("unsaved.discard")}
      cancelLabel={t("unsaved.keep_editing")}
      saving={save.isPending}
      onSave={() =>
        void saveThen(() => {
          setAskClose(false);
          if (blocker.state === "blocked") blocker.proceed();
        })
      }
      onDiscard={() => {
        setAskClose(false);
        if (blocker.state === "blocked") blocker.proceed();
        else onClose();
      }}
      onCancel={() => {
        setAskClose(false);
        if (blocker.state === "blocked") blocker.reset();
      }}
    />
    </>
  );
}
