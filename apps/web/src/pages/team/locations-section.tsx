import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { UPGRADE_ROUTE } from "@/lib/navigation";
import { useToast } from "@/lib/toast";
import type { Location } from "@/lib/types";
import { TIMEZONES } from "@/pages/team/shared";

type Draft = { name: string; timezone: string; manager_user_ids: string[] };

export function LocationsSection() {
  const { token, me } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const defaultTimezone = me?.organization_settings?.country === "PL" ? "Europe/Warsaw" : "America/New_York";

  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: () => api.listLocations(token!), enabled: Boolean(token) });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.listUsers(token!), enabled: Boolean(token) });
  const managers = (usersQuery.data ?? []).filter((user) => user.role === "MANAGER");

  const [editing, setEditing] = useState<Location | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", timezone: defaultTimezone, manager_user_ids: [] });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (editing === "new") setDraft({ name: "", timezone: defaultTimezone, manager_user_ids: [] });
    else if (editing) setDraft({ name: editing.name, timezone: editing.timezone, manager_user_ids: editing.manager_user_ids ?? [] });
    setConfirmDelete(false);
  }, [editing, defaultTimezone]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["locations"] });
    void queryClient.invalidateQueries({ queryKey: ["subscription"] });
  };
  const handleError = (fallback: string) => (error: unknown) => {
    const message = error instanceof Error ? error.message : undefined;
    toast.error(fallback, message);
    if (message?.includes("Starter")) navigate(UPGRADE_ROUTE);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (editing === "new") {
        const created = await api.createLocation(token!, { name: draft.name.trim(), timezone: draft.timezone });
        if (draft.manager_user_ids.length) await api.patchLocation(token!, created.id, { ...draft, name: draft.name.trim() });
        return;
      }
      if (editing) await api.patchLocation(token!, editing.id, { ...draft, name: draft.name.trim() });
    },
    onSuccess: () => {
      toast.success(t("team.location_saved"));
      setEditing(null);
      refresh();
    },
    onError: handleError(t("team.location_save_failed")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteLocation(token!, id),
    onSuccess: () => {
      toast.success(t("team.location_deleted"));
      setEditing(null);
      refresh();
    },
    onError: handleError(t("team.location_delete_failed")),
  });

  const timezoneOptions = Array.from(new Set([...TIMEZONES, draft.timezone])).map((zone) => ({ value: zone, label: zone.replace("_", " ") }));

  return (
    <div>
      <ListSection header={t("sub.locations")} footer={t("team.locations_footer")}>
        {(locationsQuery.data ?? []).map((location) => (
          <ListRow
            key={location.id}
            onClick={() => setEditing(location)}
            chevron
            leading={
              <span className="grid size-9 place-items-center rounded-[9px] bg-[var(--color-accent)] text-[var(--color-primary-strong)]">
                <MapPin className="size-[18px]" />
              </span>
            }
            title={location.name}
            subtitle={[location.timezone, location.manager_names?.length ? location.manager_names.join(", ") : t("team.no_manager")].join(" · ")}
          />
        ))}
        <ListRow
          onClick={() => setEditing("new")}
          title={
            <span className="inline-flex items-center gap-2 font-semibold text-[var(--color-primary-strong)]">
              <Plus className="size-5" /> {t("team.add_location")}
            </span>
          }
        />
      </ListSection>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? t("team.add_location") : t("team.edit_location")}
        action={{ label: t("common.save"), onClick: () => save.mutate(), disabled: draft.name.trim().length < 2 || save.isPending }}
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("team.location_name")}</span>
            <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder={t("team.location_name_placeholder")} />
          </label>
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("team.timezone")}</span>
            <Select value={draft.timezone} onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} options={timezoneOptions} />
          </div>
          <div>
            <h3 className="ios-section-header pb-2">{t("team.location_managers")}</h3>
            <div className="divide-y divide-[var(--color-separator)] border-y border-[var(--color-separator)]">
              {managers.map((manager) => {
                const selected = draft.manager_user_ids.includes(manager.id);
                return (
                  <div key={manager.id} className="flex min-h-12 items-center justify-between gap-3">
                    <span className="text-[16px] text-black">{manager.full_name}</span>
                    <Switch
                      checked={selected}
                      label={manager.full_name}
                      onChange={(next) =>
                        setDraft((current) => ({
                          ...current,
                          manager_user_ids: next ? [...current.manager_user_ids, manager.id] : current.manager_user_ids.filter((id) => id !== manager.id),
                        }))
                      }
                    />
                  </div>
                );
              })}
              {!managers.length ? <p className="py-3 text-[15px] text-[var(--color-text-muted)]">{t("team.no_managers_yet")}</p> : null}
            </div>
          </div>
          {editing && editing !== "new" ? (
            <div className="border-t border-[var(--color-separator)] pt-4">
              {confirmDelete ? (
                <div className="space-y-3">
                  <p className="text-[15px] text-black">{t("team.delete_location_confirm", { name: editing.name })}</p>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button variant="danger" onClick={() => remove.mutate(editing.id)} disabled={remove.isPending}>
                      <Trash2 className="size-4" /> {t("team.delete_location")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="danger-plain" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" /> {t("team.delete_location")}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}
