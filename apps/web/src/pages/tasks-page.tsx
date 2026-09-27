import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Plus, Trash2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { WorkerAvatar } from "@/components/worker-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListSection } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatRelativeTimestamp } from "@/lib/date";
import { imageFileToDataUrl } from "@/lib/file";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

type Draft = { title: string; description: string; assigned_to: string; location_id: string };
const EMPTY: Draft = { title: "", description: "", assigned_to: "", location_id: "" };

/** Tasks work like iOS Reminders: tap the circle to finish, add a photo as proof. */
export function TasksPage() {
  const { token, me } = useAuth();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"pending" | "done">("pending");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [composer, setComposer] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const isManager = me?.role === "ADMIN" || me?.role === "MANAGER";

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.listUsers(token!), enabled: Boolean(token) });
  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: () => api.listLocations(token!), enabled: Boolean(token) });
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: () => api.listTasks(token!), enabled: Boolean(token) });

  const nameById = useMemo(() => Object.fromEntries((usersQuery.data ?? []).map((user) => [user.id, user.full_name])), [usersQuery.data]);
  const locationById = useMemo(() => Object.fromEntries((locationsQuery.data ?? []).map((location) => [location.id, location.name])), [locationsQuery.data]);

  const all = tasksQuery.data ?? [];
  const scoped = isManager && scope === "all" ? all : all.filter((task) => task.assigned_to === me?.id || task.created_by === me?.id);
  const counts = { pending: scoped.filter((task) => task.status === "pending").length, done: scoped.filter((task) => task.status === "done").length };
  const visible = scoped
    .filter((task) => task.status === status)
    .sort((a, b) => (status === "done" ? (b.completed_at ?? "").localeCompare(a.completed_at ?? "") : b.created_at.localeCompare(a.created_at)));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const create = useMutation({
    mutationFn: () =>
      api.createTask(token!, {
        title: draft.title.trim(),
        description: draft.description.trim(),
        assigned_to: draft.assigned_to,
        location_id: draft.location_id || null,
      }),
    onSuccess: () => {
      toast.success(t("tasks.task_created"));
      setComposer(false);
      setDraft(EMPTY);
      refresh();
    },
    onError: (error) => toast.error(t("tasks.task_create_failed"), error instanceof Error ? error.message : undefined),
  });
  const toggle = useMutation({
    mutationFn: (task: Task) => api.patchTask(token!, task.id, task.status === "done" ? "pending" : "done"),
    onSuccess: refresh,
    onError: (error) => toast.error(t("tasks.task_update_failed"), error instanceof Error ? error.message : undefined),
  });
  const addPhoto = useMutation({
    mutationFn: ({ taskId, photoUrl }: { taskId: string; photoUrl: string }) => api.addTaskPhoto(token!, taskId, photoUrl),
    onSuccess: () => {
      toast.success(t("tasks.photo_attached"));
      refresh();
    },
    onError: (error) => toast.error(t("tasks.photo_attach_failed"), error instanceof Error ? error.message : undefined),
  });
  const remove = useMutation({
    mutationFn: (taskId: string) => api.deleteTask(token!, taskId),
    onSuccess: () => {
      setConfirmDelete(null);
      refresh();
    },
    onError: (error) => toast.error(t("tasks.task_delete_failed"), error instanceof Error ? error.message : undefined),
  });

  const people = (usersQuery.data ?? []).slice().sort((a, b) => a.full_name.localeCompare(b.full_name));
  const openComposer = () => {
    setDraft({ ...EMPTY, assigned_to: isManager ? "" : me?.id ?? "" });
    setComposer(true);
  };
  const valid = draft.title.trim().length >= 2 && Boolean(draft.assigned_to);

  return (
    <AppShell
      title={t("sub.tasks")}
      flush
      action={
        <Button size="sm" onClick={openComposer}>
          <Plus className="size-4" /> {t("tasks.new")}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3 px-4 pb-4 sm:px-6">
        <Segmented
          ariaLabel={t("tasks.status")}
          value={status}
          onChange={setStatus}
          options={[
            { value: "pending", label: `${t("tasks.todo")} ${counts.pending}` },
            { value: "done", label: `${t("tasks.done")} ${counts.done}` },
          ]}
        />
        {isManager ? (
          <Segmented
            ariaLabel={t("tasks.scope")}
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", label: t("tasks.everyone") },
              { value: "mine", label: t("tasks.mine") },
            ]}
          />
        ) : null}
      </div>

      <ListSection>
        {visible.map((task) => {
          const done = task.status === "done";
          const canDelete = isManager || task.created_by === me?.id;
          return (
            <li key={task.id} className="bg-white">
              <div className="flex items-start gap-3 px-4 py-3 sm:px-6">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  aria-label={task.title}
                  onClick={() => toggle.mutate(task)}
                  disabled={toggle.isPending}
                  className="mt-0.5 grid size-11 shrink-0 place-items-center -m-2.5"
                >
                  <span
                    className={cn(
                      "grid size-[26px] place-items-center rounded-full border-2 transition",
                      done ? "border-[var(--color-primary-strong)] bg-[var(--color-primary-strong)] text-white" : "border-[#8e8e93]",
                    )}
                  >
                    {done ? <Check className="size-4" strokeWidth={3} /> : null}
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[17px] leading-6", done ? "text-[#6c6c70] line-through" : "text-black")}>{task.title}</p>
                  {task.description ? <p className="mt-0.5 whitespace-pre-line text-[15px] leading-5 text-[#3c3c43]">{task.description}</p> : null}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-[#3c3c43]">
                    <span className="inline-flex items-center gap-1.5">
                      <WorkerAvatar name={nameById[task.assigned_to] ?? "?"} size={18} />
                      {task.assigned_to === me?.id ? t("tasks.you") : nameById[task.assigned_to] ?? ""}
                    </span>
                    {task.location_id && locationById[task.location_id] ? <span>· {locationById[task.location_id]}</span> : null}
                    <span>
                      ·{" "}
                      {formatRelativeTimestamp(done && task.completed_at ? task.completed_at : task.created_at, {
                        todayLabel: t("common.today"),
                        yesterdayLabel: t("common.yesterday"),
                        locale: lang,
                      })}
                    </span>
                  </p>
                  {task.photos.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {task.photos.map((photo) => (
                        <a key={photo.id} href={photo.photo_url} target="_blank" rel="noreferrer">
                          <img src={photo.photo_url} alt="" className="size-16 rounded-[10px] object-cover" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {confirmDelete === task.id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[14px] text-black">{t("tasks.delete_confirm")}</span>
                      <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(null)}>
                        {t("common.cancel")}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => remove.mutate(task.id)} disabled={remove.isPending}>
                        {t("tasks.delete")}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center">
                  <label className="grid size-10 cursor-pointer place-items-center rounded-full text-[var(--color-primary-strong)] hover:bg-[var(--color-accent)]" aria-label={t("tasks.add_photo")} title={t("tasks.add_photo")}>
                    <Camera className="size-5" />
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={async (event) => {
                        const input = event.currentTarget;
                        const file = input.files?.[0];
                        if (file) addPhoto.mutate({ taskId: task.id, photoUrl: await imageFileToDataUrl(file) });
                        input.value = "";
                      }}
                    />
                  </label>
                  {canDelete ? (
                    <button
                      type="button"
                      aria-label={t("tasks.delete")}
                      onClick={() => setConfirmDelete(task.id)}
                      className="grid size-10 place-items-center rounded-full text-[#3c3c43] hover:bg-[var(--color-danger-fill)] hover:text-[var(--color-danger)]"
                    >
                      <Trash2 className="size-[18px]" />
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
        {!visible.length ? (
          <li className="px-4 py-12 text-center sm:px-6">
            <p className="text-[17px] font-semibold text-black">{status === "pending" ? t("tasks.empty_todo") : t("tasks.empty_done")}</p>
            {status === "pending" ? (
              <Button className="mt-4" onClick={openComposer}>
                <Plus className="size-5" /> {t("tasks.new")}
              </Button>
            ) : null}
          </li>
        ) : null}
      </ListSection>

      <Sheet open={composer} onClose={() => setComposer(false)} title={t("tasks.new")} action={{ label: t("tasks.add"), onClick: () => create.mutate(), disabled: !valid || create.isPending }}>
        <div className="space-y-4">
          <Input autoFocus placeholder={t("tasks.title_placeholder")} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          <Textarea placeholder={t("tasks.description_placeholder")} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("tasks.assign_to")}</span>
            <Select
              value={draft.assigned_to}
              onChange={(event) => setDraft((current) => ({ ...current, assigned_to: event.target.value }))}
              options={[{ value: "", label: t("tasks.pick_person") }, ...people.map((person) => ({ value: person.id, label: person.id === me?.id ? `${person.full_name} (${t("tasks.you")})` : person.full_name }))]}
            />
          </label>
          {(locationsQuery.data ?? []).length > 1 ? (
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("tasks.location_optional")}</span>
              <Select
                value={draft.location_id}
                onChange={(event) => setDraft((current) => ({ ...current, location_id: event.target.value }))}
                options={[{ value: "", label: t("tasks.any_location") }, ...(locationsQuery.data ?? []).map((location) => ({ value: location.id, label: location.name }))]}
              />
            </label>
          ) : null}
        </div>
      </Sheet>
    </AppShell>
  );
}
