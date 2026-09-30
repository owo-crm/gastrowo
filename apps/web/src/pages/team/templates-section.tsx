import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CopyPlus, Copy, ListChecks, Moon, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { api, type TemplateInput } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Role, ShiftTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { shiftHours } from "@/pages/team/shared";

/**
 * Shift templates are the weekly "shape" of a location: which positions are needed, when and how many.
 * Auto-scheduling fills them from availability.
 *
 * The API stores one row per day. Here identical shifts on several days are one "pattern" (Server
 * 9–5 ×2, Mon–Fri): edit it once, add or drop days, select several and change them together.
 */

const DAY_KEYS = ["days.mon", "days.tue", "days.wed", "days.thu", "days.fri", "days.sat", "days.sun"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

type Pattern = {
  key: string;
  role: Role;
  position: string | null;
  name: string;
  start: string;
  end: string;
  count: number;
  /** One row per day, sorted Mon→Sun. */
  items: ShiftTemplate[];
};

type Draft = {
  template_name: string;
  role: Role;
  staff_position: string;
  start: string;
  end: string;
  count: string;
  days: number[];
};

const hhmm = (value: string) => value.slice(0, 5);
const hoursLabel = (start: string, end: string) => {
  const hours = shiftHours(start, end);
  return `${hours % 1 ? hours.toFixed(1) : hours} h`;
};

function toPatterns(templates: ShiftTemplate[]): Pattern[] {
  const map = new Map<string, Pattern>();
  for (const item of templates) {
    const key = [item.required_role, item.staff_position ?? "", item.template_name, item.start_time, item.end_time, item.required_count].join("|");
    const pattern: Pattern = map.get(key) ?? {
      key,
      role: item.required_role,
      position: item.staff_position ?? null,
      name: item.template_name,
      start: hhmm(item.start_time),
      end: hhmm(item.end_time),
      count: item.required_count,
      items: [],
    };
    pattern.items.push(item);
    map.set(key, pattern);
  }
  const patterns = [...map.values()];
  for (const pattern of patterns) pattern.items.sort((a, b) => a.day_of_week - b.day_of_week);
  return patterns.sort((a, b) => a.start.localeCompare(b.start) || (a.position ?? "").localeCompare(b.position ?? ""));
}

/** "Every day", "Mon–Fri", "Sat, Sun", "Mon, Wed, Fri". */
function daysLabel(days: number[], t: (key: string) => string): string {
  if (days.length === 7) return t("templates.every_day");
  const sorted = [...days].sort();
  const consecutive = sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1);
  if (consecutive && sorted.length >= 3) return `${t(DAY_KEYS[sorted[0]])}–${t(DAY_KEYS[sorted[sorted.length - 1]])}`;
  return sorted.map((day) => t(DAY_KEYS[day])).join(", ");
}

function DayPicker({ value, onChange, disabledDays = [] }: { value: number[]; onChange: (days: number[]) => void; disabledDays?: number[] }) {
  const { t } = useLanguage();
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {DAY_KEYS.map((key, index) => {
        const on = value.includes(index);
        const disabled = disabledDays.includes(index);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((item) => item !== index) : [...value, index].sort())}
            className={cn(
              "min-h-11 rounded-[10px] text-[14px] font-semibold disabled:opacity-30",
              on ? "bg-[var(--color-primary-strong)] text-white" : "bg-[var(--color-fill)] text-black",
            )}
          >
            {t(key)}
          </button>
        );
      })}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{children}</span>;
}

