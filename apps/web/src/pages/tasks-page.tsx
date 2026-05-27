import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Plus, Trash2, X } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatRelativeTimestamp } from "@/lib/date";
import { fileToDataUrl } from "@/lib/file";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { Task } from "@/lib/types";

function taskMetaTone(isDone: boolean) {
  return isDone ? "text-emerald-700" : "text-[var(--color-text-muted)]";
}

function mobileComposerAnimation() {
  return {
    initial: { opacity: 0, y: 72, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 72, scale: 0.985 },
    transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const },
  };
}

const emptyTaskForm = { title: "", description: "", assigned_to: "", location_id: "" };

function TaskComposerFields({
  form,
  setForm,
  taskFormErrors,
  users,
  locations,
  submitTask,
  canSubmitTask,
  isPending,
  t,
  compact = false,
  showSubmitButton = true,
}: {
  form: { title: string; description: string; assigned_to: string; location_id: string };
  setForm: Dispatch<SetStateAction<{ title: string; description: string; assigned_to: string; location_id: string }>>;
  taskFormErrors: Partial<Record<"title" | "description" | "assigned_to" | "location_id", string>>;
  users: Array<{ id: string; full_name: string; role: string; staff_position?: string | null }>;
  locations: Array<{ id: string; name: string }>;
  submitTask: () => void;
  canSubmitTask: boolean;
  isPending: boolean;
  compact?: boolean;
  showSubmitButton?: boolean;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
}) {
  const fieldBlockClass = compact ? "space-y-1" : "space-y-1.5";

  return (
    <div className={compact ? "grid gap-3 xl:grid-cols-[1.15fr_1.7fr_1fr_1fr_auto] xl:items-start" : "space-y-3"}>
      <div className={fieldBlockClass}>
        <Input
          placeholder={t("tasks.title_placeholder")}
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
        />
        {taskFormErrors.title ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.title}</p> : null}
      </div>

      <div className={fieldBlockClass}>
        <Textarea
          placeholder={t("tasks.description_placeholder")}
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          className={compact ? "min-h-[44px] py-2 sm:min-h-[48px] xl:min-h-[44px]" : undefined}
        />
        {taskFormErrors.description ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.description}</p> : null}
      </div>

      <div className={fieldBlockClass}>
        <Select
          options={[
            { label: t("tasks.assign_to"), value: "" },
            ...users.map((user) => ({ label: `${user.full_name} (${user.staff_position ?? user.role})`, value: user.id })),
          ]}
          value={form.assigned_to}
          onChange={(event) => setForm((current) => ({ ...current, assigned_to: event.target.value }))}
        />
        {taskFormErrors.assigned_to ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.assigned_to}</p> : null}
      </div>

      <div className={fieldBlockClass}>
        <Select
          options={[
            { label: t("tasks.location_optional"), value: "" },
            ...locations.map((location) => ({ label: location.name, value: location.id })),
          ]}
          value={form.location_id}
          onChange={(event) => setForm((current) => ({ ...current, location_id: event.target.value }))}
        />
        {taskFormErrors.location_id ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.location_id}</p> : null}
      </div>

      {showSubmitButton ? (
        <Button
          onClick={submitTask}
          disabled={!canSubmitTask || isPending}
          className={compact ? "w-full xl:min-h-[44px] xl:self-start xl:px-5" : "w-full"}
        >
          <Plus className="size-4" /> {t("tasks.create_task")}
        </Button>
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  assignedName,
  createdByName,
  meId,
  canDelete,
  isBusy,
  onToggle,
  pendingDelete,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onPickPhoto,
  t,
}: {
  task: Task;
  assignedName: string;
  createdByName?: string | null;
  meId?: string;
  canDelete: boolean;
  isBusy: boolean;
  onToggle: (task: Task) => void;
  pendingDelete: boolean;
  onDeleteRequest: (task: Task) => void;
  onDeleteConfirm: (task: Task) => void;
  onDeleteCancel: () => void;
  onPickPhoto: (taskId: string, file?: File | null) => Promise<void>;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
}) {
  const canEditStatus = meId ? task.assigned_to === meId || !meId : true;
  const isDone = task.status === "done";
  const metaItems = [
    t("tasks.meta_to", { name: assignedName }),
    createdByName && createdByName !== assignedName ? t("tasks.meta_by", { name: createdByName }) : null,
    t("tasks.created_on", { date: formatRelativeTimestamp(task.created_at, { todayLabel: t("common.today"), yesterdayLabel: t("common.yesterday") }) }),
  ].filter(Boolean);

  return (
    <article className="rounded-[1rem] border border-[var(--color-border)] bg-white px-3.5 py-3 shadow-[0_10px_26px_rgba(15,23,42,0.05)] transition hover:border-[var(--color-primary)]/20 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)] sm:px-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={`pr-2 text-[0.95rem] font-semibold leading-5 ${isDone ? "text-[var(--color-text-muted)] line-through" : "text-[var(--color-heading)]"}`}>{task.title}</h3>
          {task.description ? <p className="mt-1.5 text-[13px] leading-5 text-[var(--color-text-muted)]">{task.description}</p> : null}
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {metaItems.map((item) => (
              <span key={item} className={taskMetaTone(isDone)}>
                {item}
              </span>
            ))}
            {task.photos.length ? <span className={taskMetaTone(isDone)}>{t("tasks.photos_count", { count: task.photos.length })}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1.5">
          {canDelete ? (
            pendingDelete ? (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="danger" onClick={() => onDeleteConfirm(task)} disabled={isBusy}>
                  Confirm delete
                </Button>
                <Button size="sm" variant="ghost" onClick={onDeleteCancel} disabled={isBusy}>
                  {t("common.cancel")}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDeleteRequest(task)}
                disabled={isBusy}
                className="h-8 w-8 rounded-full border border-transparent p-0 text-[var(--color-text-muted)] hover:border-[var(--color-danger)]/20 hover:bg-[var(--color-danger)]/8 hover:text-[var(--color-danger)]"
              >
                <Trash2 className="size-4" />
              </Button>
            )
          ) : null}
          <button
            type="button"
            aria-pressed={isDone}
            aria-label={isDone ? t("tasks.return_to_pending") : t("tasks.mark_done")}
            disabled={!canEditStatus || isBusy}
            onClick={() => onToggle(task)}
            className={`grid h-8 w-8 place-items-center rounded-full border transition ${
              isDone
                ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_10px_18px_rgba(16,185,129,0.22)]"
                : "border-slate-300 bg-white text-slate-300 hover:border-slate-400 hover:text-slate-400"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Check className={`size-4 ${isDone ? "text-white" : "text-slate-500"}`} />
          </button>
        </div>
      </div>

      {!isDone ? (
        <div className="mt-3">
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[0.85rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-xs font-semibold text-[var(--color-heading)] transition hover:bg-white">
            <Camera className="size-4" />
            {t("tasks.add_photo")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                await onPickPhoto(task.id, event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      ) : null}

      {task.photos.length ? (
        <div className="mt-3 grid gap-2">
          {task.photos.map((photo) => (
            <a
              key={photo.id}
              href={photo.photo_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-[0.85rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-[11px] text-[var(--color-text-muted)] transition hover:bg-white"
            >
              <span>{t("tasks.photo_item", { id: photo.id.slice(0, 6) })}</span>
              <Camera className="size-3.5 text-emerald-600" />
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function TasksPage() {
  const { token, me } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyTaskForm);
  const [mobileStatusTab, setMobileStatusTab] = useState<"pending" | "done">("pending");
  const [taskComposerOpen, setTaskComposerOpen] = useState(false);
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState<string | null>(null);

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.listUsers(token!), enabled: Boolean(token) });
  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: () => api.listLocations(token!), enabled: Boolean(token) });
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: () => api.listTasks(token!), enabled: Boolean(token) });

  const validUserIds = useMemo(() => new Set((usersQuery.data ?? []).map((user) => user.id)), [usersQuery.data]);
  const validLocationIds = useMemo(() => new Set((locationsQuery.data ?? []).map((location) => location.id)), [locationsQuery.data]);

  const normalizedTaskPayload = useMemo(() => {
    const title = form.title.trim();
    const description = form.description.trim();
    const assignedTo = form.assigned_to.trim();
    const locationId = form.location_id.trim();
    return {
      title,
      description,
      assigned_to: assignedTo,
      location_id: locationId ? locationId : null,
    };
  }, [form]);

  const taskFormErrors = useMemo(() => {
    const errors: Partial<Record<"title" | "description" | "assigned_to" | "location_id", string>> = {};
    if (normalizedTaskPayload.title.length < 2) errors.title = t("tasks.validation.title_min");
    else if (normalizedTaskPayload.title.length > 255) errors.title = t("tasks.validation.title_max");
    if (normalizedTaskPayload.description.length > 3000) errors.description = t("tasks.validation.description_max");
    if (!normalizedTaskPayload.assigned_to) errors.assigned_to = t("tasks.validation.worker_required");
    else if (!validUserIds.has(normalizedTaskPayload.assigned_to)) errors.assigned_to = t("tasks.validation.worker_invalid");
    if (normalizedTaskPayload.location_id && !validLocationIds.has(normalizedTaskPayload.location_id)) {
      errors.location_id = t("tasks.validation.location_invalid");
    }
    return errors;
  }, [normalizedTaskPayload, t, validLocationIds, validUserIds]);

  const canSubmitTask = Object.keys(taskFormErrors).length === 0;
  const openTaskComposer = () => {
    setForm(emptyTaskForm);
    setTaskComposerOpen(true);
  };
  const closeTaskComposer = () => {
    setTaskComposerOpen(false);
    setForm(emptyTaskForm);
  };
  const submitTask = () => {
    if (!canSubmitTask) return;
    createTaskMutation.mutate();
  };

  const createTaskMutation = useMutation({
    mutationFn: () =>
      api.createTask(token!, {
        title: normalizedTaskPayload.title,
        description: normalizedTaskPayload.description,
        assigned_to: normalizedTaskPayload.assigned_to,
        location_id: normalizedTaskPayload.location_id,
      }),
    onSuccess: (createdTask) => {
      toast.success(t("tasks.task_created"));
      closeTaskComposer();
      queryClient.setQueryData<Task[]>(["tasks"], (current) => [createdTask, ...(current ?? []).filter((task) => task.id !== createdTask.id)]);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error(t("tasks.task_create_failed"), error instanceof Error ? error.message : undefined);
    },
  });

  const patchTaskMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: "pending" | "done" }) => api.patchTask(token!, taskId, status),
    onSuccess: () => {
      toast.success(t("tasks.task_updated"));
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error(t("tasks.task_update_failed"), error instanceof Error ? error.message : undefined);
    },
  });

  const addPhotoMutation = useMutation({
    mutationFn: ({ taskId, photoUrl }: { taskId: string; photoUrl: string }) => api.addTaskPhoto(token!, taskId, photoUrl),
    onSuccess: () => {
      toast.success(t("tasks.photo_attached"));
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      toast.error(t("tasks.photo_attach_failed"), error instanceof Error ? error.message : undefined);
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => api.deleteTask(token!, taskId),
    onSuccess: (_, taskId) => {
      toast.success(t("tasks.task_deleted"));
      setPendingDeleteTaskId((current) => (current === taskId ? null : current));
      queryClient.setQueryData<Task[]>(["tasks"], (current) => (current ?? []).filter((task) => task.id !== taskId));
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setPendingDeleteTaskId(null);
      toast.error(t("tasks.task_delete_failed"), error instanceof Error ? error.message : undefined);
    },
  });

  const handlePhotoPick = async (taskId: string, file?: File | null) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    addPhotoMutation.mutate({ taskId, photoUrl: dataUrl });
  };

  const canCreate = Boolean(me);
  const canDelete = me?.role === "ADMIN" || me?.role === "MANAGER";
  const isStaffView = me?.role === "STAFF";
  const tasks = tasksQuery.data ?? [];
  const columns = useMemo(
    () => ({
      pending: tasks.filter((task) => task.status === "pending"),
      done: tasks.filter((task) => task.status === "done"),
    }),
    [tasks],
  );
  const mobileTasks = columns[mobileStatusTab];

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const user of usersQuery.data ?? []) map[user.id] = user.full_name;
    return map;
  }, [usersQuery.data]);

  const visibleStaffTasks = me?.role === "STAFF" ? tasks.filter((task) => task.assigned_to === me.id || task.created_by === me.id) : [];
  const myPending = visibleStaffTasks.filter((task) => task.status === "pending");
  const myDone = visibleStaffTasks.filter((task) => task.status === "done");

  const requestDelete = (task: Task) => {
    if (!canCreate) return;
    setPendingDeleteTaskId(task.id);
  };

  const confirmDelete = (task: Task) => {
    if (!canCreate) return;
    deleteTaskMutation.mutate(task.id);
  };

  if (isStaffView) {
    return (
      <AppShell
        title={t("tasks.title")}
        subtitle={t("tasks.subtitle.staff")}
        action={
          canCreate ? (
            <Button size="sm" onClick={openTaskComposer}>
              <Plus className="size-4" /> {t("tasks.create_task")}
            </Button>
          ) : (
            <Badge>{`${myPending.length}/${visibleStaffTasks.length}`}</Badge>
          )
        }
        hideBottomNav={taskComposerOpen}
      >
        <div className="stagger-children space-y-4">
          <Card className="min-h-0 overflow-hidden">
            <CardHeader className="border-b border-[var(--color-divider)] pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{t("tasks.my_visible_tasks")}</CardTitle>
                  <CardDescription>{t("tasks.assigned_or_created")}</CardDescription>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
                  <span className="rounded-full bg-[var(--color-warning-soft)] px-2.5 py-1 text-[var(--color-warning-text)]">{myPending.length}</span>
                  <span className="rounded-full bg-[var(--color-success-soft)] px-2.5 py-1 text-[var(--color-success-text)]">{myDone.length}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="max-h-[70vh] space-y-3 overflow-y-auto pr-2">
              {[...myPending, ...myDone].map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  assignedName={userNameById[task.assigned_to] ?? t("common.worker")}
                  createdByName={task.created_by ? userNameById[task.created_by] ?? t("common.worker") : null}
                  meId={me.id}
                  canDelete={canDelete}
                  isBusy={patchTaskMutation.isPending || deleteTaskMutation.isPending || addPhotoMutation.isPending}
                  onToggle={(currentTask) => patchTaskMutation.mutate({ taskId: currentTask.id, status: currentTask.status === "pending" ? "done" : "pending" })}
                  pendingDelete={pendingDeleteTaskId === task.id}
                  onDeleteRequest={requestDelete}
                  onDeleteConfirm={confirmDelete}
                  onDeleteCancel={() => setPendingDeleteTaskId(null)}
                  onPickPhoto={handlePhotoPick}
                  t={t}
                />
              ))}
              {!visibleStaffTasks.length ? (
                <div className="rounded-[1.2rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                  {t("tasks.no_active_tasks")}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("tasks.title")}
      subtitle={t("tasks.subtitle.default")}
      action={
        canCreate ? (
          <Button size="sm" onClick={openTaskComposer}>
            <Plus className="size-4" /> {t("tasks.create_task")}
          </Button>
        ) : (
          <Badge>{columns.pending.length}</Badge>
        )
      }
      hideBottomNav={taskComposerOpen}
    >
      <div className="stagger-children space-y-4 lg:hidden">
        <div className="inline-flex rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1">
          {(["pending", "done"] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={`rounded-[0.8rem] px-3 py-2 text-sm font-semibold transition ${mobileStatusTab === status ? "bg-white text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}`}
              onClick={() => setMobileStatusTab(status)}
            >
              {status === "pending" ? `${t("tasks.pending")} (${columns.pending.length})` : `${t("tasks.done")} (${columns.done.length})`}
            </button>
          ))}
        </div>

        <Card className="min-h-0 overflow-hidden">
          <CardHeader className="border-b border-[var(--color-divider)] pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{mobileStatusTab === "pending" ? t("tasks.pending_queue") : t("tasks.completed")}</CardTitle>
                <CardDescription>{mobileStatusTab === "pending" ? t("tasks.pending_queue_description") : t("tasks.completed_description")}</CardDescription>
              </div>
              <span className="rounded-full bg-[var(--color-surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--color-heading)]">{mobileTasks.length}</span>
            </div>
          </CardHeader>
          <CardContent className="max-h-[68vh] space-y-3 overflow-y-auto pr-1">
            {mobileTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                assignedName={userNameById[task.assigned_to] ?? t("common.worker")}
                createdByName={task.created_by ? userNameById[task.created_by] ?? t("common.worker") : null}
                meId={me?.id}
                canDelete={canDelete}
                isBusy={patchTaskMutation.isPending || deleteTaskMutation.isPending || addPhotoMutation.isPending}
                onToggle={(currentTask) => patchTaskMutation.mutate({ taskId: currentTask.id, status: currentTask.status === "pending" ? "done" : "pending" })}
                pendingDelete={pendingDeleteTaskId === task.id}
                onDeleteRequest={requestDelete}
                onDeleteConfirm={confirmDelete}
                onDeleteCancel={() => setPendingDeleteTaskId(null)}
                onPickPhoto={handlePhotoPick}
                t={t}
              />
            ))}
            {!mobileTasks.length ? (
              <div className="rounded-[1rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                {t("tasks.no_tasks_in_column")}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="hidden min-h-0 gap-5 lg:grid">
        <Card className="min-h-0 overflow-hidden">
          <CardHeader className="border-b border-[var(--color-divider)] pb-3">
            <div>
              <CardTitle>{t("tasks.execution_lane")}</CardTitle>
              <CardDescription>{t("tasks.execution_lane_description")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid min-h-0 gap-4 p-4 xl:grid-cols-2">
            {(["pending", "done"] as const).map((status) => (
              <section key={status} className="min-h-0 overflow-hidden rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)]/55">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-heading)]">{status === "pending" ? t("tasks.pending_queue") : t("tasks.completed")}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{status === "pending" ? t("tasks.pending_queue_description") : t("tasks.completed_description")}</p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-heading)] shadow-[0_8px_18px_rgba(15,23,42,0.06)]">{columns[status].length}</span>
                </div>
                <div className="max-h-[64vh] space-y-3 overflow-y-auto p-3">
                  {columns[status].map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      assignedName={userNameById[task.assigned_to] ?? t("common.worker")}
                      createdByName={task.created_by ? userNameById[task.created_by] ?? t("common.worker") : null}
                      meId={me?.id}
                      canDelete={canDelete}
                      isBusy={patchTaskMutation.isPending || deleteTaskMutation.isPending || addPhotoMutation.isPending}
                      onToggle={(currentTask) => patchTaskMutation.mutate({ taskId: currentTask.id, status: currentTask.status === "pending" ? "done" : "pending" })}
                      pendingDelete={pendingDeleteTaskId === task.id}
                      onDeleteRequest={requestDelete}
                      onDeleteConfirm={confirmDelete}
                      onDeleteCancel={() => setPendingDeleteTaskId(null)}
                      onPickPhoto={handlePhotoPick}
                      t={t}
                    />
                  ))}
                  {!columns[status].length ? (
                    <div className="rounded-[1rem] border border-dashed border-[var(--color-border)] bg-white px-4 py-6 text-sm text-[var(--color-text-muted)]">
                      {t("tasks.no_tasks_in_column")}
                    </div>
                  ) : null}
                </div>
              </section>
            ))}
          </CardContent>
        </Card>
      </div>

      <AnimatePresence>
        {canCreate && taskComposerOpen ? (
          <OverlayPortal>
            <motion.div
              className="fixed inset-0 z-[140] bg-slate-950/42 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={closeTaskComposer}
            >
              <div className="flex h-full w-full flex-col justify-end px-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-16 sm:items-center sm:justify-center sm:p-4">
                <motion.section
                  {...mobileComposerAnimation()}
                  className="flex w-full max-h-[calc(100dvh-5rem-env(safe-area-inset-bottom))] flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-[0_-24px_60px_rgba(15,23,42,0.18)] sm:max-h-[90dvh] sm:max-w-[760px] sm:rounded-[1.6rem] sm:border sm:border-[var(--color-border)] sm:shadow-[0_26px_80px_rgba(15,23,42,0.18)]"
                  role="dialog"
                  aria-modal="true"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-4 sm:px-6 sm:py-5">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-[var(--color-heading)]">{t("tasks.create_task")}</p>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                        {isStaffView ? t("tasks.staff_create_description") : t("tasks.admin_create_description")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]"
                      onClick={closeTaskComposer}
                      aria-label={t("common.close")}
                    >
                      <X className="size-5" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-5 sm:px-6 sm:py-5">
                    <TaskComposerFields
                      form={form}
                      setForm={setForm}
                      taskFormErrors={taskFormErrors}
                      users={usersQuery.data ?? []}
                      locations={locationsQuery.data ?? []}
                      submitTask={submitTask}
                      canSubmitTask={canSubmitTask}
                      isPending={createTaskMutation.isPending}
                      t={t}
                      showSubmitButton={false}
                    />
                  </div>
                  <div className="shrink-0 border-t border-[var(--color-divider)] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 sm:px-6 sm:py-5">
                    <div className="grid gap-2 sm:flex sm:justify-end">
                      <Button variant="secondary" onClick={closeTaskComposer}>
                        {t("common.cancel")}
                      </Button>
                      <Button onClick={submitTask} disabled={!canSubmitTask || createTaskMutation.isPending}>
                        <Plus className="size-4" /> {t("tasks.create_task")}
                      </Button>
                    </div>
                  </div>
                </motion.section>
              </div>
            </motion.div>
          </OverlayPortal>
        ) : null}
      </AnimatePresence>
    </AppShell>
  );
}
