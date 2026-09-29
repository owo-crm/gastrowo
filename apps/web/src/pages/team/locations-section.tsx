import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, MapPin, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
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

  // Reset the form only when a different location opens, so saving the clock-in area keeps unsaved edits.
  const editingKey = editing === "new" ? "new" : (editing?.id ?? null);
  useEffect(() => {
    if (editing === "new") setDraft({ name: "", timezone: defaultTimezone, manager_user_ids: [] });
    else if (editing) setDraft({ name: editing.name, timezone: editing.timezone, manager_user_ids: editing.manager_user_ids ?? [] });
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingKey, defaultTimezone]);

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

  const [radius, setRadius] = useState("150");
  useEffect(() => {
    if (editing && editing !== "new") setRadius(String(editing.clock_radius_m ?? 150));
  }, [editing]);
  const clockArea = useMutation({
    mutationFn: async ({ mode, radiusValue = radius }: { mode: "here" | "off" | "radius"; radiusValue?: string }) => {
      if (!editing || editing === "new") return;
      if (mode === "off") return api.setLocationClockArea(token!, editing.id, { latitude: null, longitude: null, radius_m: Number(radiusValue) });
      // A new radius keeps the saved spot; it only applies once a spot exists.
      if (mode === "radius") {
        if (editing.latitude == null || editing.longitude == null) return;
        return api.setLocationClockArea(token!, editing.id, { latitude: editing.latitude, longitude: editing.longitude, radius_m: Number(radiusValue) });
      }
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!("geolocation" in navigator)) reject(new Error(t("clock.no_geolocation")));
        else navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error(t("team.area_location_denied"))), { enableHighAccuracy: true, timeout: 15000 });
      });
      return api.setLocationClockArea(token!, editing.id, { latitude: position.coords.latitude, longitude: position.coords.longitude, radius_m: Number(radiusValue) });
    },
    onSuccess: async (_data, { mode, radiusValue = radius }) => {
      if (mode === "radius" && editing && editing !== "new" && editing.latitude == null) return;
      toast.success(mode === "here" ? t("team.area_saved") : mode === "radius" ? t("team.area_radius_saved", { radius: radiusValue }) : t("team.area_off"));
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      const fresh = (queryClient.getQueryData<Location[]>(["locations"]) ?? []).find((item) => editing && editing !== "new" && item.id === editing.id);
      if (fresh) setEditing(fresh);
    },
    onError: handleError(t("team.area_failed")),
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
            subtitle={[
              location.timezone,
              location.manager_names?.length ? location.manager_names.join(", ") : t("team.no_manager"),
              location.latitude != null ? t("team.area_on_short", { radius: location.clock_radius_m ?? 150 }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
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
            <div>
              <h3 className="ios-section-header pb-2">{t("team.area_title")}</h3>
              <p className="pb-3 text-[14px] leading-5 text-[var(--color-text-muted)]">
                {editing.latitude != null ? t("team.area_on", { radius: editing.clock_radius_m ?? 150 }) : t("team.area_explain")}
              </p>
              <Segmented
                className="w-full"
                ariaLabel={t("team.area_radius")}
                value={radius}
                onChange={(value) => {
                  setRadius(value);
                  if (editing.latitude != null) clockArea.mutate({ mode: "radius", radiusValue: value });
                }}
                options={[
                  { value: "100", label: "100 m" },
                  { value: "150", label: "150 m" },
                  { value: "300", label: "300 m" },
                  { value: "500", label: "500 m" },
                ]}
              />
              {editing.latitude != null && editing.longitude != null ? (
                <p className="pt-3 text-[14px] text-[var(--color-text-muted)]">
                  {t("team.area_spot")}{" "}
                  <a
                    className="font-semibold text-[var(--color-primary-strong)]"
                    href={`https://www.google.com/maps?q=${editing.latitude},${editing.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {editing.latitude.toFixed(5)}, {editing.longitude.toFixed(5)}
                  </a>
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="tinted" onClick={() => clockArea.mutate({ mode: "here" })} disabled={clockArea.isPending}>
                  <Crosshair className="size-4" /> {editing.latitude != null ? t("team.area_update_here") : t("team.area_set_here")}
                </Button>
                {editing.latitude != null ? (
                  <Button variant="plain" onClick={() => clockArea.mutate({ mode: "off" })} disabled={clockArea.isPending}>
                    {t("team.area_turn_off")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
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