export function TemplatesSection() {
  const { token } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();

  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: () => api.listLocations(token!), enabled: Boolean(token) });
  const positionsQuery = useQuery({ queryKey: ["positions"], queryFn: () => api.listPositions(token!), enabled: Boolean(token) });
  const [locationId, setLocationId] = useState("");
  useEffect(() => {
    if (!locationId && locationsQuery.data?.[0]) setLocationId(locationsQuery.data[0].id);
  }, [locationId, locationsQuery.data]);
  const locations = locationsQuery.data ?? [];

  const templatesQuery = useQuery({
    queryKey: ["templates", locationId],
    queryFn: () => api.listTemplates(token!, locationId),
    enabled: Boolean(token && locationId),
  });
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const patterns = useMemo(() => toPatterns(templates), [templates]);
  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const shown = dayFilter === null ? patterns : patterns.filter((pattern) => pattern.items.some((item) => item.day_of_week === dayFilter));
  const byDay = useMemo(
    () =>
      ALL_DAYS.map((day) => {
        const items = templates.filter((item) => item.day_of_week === day);
        return {
          people: items.reduce((sum, item) => sum + item.required_count, 0),
          hours: items.reduce((sum, item) => sum + item.required_count * shiftHours(item.start_time, item.end_time), 0),
        };
      }),
    [templates],
  );

  const positionNames = (positionsQuery.data ?? []).map((item) => item.name);

  // ---- saving: every change goes through one all-or-nothing request ----
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["templates"] });
    void queryClient.invalidateQueries({ queryKey: ["positions"] });
  };
  const bulk = useMutation({
    mutationFn: (body: Parameters<typeof api.bulkTemplates>[1]) => api.bulkTemplates(token!, body),
    onSuccess: () => refresh(),
    onError: (error) => toast.error(t("team.template_save_failed"), error instanceof Error ? error.message : undefined),
  });
  const input = (fields: Omit<TemplateInput, "day_of_week" | "location_id">, day: number, location = locationId): TemplateInput => ({
    ...fields,
    location_id: location,
    day_of_week: day,
  });
  const fieldsOf = (item: ShiftTemplate) => ({
    template_name: item.template_name,
    start_time: item.start_time,
    end_time: item.end_time,
    required_role: item.required_role,
    staff_position: item.staff_position ?? null,
    required_count: item.required_count,
  });

  // ---- one pattern: create or edit, days included ----
  const emptyDraft = (): Draft => ({
    template_name: "",
    role: "STAFF",
    staff_position: positionNames[0] ?? "",
    start: "09:00",
    end: "17:00",
    count: "1",
    days: dayFilter === null ? [0, 1, 2, 3, 4] : [dayFilter],
  });
  const [editing, setEditing] = useState<Pattern | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const openNew = () => {
    setDraft(emptyDraft());
    setEditing("new");
  };
  const openEdit = (pattern: Pattern) => {
    setDraft({
      template_name: pattern.name,
      role: pattern.role,
      staff_position: pattern.position ?? "",
      start: pattern.start,
      end: pattern.end,
      count: String(pattern.count),
      days: pattern.items.map((item) => item.day_of_week),
    });
    setEditing(pattern);
  };
  const draftFields = () => ({
    template_name: draft.template_name.trim() || (draft.role === "STAFF" ? draft.staff_position.trim() : t("shell.role.MANAGER")),
    start_time: `${draft.start}:00`,
    end_time: `${draft.end}:00`,
    required_role: draft.role,
    staff_position: draft.role === "STAFF" ? draft.staff_position.trim() : null,
    required_count: Number(draft.count),
  });
  const savePattern = () => {
    const fields = draftFields();
    const existing = editing && editing !== "new" ? editing.items : [];
    const kept = existing.filter((item) => draft.days.includes(item.day_of_week));
    const body = {
      update: kept.map((item) => ({ ...input(fields, item.day_of_week), id: item.id, is_active: true })),
      delete: existing.filter((item) => !draft.days.includes(item.day_of_week)).map((item) => item.id),
      create: draft.days.filter((day) => !existing.some((item) => item.day_of_week === day)).map((day) => input(fields, day)),
    };
    bulk.mutate(body, {
      onSuccess: () => {
        toast.success(t("team.template_saved"));
        setEditing(null);
      },
    });
  };
  const deletePattern = (pattern: Pattern) =>
    bulk.mutate({ delete: pattern.items.map((item) => item.id) }, { onSuccess: () => setEditing(null) });
  const valid =
    draft.start !== draft.end &&
    Number(draft.count) >= 1 &&
    Number(draft.count) <= 25 &&
    (draft.role !== "STAFF" || draft.staff_position.trim().length >= 2) &&
    draft.days.length > 0;

  // ---- selection and bulk actions ----
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedPatterns = patterns.filter((pattern) => selected.has(pattern.key));
  const selectedItems = selectedPatterns.flatMap((pattern) => pattern.items);
  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  useEffect(() => stopSelecting(), [locationId]);

  const [bulkSheet, setBulkSheet] = useState<"edit" | "copy-location" | "delete" | null>(null);
  const [bulkEdit, setBulkEdit] = useState({ start: "", end: "", count: "", addDays: [] as number[], removeDays: [] as number[] });
  const openBulkEdit = () => {
    setBulkEdit({ start: "", end: "", count: "", addDays: [], removeDays: [] });
    setBulkSheet("edit");
  };
  const applyBulkEdit = () => {
    const update: Array<TemplateInput & { id: string; is_active: boolean }> = [];
    const create: TemplateInput[] = [];
    const remove: string[] = [];
    for (const pattern of selectedPatterns) {
      const fields = {
        ...fieldsOf(pattern.items[0]),
        ...(bulkEdit.start ? { start_time: `${bulkEdit.start}:00` } : {}),
        ...(bulkEdit.end ? { end_time: `${bulkEdit.end}:00` } : {}),
        ...(bulkEdit.count ? { required_count: Number(bulkEdit.count) } : {}),
      };
      for (const item of pattern.items) {
        if (bulkEdit.removeDays.includes(item.day_of_week)) remove.push(item.id);
        else update.push({ ...input(fields, item.day_of_week), id: item.id, is_active: true });
      }
      for (const day of bulkEdit.addDays) {
        if (!pattern.items.some((item) => item.day_of_week === day)) create.push(input(fields, day));
      }
    }
    bulk.mutate(
      { update, create, delete: remove },
      {
        onSuccess: () => {
          toast.success(t("templates.bulk_saved", { count: selectedPatterns.length }));
          setBulkSheet(null);
          stopSelecting();
        },
      },
    );
  };
  const bulkEditInvalid =
    (bulkEdit.start && bulkEdit.end && bulkEdit.start === bulkEdit.end) ||
    (bulkEdit.count !== "" && (Number(bulkEdit.count) < 1 || Number(bulkEdit.count) > 25)) ||
    (!bulkEdit.start && !bulkEdit.end && !bulkEdit.count && !bulkEdit.addDays.length && !bulkEdit.removeDays.length);

  const [targetLocation, setTargetLocation] = useState("");
  const otherLocations = locations.filter((item) => item.id !== locationId);
  const copyToLocation = () =>
    bulk.mutate(
      { create: selectedItems.map((item) => input(fieldsOf(item), item.day_of_week, targetLocation)) },
      {
        onSuccess: () => {
          toast.success(t("templates.copied_location", { count: selectedPatterns.length, location: otherLocations.find((item) => item.id === targetLocation)?.name ?? "" }));
          setBulkSheet(null);
          stopSelecting();
        },
      },
    );
  const deleteSelected = () =>
    bulk.mutate(
      { delete: selectedItems.map((item) => item.id) },
      {
        onSuccess: () => {
          toast.success(t("templates.deleted", { count: selectedPatterns.length }));
          setBulkSheet(null);
          stopSelecting();
        },
      },
    );

  // ---- copy one day onto others ----
  const [copyDay, setCopyDay] = useState<{ from: number; to: number[]; replace: boolean } | null>(null);
  const applyCopyDay = () => {
    if (!copyDay) return;
    const source = templates.filter((item) => item.day_of_week === copyDay.from);
    bulk.mutate(
      {
        delete: copyDay.replace ? templates.filter((item) => copyDay.to.includes(item.day_of_week)).map((item) => item.id) : [],
        create: copyDay.to.flatMap((day) => source.map((item) => input(fieldsOf(item), day))),
      },
      {
        onSuccess: () => {
          toast.success(t("templates.day_copied"));
          setCopyDay(null);
        },
      },
    );
  };

  // ---- quick start for an empty location ----
  const [starter, setStarter] = useState(false);
  const starterShifts = positionNames.flatMap((position) => [
    { position, start: "11:00", end: "16:00", label: t("templates.starter_lunch") },
    { position, start: "16:00", end: "23:00", label: t("templates.starter_dinner") },
  ]);
  const applyStarter = () =>
    bulk.mutate(
      {
        create: starterShifts.flatMap((shift) =>
          ALL_DAYS.map((day) =>
            input(
              {
                template_name: `${shift.position} ${shift.label.toLowerCase()}`,
                start_time: `${shift.start}:00`,
                end_time: `${shift.end}:00`,
                required_role: "STAFF",
                staff_position: shift.position,
                required_count: 1,
              },
              day,
            ),
          ),
        ),
      },
      {
        onSuccess: () => {
          toast.success(t("templates.starter_done"));
          setStarter(false);
        },
      },
    );

  const loaded = templatesQuery.isSuccess;
  const empty = loaded && !templates.length;

  return (
    <div className="pb-24">
      <div className="space-y-3 px-4 pb-4 sm:px-6">
        {locations.length > 1 ? (
          <Select value={locationId} onChange={(event) => setLocationId(event.target.value)} options={locations.map((item) => ({ value: item.id, label: item.name }))} />
        ) : null}

        {/* The week at a glance: people and hours needed per day. Tap a day to show only its shifts. */}
        <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={t("templates.week")} data-testid="templates-week">
          {ALL_DAYS.map((day) => {
            const active = dayFilter === day;
            const { people, hours } = byDay[day];
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                onClick={() => setDayFilter(active ? null : day)}
                className={cn(
                  "flex min-h-[74px] flex-col items-center justify-center rounded-[14px] px-1 text-center transition-colors",
                  active ? "bg-[var(--color-primary-strong)] text-white" : "bg-white text-black hover:bg-[var(--color-accent)]",
                )}
              >
                <span className={cn("text-[13px] font-semibold", active ? "text-white/80" : "text-[var(--color-text-muted)]")}>{t(DAY_KEYS[day])}</span>
                <span className="text-[20px] font-bold leading-6 tabular-nums">{people}</span>
                <span className={cn("text-[11px] tabular-nums", active ? "text-white/80" : "text-[var(--color-text-tertiary)]")}>{people ? `${Math.round(hours)} h` : "—"}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[13px] text-[var(--color-text-muted)]">{dayFilter === null ? t("templates.week_hint") : t("templates.filtered", { day: t(DAY_KEYS[dayFilter]) })}</p>

        {templates.length ? (
          <div className="flex flex-wrap gap-2">
            {selecting ? (
              <Button size="sm" variant="secondary" onClick={stopSelecting}>
                <X className="size-4" /> {t("common.cancel")}
              </Button>
            ) : (
              <Button size="sm" variant="tinted" onClick={() => setSelecting(true)}>
                <ListChecks className="size-4" /> {t("templates.select")}
              </Button>
            )}
            {selecting ? (
              <Button size="sm" variant="ghost" onClick={() => setSelected(selected.size === shown.length ? new Set() : new Set(shown.map((pattern) => pattern.key)))}>
                {selected.size === shown.length ? t("templates.select_none") : t("templates.select_all")}
              </Button>
            ) : (
              <Button size="sm" variant="tinted" onClick={() => setCopyDay({ from: dayFilter ?? 0, to: [], replace: false })}>
                <Copy className="size-4" /> {t("templates.copy_day")}
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {empty ? (
        <ListSection>
          <li className="px-4 py-8 text-center sm:px-6">
            <p className="text-[17px] font-semibold text-black">{t("templates.empty_title")}</p>
            <p className="mx-auto mt-1 max-w-md text-[15px] text-[var(--color-text-muted)]">{t("templates.empty_body")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={openNew}>
                <Plus className="size-4" /> {t("team.add_template")}
              </Button>
              {positionNames.length ? (
                <Button variant="tinted" onClick={() => setStarter(true)}>
                  <Sparkles className="size-4" /> {t("templates.starter")}
                </Button>
              ) : (
                <Link to="/team/positions" className="inline-flex min-h-11 items-center rounded-[12px] px-4 font-semibold text-[var(--color-primary-strong)]">
                  {t("templates.add_positions_first")}
                </Link>
              )}
            </div>
          </li>
        </ListSection>
      ) : null}

      {!empty ? (
        <ListSection footer={t("templates.footer")}>
          {shown.map((pattern) => {
            const days = pattern.items.map((item) => item.day_of_week);
            const checked = selected.has(pattern.key);
            return (
              <ListRow
                key={pattern.key}
                onClick={() => (selecting ? toggle(pattern.key) : openEdit(pattern))}
                chevron={!selecting}
                aria-selected={selecting ? checked : undefined}
                data-testid="template-pattern"
                leading={
                  selecting ? (
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full border-2",
                        checked ? "border-[var(--color-primary-strong)] bg-[var(--color-primary-strong)] text-white" : "border-[#c7c7cc]",
                      )}
                    >
                      {checked ? <Check className="size-4" strokeWidth={3} /> : null}
                    </span>
                  ) : undefined
                }
                title={
                  <span className="inline-flex items-center gap-2">
                    <span className="font-semibold tabular-nums">
                      {pattern.start}–{pattern.end}
                    </span>
                    {pattern.end <= pattern.start ? <Moon className="size-4 text-[#5856d6]" aria-label={t("team.overnight")} /> : null}
                    <span>{pattern.position ?? t(`shell.role.${pattern.role}`)}</span>
                  </span>
                }
                subtitle={`${daysLabel(days, t)} · ${hoursLabel(pattern.start, pattern.end)}${pattern.name !== pattern.position ? ` · ${pattern.name}` : ""}`}
                trailing={<Badge tone="neutral">× {pattern.count}</Badge>}
              />
            );
          })}
          {loaded && !shown.length && dayFilter !== null ? (
            <li className="px-4 py-8 text-center text-[15px] text-[var(--color-text-muted)] sm:px-6">{t("team.no_templates_day")}</li>
          ) : null}
          {!selecting ? (
            <ListRow
              onClick={openNew}
              title={
                <span className="inline-flex items-center gap-2 font-semibold text-[var(--color-primary-strong)]">
                  <Plus className="size-5" /> {t("team.add_template")}
                </span>
              }
            />
          ) : null}
        </ListSection>
      ) : null}

      {/* Action bar while selecting. */}
      {selecting ? (
        <div className="fixed inset-x-3 bottom-[calc(max(10px,env(safe-area-inset-bottom))+144px)] z-[110] mx-auto flex max-w-xl items-center gap-2 rounded-[20px] bg-white p-2 shadow-[var(--shadow-float)] lg:bottom-6 lg:left-[280px]" data-testid="templates-actions">
          <span className="flex-1 px-2 text-[15px] font-semibold text-black">{t("templates.selected", { count: selected.size })}</span>
          <Button size="sm" variant="tinted" disabled={!selected.size} onClick={openBulkEdit}>
            <Pencil className="size-4" /> {t("templates.edit")}
          </Button>
          {otherLocations.length ? (
            <Button
              size="sm"
              variant="tinted"
              disabled={!selected.size}
              onClick={() => {
                setTargetLocation(otherLocations[0].id);
                setBulkSheet("copy-location");
              }}
            >
              <CopyPlus className="size-4" /> {t("templates.copy")}
            </Button>
          ) : null}
          <Button size="sm" variant="danger-plain" disabled={!selected.size} onClick={() => setBulkSheet("delete")} aria-label={t("templates.delete")}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : null}

      {/* Create / edit one pattern. */}
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? t("team.add_template") : t("team.edit_template")}
        action={{ label: t("common.save"), onClick: savePattern, disabled: !valid || bulk.isPending }}
      >
        <div className="space-y-4">
          <Segmented
            className="w-full"
            ariaLabel={t("team.who")}
            value={draft.role}
            onChange={(value) => setDraft((current) => ({ ...current, role: value }))}
            options={[
              { value: "STAFF", label: t("team.role_staff") },
              { value: "MANAGER", label: t("shell.role.MANAGER") },
            ]}
          />
          {draft.role === "STAFF" ? (
            <div>
              <Label>{t("team.position")}</Label>
              {positionNames.length ? (
                <Select
                  value={draft.staff_position}
                  onChange={(event) => setDraft((current) => ({ ...current, staff_position: event.target.value }))}
                  options={(positionNames.includes(draft.staff_position) || !draft.staff_position ? positionNames : [draft.staff_position, ...positionNames]).map((name) => ({
                    value: name,
                    label: name,
                  }))}
                />
              ) : (
                <Input
                  placeholder={t("team.new_position_placeholder")}
                  value={draft.staff_position}
                  onChange={(event) => setDraft((current) => ({ ...current, staff_position: event.target.value }))}
                />
              )}
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-3">
            <label>
              <Label>{t("team.starts")}</Label>
              <Input type="time" value={draft.start} onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))} />
            </label>
            <label>
              <Label>{t("team.ends")}</Label>
              <Input type="time" value={draft.end} onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))} />
            </label>
            <label>
              <Label>{t("team.people_needed")}</Label>
              <Input type="number" min={1} max={25} value={draft.count} onChange={(event) => setDraft((current) => ({ ...current, count: event.target.value }))} />
            </label>
          </div>
          {draft.end <= draft.start && draft.start !== draft.end ? (
            <p className="flex items-center gap-2 text-[14px] font-semibold text-[#5856d6]">
              <Moon className="size-4" /> {t("team.overnight_hint")}
            </p>
          ) : null}
          <div>
            <Label>{t("templates.days")}</Label>
            <DayPicker value={draft.days} onChange={(days) => setDraft((current) => ({ ...current, days }))} />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDraft((current) => ({ ...current, days: [0, 1, 2, 3, 4] }))}>
                {t("templates.weekdays")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft((current) => ({ ...current, days: [5, 6] }))}>
                {t("templates.weekend")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft((current) => ({ ...current, days: ALL_DAYS }))}>
                {t("templates.every_day")}
              </Button>
            </div>
          </div>
          <label className="block">
            <Label>{t("team.template_name_optional")}</Label>
            <Input value={draft.template_name} placeholder={t("team.template_name_placeholder")} onChange={(event) => setDraft((current) => ({ ...current, template_name: event.target.value }))} />
          </label>
          {editing && editing !== "new" ? (
            <div className="border-t border-[var(--color-separator)] pt-4">
              <Button variant="danger-plain" onClick={() => deletePattern(editing)} disabled={bulk.isPending}>
                <Trash2 className="size-4" /> {editing.items.length > 1 ? t("templates.delete_all_days", { count: editing.items.length }) : t("team.delete_template")}
              </Button>
            </div>
          ) : null}
        </div>
      </Sheet>

      {/* Bulk edit: only filled fields change. */}
      <Sheet
        open={bulkSheet === "edit"}
        onClose={() => setBulkSheet(null)}
        title={t("templates.bulk_title", { count: selectedPatterns.length })}
        action={{ label: t("common.save"), onClick: applyBulkEdit, disabled: Boolean(bulkEditInvalid) || bulk.isPending }}
      >
        <div className="space-y-4">
          <p className="text-[15px] text-[var(--color-text-muted)]">{t("templates.bulk_hint")}</p>
          <div className="grid grid-cols-3 gap-3">
            <label>
              <Label>{t("team.starts")}</Label>
              <Input type="time" value={bulkEdit.start} onChange={(event) => setBulkEdit((current) => ({ ...current, start: event.target.value }))} />
            </label>
            <label>
              <Label>{t("team.ends")}</Label>
              <Input type="time" value={bulkEdit.end} onChange={(event) => setBulkEdit((current) => ({ ...current, end: event.target.value }))} />
            </label>
            <label>
              <Label>{t("team.people_needed")}</Label>
              <Input type="number" min={1} max={25} placeholder="—" value={bulkEdit.count} onChange={(event) => setBulkEdit((current) => ({ ...current, count: event.target.value }))} />
            </label>
          </div>
          <div>
            <Label>{t("templates.add_days")}</Label>
            <DayPicker value={bulkEdit.addDays} disabledDays={bulkEdit.removeDays} onChange={(addDays) => setBulkEdit((current) => ({ ...current, addDays }))} />
          </div>
          <div>
            <Label>{t("templates.remove_days")}</Label>
            <DayPicker value={bulkEdit.removeDays} disabledDays={bulkEdit.addDays} onChange={(removeDays) => setBulkEdit((current) => ({ ...current, removeDays }))} />
          </div>
        </div>
      </Sheet>

      <Sheet
        open={bulkSheet === "copy-location"}
        onClose={() => setBulkSheet(null)}
        title={t("templates.copy_location_title", { count: selectedPatterns.length })}
        action={{ label: t("templates.copy"), onClick: copyToLocation, disabled: !targetLocation || bulk.isPending }}
      >
        <div className="space-y-3">
          <Label>{t("templates.to_location")}</Label>
          <Select value={targetLocation} onChange={(event) => setTargetLocation(event.target.value)} options={otherLocations.map((item) => ({ value: item.id, label: item.name }))} />
          <p className="text-[14px] text-[var(--color-text-muted)]">{t("templates.copy_location_hint")}</p>
        </div>
      </Sheet>

      <Sheet
        open={bulkSheet === "delete"}
        onClose={() => setBulkSheet(null)}
        title={t("templates.delete_title", { count: selectedPatterns.length })}
        action={{ label: t("templates.delete"), onClick: deleteSelected, disabled: bulk.isPending }}
      >
        <p className="text-[15px] text-[var(--color-text-muted)]">{t("templates.delete_hint", { rows: selectedItems.length })}</p>
      </Sheet>

      {/* Copy a day. */}
      <Sheet
        open={copyDay !== null}
        onClose={() => setCopyDay(null)}
        title={t("templates.copy_day")}
        action={{ label: t("templates.copy"), onClick: applyCopyDay, disabled: !copyDay?.to.length || bulk.isPending }}
      >
        {copyDay ? (
          <div className="space-y-4">
            <div>
              <Label>{t("templates.from_day")}</Label>
              <Select
                value={String(copyDay.from)}
                onChange={(event) => setCopyDay({ ...copyDay, from: Number(event.target.value), to: copyDay.to.filter((day) => day !== Number(event.target.value)) })}
                options={ALL_DAYS.map((day) => ({ value: String(day), label: `${t(DAY_KEYS[day])} · ${byDay[day].people}` }))}
              />
            </div>
            <div>
              <Label>{t("templates.to_days")}</Label>
              <DayPicker value={copyDay.to} disabledDays={[copyDay.from]} onChange={(to) => setCopyDay({ ...copyDay, to })} />
            </div>
            <Segmented
              className="w-full"
              ariaLabel={t("templates.copy_mode")}
              value={copyDay.replace ? "replace" : "add"}
              onChange={(value) => setCopyDay({ ...copyDay, replace: value === "replace" })}
              options={[
                { value: "add", label: t("templates.copy_add") },
                { value: "replace", label: t("templates.copy_replace") },
              ]}
            />
            <p className="text-[14px] text-[var(--color-text-muted)]">{copyDay.replace ? t("templates.copy_replace_hint") : t("templates.copy_add_hint")}</p>
          </div>
        ) : null}
      </Sheet>

      {/* Quick start. */}
      <Sheet open={starter} onClose={() => setStarter(false)} title={t("templates.starter")} action={{ label: t("templates.starter_create"), onClick: applyStarter, disabled: bulk.isPending }}>
        <div className="space-y-3">
          <p className="text-[15px] text-[var(--color-text-muted)]">{t("templates.starter_hint")}</p>
          <ul className="overflow-hidden rounded-[14px] bg-[var(--color-grouped)]">
            {starterShifts.map((shift) => (
              <li key={`${shift.position}-${shift.start}`} className="flex items-center justify-between border-b border-[var(--color-separator)] px-4 py-2.5 text-[15px] last:border-0">
                <span className="font-semibold">{shift.position}</span>
                <span className="tabular-nums text-[var(--color-text-muted)]">
                  {shift.label} · {shift.start}–{shift.end} · {t("templates.every_day").toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </div>
  );
}
