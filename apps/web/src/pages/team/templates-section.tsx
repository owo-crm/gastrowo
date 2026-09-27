import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Moon, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Role, ShiftTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { shiftHours } from "@/pages/team/shared";

const DAY_KEYS = ["days.mon", "days.tue", "days.wed", "days.thu", "days.fri", "days.sat", "days.sun"];

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

/**
 * Shift templates are the weekly "shape" of a location: which positions are needed, when and how many.
 * Auto-scheduling fills them from availability. One template can be created for several days at once.
 */
export function TemplatesSection() {
  const { token } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();

  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: () => api.listLocations(token!), enabled: Boolean(token) });
  const positionsQuery = useQuery({ queryKey: ["positions"], queryFn: () => api.listPositions(token!), enabled: Boolean(token) });
  const [locationId, setLocationId] = useState("");
  const [day, setDay] = useState(0);
  useEffect(() => {
    if (!locationId && locationsQuery.data?.[0]) setLocationId(locationsQuery.data[0].id);
  }, [locationId, locationsQuery.data]);

  const templatesQuery = useQuery({
    queryKey: ["templates", locationId],
    queryFn: () => api.listTemplates(token!, locationId),
    enabled: Boolean(token && locationId),
  });
  const templates = templatesQuery.data ?? [];
  const countByDay = useMemo(() => DAY_KEYS.map((_, index) => templates.filter((item) => item.day_of_week === index).length), [templates]);
  const dayTemplates = templates.filter((item) => item.day_of_week === day).sort((a, b) => a.start_time.localeCompare(b.start_time));

  const positionNames = (positionsQuery.data ?? []).map((item) => item.name);
  const emptyDraft = (): Draft => ({
    template_name: "",
    role: "STAFF",
    staff_position: positionNames[0] ?? "",
    start: "09:00",
    end: "17:00",
    count: "1",
    days: [day],
  });
  const [editing, setEditing] = useState<ShiftTemplate | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const openNew = () => {
    setDraft(emptyDraft());
    setEditing("new");
  };
  const openEdit = (template: ShiftTemplate) => {
    setDraft({
      template_name: template.template_name,
      role: template.required_role,
      staff_position: template.staff_position ?? "",
      start: hhmm(template.start_time),
      end: hhmm(template.end_time),
      count: String(template.required_count),
      days: [template.day_of_week],
    });
    setEditing(template);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["templates"] });
    void queryClient.invalidateQueries({ queryKey: ["positions"] });
  };
  const payload = (dayOfWeek: number) => ({
    location_id: locationId,
    day_of_week: dayOfWeek,
    template_name: draft.template_name.trim() || (draft.role === "STAFF" ? draft.staff_position : t("shell.role.MANAGER")),
    start_time: `${draft.start}:00`,
    end_time: `${draft.end}:00`,
    required_role: draft.role,
    staff_position: draft.role === "STAFF" ? draft.staff_position.trim() : null,
    required_count: Number(draft.count),
  });
  const save = useMutation({
    mutationFn: async () => {
      if (editing === "new") {
        await Promise.all(draft.days.map((dayOfWeek) => api.createTemplate(token!, payload(dayOfWeek))));
      } else if (editing) {
        await api.patchTemplate(token!, editing.id, { ...payload(editing.day_of_week), is_active: true });
      }
    },
    onSuccess: () => {
      toast.success(t("team.template_saved"));
      setEditing(null);
      refresh();
    },
    onError: (error) => toast.error(t("team.template_save_failed"), error instanceof Error ? error.message : undefined),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(token!, id),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: (error) => toast.error(t("team.template_delete_failed"), error instanceof Error ? error.message : undefined),
  });

  const overnight = draft.end <= draft.start;
  const valid =
    draft.start !== draft.end &&
    Number(draft.count) >= 1 &&
    (draft.role !== "STAFF" || draft.staff_position.trim().length >= 2) &&
    (editing !== "new" || draft.days.length > 0);
  const locations = locationsQuery.data ?? [];

  return (
    <div>
      <div className="space-y-3 px-4 pb-4 sm:px-6">
        {locations.length > 1 ? (
          <Select value={locationId} onChange={(event) => setLocationId(event.target.value)} options={locations.map((item) => ({ value: item.id, label: item.name }))} />
        ) : null}
        <div className="overflow-x-auto [scrollbar-width:none]">
          <Segmented
            className="min-w-full"
            ariaLabel={t("team.day")}
            value={String(day)}
            onChange={(value) => setDay(Number(value))}
            options={DAY_KEYS.map((key, index) => ({ value: String(index), label: `${t(key)}${countByDay[index] ? ` ${countByDay[index]}` : ""}` }))}
          />
        </div>
      </div>

      <ListSection footer={t("team.templates_footer")}>
        {dayTemplates.map((template) => {
          const hours = shiftHours(template.start_time, template.end_time);
          return (
            <ListRow
              key={template.id}
              onClick={() => openEdit(template)}
              chevron
              title={
                <span className="inline-flex items-center gap-2">
                  <span className="font-semibold tabular-nums">
                    {hhmm(template.start_time)}–{hhmm(template.end_time)}
                  </span>
                  {template.end_time <= template.start_time ? <Moon className="size-4 text-[#5856d6]" aria-label={t("team.overnight")} /> : null}
                  <span>{template.staff_position ?? t(`shell.role.${template.required_role}`)}</span>
                </span>
              }
              subtitle={`${template.template_name} · ${hours % 1 ? hours.toFixed(1) : hours} h`}
              trailing={<Badge tone="neutral">× {template.required_count}</Badge>}
            />
          );
        })}
        {!dayTemplates.length ? (
          <li className="px-4 py-8 text-center text-[15px] text-[var(--color-text-muted)] sm:px-6">{t("team.no_templates_day")}</li>
        ) : null}
        <ListRow
          onClick={openNew}
          title={
            <span className="inline-flex items-center gap-2 font-semibold text-[var(--color-primary-strong)]">
              <Plus className="size-5" /> {t("team.add_template")}
            </span>
          }
        />
      </ListSection>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? t("team.add_template") : t("team.edit_template")}
        action={{ label: t("common.save"), onClick: () => save.mutate(), disabled: !valid || save.isPending }}
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
              <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("team.position")}</span>
              {positionNames.length ? (
                <Select
                  value={draft.staff_position}
                  onChange={(event) => setDraft((current) => ({ ...current, staff_position: event.target.value }))}
                  options={positionNames.map((name) => ({ value: name, label: name }))}
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
              <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("team.starts")}</span>
              <Input type="time" value={draft.start} onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("team.ends")}</span>
              <Input type="time" value={draft.end} onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("team.people_needed")}</span>
              <Input type="number" min={1} max={50} value={draft.count} onChange={(event) => setDraft((current) => ({ ...current, count: event.target.value }))} />
            </label>
          </div>
          {overnight && draft.start !== draft.end ? (
            <p className="flex items-center gap-2 text-[14px] font-semibold text-[#5856d6]">
              <Moon className="size-4" /> {t("team.overnight_hint")}
            </p>
          ) : null}
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("team.template_name_optional")}</span>
            <Input value={draft.template_name} placeholder={t("team.template_name_placeholder")} onChange={(event) => setDraft((current) => ({ ...current, template_name: event.target.value }))} />
          </label>
          {editing === "new" ? (
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("team.repeat_on")}</span>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_KEYS.map((key, index) => {
                  const on = draft.days.includes(index);
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDraft((current) => ({ ...current, days: on ? current.days.filter((item) => item !== index) : [...current.days, index].sort() }))
                      }
                      className={cn(
                        "min-h-11 rounded-[10px] text-[14px] font-semibold",
                        on ? "bg-[var(--color-primary-strong)] text-white" : "bg-[var(--color-fill)] text-black",
                      )}
                    >
                      {t(key)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="border-t border-[var(--color-separator)] pt-4">
              <Button variant="danger-plain" onClick={() => editing && remove.mutate(editing.id)} disabled={remove.isPending}>
                <Trash2 className="size-4" /> {t("team.delete_template")}
              </Button>
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}
