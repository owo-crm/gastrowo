import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, ClipboardList, Plus, Trash2, UserRound } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fileToDataUrl } from "@/lib/file";
import { useToast } from "@/lib/toast";
import type { Task } from "@/lib/types";

function statusTone(status: "pending" | "done") {
  return status === "done"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-heading)]";
}

export function TasksPage() {
   const { token, me } = useAuth();
   const toast = useToast();
   const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: "", description: "", assigned_to: "", location_id: "" });
  const [photoMap, setPhotoMap] = useState<Record<string, string>>({});
  const [photoNames, setPhotoNames] = useState<Record<string, string>>({});
  const [mobileStatusTab, setMobileStatusTab] = useState<"pending" | "done">("pending");
  const [mobileComposerOpen, setMobileComposerOpen] = useState(false);

  const clearTaskDraft = (taskId: string) => {
    setPhotoMap((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    setPhotoNames((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  };

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
    if (normalizedTaskPayload.title.length < 2) errors.title = "Title must be at least 2 characters.";
    else if (normalizedTaskPayload.title.length > 255) errors.title = "Title must be 255 characters or less.";
    if (normalizedTaskPayload.description.length > 3000) errors.description = "Description must be 3000 characters or less.";
    if (!normalizedTaskPayload.assigned_to) errors.assigned_to = "Choose a worker.";
    else if (!validUserIds.has(normalizedTaskPayload.assigned_to)) errors.assigned_to = "Choose a valid worker.";
    if (normalizedTaskPayload.location_id && !validLocationIds.has(normalizedTaskPayload.location_id)) {
      errors.location_id = "Choose a valid location or leave it empty.";
    }
    return errors;
  }, [normalizedTaskPayload, validLocationIds, validUserIds]);
  const canSubmitTask = Object.keys(taskFormErrors).length === 0;

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
      toast.success("Task created");
      setForm({ title: "", description: "", assigned_to: "", location_id: "" });
      setMobileComposerOpen(false);
      queryClient.setQueryData<Task[]>(["tasks"], (current) => [createdTask, ...(current ?? []).filter((task) => task.id !== createdTask.id)]);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error("Failed to create task", error instanceof Error ? error.message : undefined);
    },
  });
  const patchTaskMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: "pending" | "done" }) => api.patchTask(token!, taskId, status),
    onSuccess: () => {
      toast.success("Task updated");
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error("Failed to update task", error instanceof Error ? error.message : undefined);
    },
  });
  const addPhotoMutation = useMutation({
    mutationFn: ({ taskId, photoUrl }: { taskId: string; photoUrl: string }) => api.addTaskPhoto(token!, taskId, photoUrl),
    onSuccess: () => {
      toast.success("Photo attached");
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      toast.error("Failed to attach photo", error instanceof Error ? error.message : undefined);
    },
  });
  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => api.deleteTask(token!, taskId),
    onSuccess: (_, taskId) => {
      toast.success("Task deleted");
      queryClient.setQueryData<Task[]>(["tasks"], (current) => (current ?? []).filter((task) => task.id !== taskId));
      clearTaskDraft(taskId);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      toast.error("Failed to delete task", error instanceof Error ? error.message : undefined);
    },
  });

  const canCreate = Boolean(me);
  const canDelete = me?.role === "ADMIN" || me?.role === "MANAGER";
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
  const locationNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const location of locationsQuery.data ?? []) map[location.id] = location.name;
    return map;
  }, [locationsQuery.data]);

  if (me?.role === "STAFF") {
    const visibleStaffTasks = tasks.filter((task) => task.assigned_to === me.id || task.created_by === me.id);
    const myPending = visibleStaffTasks.filter((task) => task.status === "pending");
    const myCreated = visibleStaffTasks.filter((task) => task.created_by === me.id && task.assigned_to !== me.id);
    return (
      <AppShell title="Tasks" subtitle="Create tasks and follow only your own or assigned work." action={<Badge>{visibleStaffTasks.length} visible</Badge>}>
        <div className="stagger-grid grid gap-4 xl:grid-cols-[1.05fr_1.95fr]">
        <Card className="bg-[linear-gradient(145deg,rgba(47,111,237,0.08),rgba(255,255,255,1))]">
          <CardHeader>
            <div>
              <CardTitle>Create task</CardTitle>
              <CardDescription>Workers can create tasks, but only see tasks assigned to them or created by them.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Input placeholder="Task title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
              {taskFormErrors.title ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.title}</p> : null}
            </div>
            <div className="space-y-1">
              <Textarea placeholder="What exactly needs to be done?" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
              {taskFormErrors.description ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.description}</p> : null}
            </div>
            <div className="space-y-1">
              <Select
                options={[
                  { label: "Assign to", value: "" },
                  ...((usersQuery.data ?? []).map((user) => ({ label: `${user.full_name} (${user.staff_position ?? user.role})`, value: user.id }))),
                ]}
                value={form.assigned_to}
                onChange={(event) => setForm((current) => ({ ...current, assigned_to: event.target.value }))}
              />
              {taskFormErrors.assigned_to ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.assigned_to}</p> : null}
            </div>
            <div className="space-y-1">
              <Select
                options={[
                  { label: "Location (optional)", value: "" },
                  ...((locationsQuery.data ?? []).map((location) => ({ label: location.name, value: location.id }))),
                ]}
                value={form.location_id}
                onChange={(event) => setForm((current) => ({ ...current, location_id: event.target.value }))}
              />
              {taskFormErrors.location_id ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.location_id}</p> : null}
            </div>
            <Button onClick={submitTask} disabled={!canSubmitTask || createTaskMutation.isPending} className="w-full">
              <Plus className="size-4" /> Create task
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>My visible tasks</CardTitle>
              <CardDescription>Assigned to you or created by you.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {myPending.map((task) => (
              <div key={task.id} className="surface-muted rounded-[1.1rem] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-heading)]">{task.title}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">{task.description}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => patchTaskMutation.mutate({ taskId: task.id, status: "done" })}>
                    Done
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--color-text-muted)]">
                  <span>Assigned: {userNameById[task.assigned_to] ?? "Worker"}</span>
                  {task.created_by && task.created_by !== me.id ? <span>Created by: {userNameById[task.created_by] ?? "Worker"}</span> : null}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                  <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-[0.9rem] border border-[var(--color-border)] bg-white px-3 text-xs text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)]">
                    <Camera className="size-3.5" />
                    {photoNames[task.id] ? `Selected: ${photoNames[task.id]}` : "Choose photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const dataUrl = await fileToDataUrl(file);
                        setPhotoMap((current) => ({ ...current, [task.id]: dataUrl }));
                        setPhotoNames((current) => ({ ...current, [task.id]: file.name }));
                      }}
                    />
                  </label>
                  <Button size="sm" variant="secondary" onClick={() => addPhotoMutation.mutate({ taskId: task.id, photoUrl: photoMap[task.id] ?? "" })} disabled={!photoMap[task.id]}>
                    Upload
                  </Button>
                </div>
              </div>
            ))}
            {!myPending.length ? (
              <div className="rounded-[1.2rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">No active tasks.</div>
            ) : null}
            {myCreated.length ? (
              <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-white px-4 py-4">
                <p className="text-sm font-semibold text-[var(--color-heading)]">Created by you</p>
                <div className="mt-3 space-y-3">
                  {myCreated.map((task) => (
                    <div key={`created-${task.id}`} className="rounded-[0.95rem] border border-[var(--color-divider)] px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--color-heading)]">{task.title}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{task.description}</p>
                        </div>
                        <Badge className={statusTone(task.status)}>{task.status}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--color-text-muted)]">
                        <span>Assigned: {userNameById[task.assigned_to] ?? "Worker"}</span>
                        {task.location_id ? <span>{locationNameById[task.location_id] ?? "Location"}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
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
      title="Tasks"
      subtitle="Assign, complete, and verify operational tasks in one clean workspace."
      action={<Badge>{columns.pending.length} pending</Badge>}
    >
      <div className="stagger-children space-y-4 lg:hidden">
        {canCreate ? (
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1">
              {(["pending", "done"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`rounded-[0.8rem] px-3 py-2 text-sm font-semibold transition ${mobileStatusTab === status ? "bg-white text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}`}
                  onClick={() => setMobileStatusTab(status)}
                >
                  {status === "pending" ? `Pending (${columns.pending.length})` : `Done (${columns.done.length})`}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => setMobileComposerOpen(true)}>
              <Plus className="size-4" /> New
            </Button>
          </div>
        ) : (
          <div className="inline-flex rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1">
            {(["pending", "done"] as const).map((status) => (
              <button
                key={status}
                type="button"
                className={`rounded-[0.8rem] px-3 py-2 text-sm font-semibold transition ${mobileStatusTab === status ? "bg-white text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}`}
                onClick={() => setMobileStatusTab(status)}
              >
                {status === "pending" ? `Pending (${columns.pending.length})` : `Done (${columns.done.length})`}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {mobileTasks.map((task) => {
            const canEditStatus = me?.role !== "STAFF" || task.assigned_to === me?.id;
            const nextStatus = task.status === "pending" ? "done" : "pending";
            const confirmDelete = () => {
              if (!canCreate) return;
              if (!window.confirm(`Delete task "${task.title}"?`)) return;
              deleteTaskMutation.mutate(task.id);
            };

            return (
              <div key={task.id} className="surface-card rounded-[1.2rem] px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold tracking-[-0.03em] text-[var(--color-heading)]">{task.title}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{task.description}</p>
                  </div>
                  <Badge className={statusTone(task.status)}>{task.status}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge>
                    <UserRound className="mr-1 size-3.5" /> {userNameById[task.assigned_to] ?? "Worker"}
                  </Badge>
                  {task.location_id ? <Badge>{locationNameById[task.location_id] ?? "Location"}</Badge> : null}
                </div>

                {task.status === "pending" ? (
                  <div className="mt-4 grid gap-2">
                    <Button variant="secondary" onClick={() => patchTaskMutation.mutate({ taskId: task.id, status: nextStatus })} disabled={!canEditStatus}>
                      Mark done
                    </Button>
                    {canDelete ? (
                      <Button variant="danger" onClick={confirmDelete} disabled={deleteTaskMutation.isPending}>
                        <Trash2 className="size-4" /> Delete
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 grid gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
                      {task.completed_at ? <span>{new Date(task.completed_at).toLocaleDateString()}</span> : null}
                      {task.photos.length ? <span>{task.photos.length} photo{task.photos.length === 1 ? "" : "s"}</span> : null}
                    </div>
                    <Button variant="secondary" onClick={() => patchTaskMutation.mutate({ taskId: task.id, status: nextStatus })} disabled={!canEditStatus}>
                      Return
                    </Button>
                    {canDelete ? (
                      <Button variant="danger" onClick={confirmDelete} disabled={deleteTaskMutation.isPending}>
                        <Trash2 className="size-4" /> Delete
                      </Button>
                    ) : null}
                  </div>
                )}

                {task.status === "pending" ? (
                  <div className="mt-4 grid gap-2">
                    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[0.9rem] border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)]">
                      <Camera className="size-4" />
                      {photoNames[task.id] ? `Selected: ${photoNames[task.id]}` : "Choose photo file"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const dataUrl = await fileToDataUrl(file);
                          setPhotoMap((current) => ({ ...current, [task.id]: dataUrl }));
                          setPhotoNames((current) => ({ ...current, [task.id]: file.name }));
                        }}
                      />
                    </label>
                    <Button variant="secondary" onClick={() => addPhotoMutation.mutate({ taskId: task.id, photoUrl: photoMap[task.id] ?? "" })} disabled={!photoMap[task.id]}>
                      <Camera className="size-4" /> Upload photo
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}

          {!mobileTasks.length ? (
            <div className="rounded-[1.2rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
              No tasks in this column.
            </div>
          ) : null}
        </div>
      </div>

      <div className="hidden gap-5 xl:grid-cols-[1.05fr_1.95fr] lg:grid">
        <aside className="stagger-children space-y-5">
          {me?.role === "ADMIN" || me?.role === "MANAGER" ? (
            <Card className="bg-[linear-gradient(145deg,rgba(47,111,237,0.08),rgba(255,255,255,1))]">
              <CardHeader>
                <div>
                  <CardTitle>Create task</CardTitle>
                  <CardDescription>ADMIN and manager create tasks directly in the flow.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Input placeholder="Task title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                  {taskFormErrors.title ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.title}</p> : null}
                </div>
                <div className="space-y-1">
                  <Textarea placeholder="What exactly needs to be done?" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                  {taskFormErrors.description ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.description}</p> : null}
                </div>
                <div className="space-y-1">
                  <Select
                    options={[
                      { label: "Assign to", value: "" },
                      ...((usersQuery.data ?? []).map((user) => ({ label: `${user.full_name} (${user.role})`, value: user.id }))),
                    ]}
                    value={form.assigned_to}
                    onChange={(event) => setForm((current) => ({ ...current, assigned_to: event.target.value }))}
                  />
                  {taskFormErrors.assigned_to ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.assigned_to}</p> : null}
                </div>
                <div className="space-y-1">
                  <Select
                    className="border-[var(--color-primary)] bg-[var(--color-accent)] text-[var(--color-primary)]"
                    options={[
                      { label: "Location (optional)", value: "" },
                      ...((locationsQuery.data ?? []).map((location) => ({ label: location.name, value: location.id }))),
                    ]}
                    value={form.location_id}
                    onChange={(event) => setForm((current) => ({ ...current, location_id: event.target.value }))}
                  />
                  {taskFormErrors.location_id ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.location_id}</p> : null}
                </div>
                <Button
                  onClick={submitTask}
                  disabled={!canSubmitTask || createTaskMutation.isPending}
                  className="w-full"
                >
                  <Plus className="size-4" /> Create task
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Your execution lane</CardTitle>
                  <CardDescription>Update assigned tasks, attach proof, and keep movement visible.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="surface-muted rounded-[1.3rem] px-4 py-4">
                  <p className="text-sm font-medium text-[var(--color-text-muted)]">Pending</p>
                  <p className="mt-3 text-[2rem] font-semibold tracking-[-0.04em] text-[var(--color-heading)]">{columns.pending.length}</p>
                </div>
                <div className="surface-muted rounded-[1.3rem] px-4 py-4">
                  <p className="text-sm font-medium text-[var(--color-text-muted)]">Done</p>
                  <p className="mt-3 text-[2rem] font-semibold tracking-[-0.04em] text-[var(--color-heading)]">{columns.done.length}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Task status</CardTitle>
                <CardDescription>Simple two-state workflow for MVP.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <div className="surface-muted rounded-[1.3rem] px-4 py-4">
                <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-heading)]">
                  <ClipboardList className="size-4" /> pending
                </div>
              </div>
              <div className="surface-muted rounded-[1.3rem] px-4 py-4">
                <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600">
                  <CheckCircle2 className="size-4" /> done
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        <section className="stagger-grid grid gap-5 lg:grid-cols-2">
          {(["pending", "done"] as const).map((status) => (
            <Card key={status}>
              <CardHeader>
                <div>
                  <CardTitle>{status === "pending" ? "Pending queue" : "Completed"}</CardTitle>
                  <CardDescription>
                    {status === "pending"
                      ? "Tasks waiting for execution by the assigned worker."
                      : "Finished tasks with optional photo evidence."}
                  </CardDescription>
                </div>
                <Badge className={statusTone(status)}>{columns[status].length}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {columns[status].map((task) => {
                  const canEditStatus = me?.role !== "STAFF" || task.assigned_to === me?.id;
                  const nextStatus = task.status === "pending" ? "done" : "pending";
                  const confirmDelete = () => {
                    if (!canCreate) return;
                    if (!window.confirm(`Delete task "${task.title}"?`)) return;
                    deleteTaskMutation.mutate(task.id);
                  };
                  if (status === "done") {
                    return (
                      <div key={task.id} className="rounded-[1rem] border border-[var(--color-border)] bg-white px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--color-heading)]">{task.title}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
                              <span>{userNameById[task.assigned_to] ?? "Worker"}</span>
                              {task.location_id ? <span>{locationNameById[task.location_id] ?? "Location"}</span> : null}
                              {task.completed_at ? <span>{new Date(task.completed_at).toLocaleDateString()}</span> : null}
                              {task.photos.length ? <span>{task.photos.length} photo{task.photos.length === 1 ? "" : "s"}</span> : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => patchTaskMutation.mutate({ taskId: task.id, status: nextStatus })}
                              disabled={!canEditStatus}
                            >
                              Return
                            </Button>
                            {canCreate ? (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={confirmDelete}
                                disabled={deleteTaskMutation.isPending}
                                aria-label="Delete completed task"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={task.id} className="surface-muted rounded-[1.4rem] px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--color-heading)]">{task.title}</p>
                          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{task.description}</p>
                        </div>
                        <Badge className={statusTone(task.status)}>{task.status}</Badge>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge>
                          <UserRound className="mr-1 size-3.5" /> {userNameById[task.assigned_to] ?? "Worker"}
                        </Badge>
                        {task.location_id ? (
                          <Badge>{locationNameById[task.location_id] ?? "Location"}</Badge>
                        ) : null}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => patchTaskMutation.mutate({ taskId: task.id, status: nextStatus })} disabled={!canEditStatus}>
                          {task.status === "pending" ? "Mark done" : "Return to pending"}
                        </Button>
                        {canDelete ? (
                          <Button variant="danger" onClick={confirmDelete} disabled={deleteTaskMutation.isPending}>
                            <Trash2 className="size-4" /> Delete
                          </Button>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[0.9rem] border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)]">
                          <Camera className="size-4" />
                          {photoNames[task.id] ? `Selected: ${photoNames[task.id]}` : "Choose photo file"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              const dataUrl = await fileToDataUrl(file);
                              setPhotoMap((current) => ({ ...current, [task.id]: dataUrl }));
                              setPhotoNames((current) => ({ ...current, [task.id]: file.name }));
                            }}
                          />
                        </label>
                        <Button
                          variant="secondary"
                          onClick={() => addPhotoMutation.mutate({ taskId: task.id, photoUrl: photoMap[task.id] ?? "" })}
                          disabled={!photoMap[task.id]}
                        >
                          <Camera className="size-4" /> Upload photo
                        </Button>
                      </div>

                      {task.photos.length ? (
                        <div className="mt-4 grid gap-2">
                          {task.photos.map((photo) => (
                            <a
                              key={photo.id}
                              href={photo.photo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between rounded-[1rem] border border-[var(--color-border)] bg-white px-3 py-3 text-sm text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)]"
                            >
                              <span>Photo {photo.id.slice(0, 6)}</span>
                              <Camera className="size-4 text-emerald-600" />
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {!columns[status].length ? (
                  <div className="rounded-[1.2rem] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                    No tasks in this column.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      </div>

      {canCreate && mobileComposerOpen ? (
        <div className="mobile-sheet-backdrop lg:hidden">
          <div className="mobile-sheet-panel">
            <div className="flex items-center justify-between border-b border-[var(--color-divider)] px-4 py-4">
              <div>
                <p className="text-lg font-semibold text-[var(--color-heading)]">Create task</p>
                <p className="text-sm text-[var(--color-text-muted)]">Assign and publish directly from mobile.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setMobileComposerOpen(false)}>
                Close
              </Button>
            </div>
            <div className="mobile-sheet-scroll p-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Input placeholder="Task title" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                  {taskFormErrors.title ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.title}</p> : null}
                </div>
                <div className="space-y-1">
                  <Textarea placeholder="What exactly needs to be done?" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                  {taskFormErrors.description ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.description}</p> : null}
                </div>
                <div className="space-y-1">
                  <Select
                    options={[
                      { label: "Assign to", value: "" },
                      ...((usersQuery.data ?? []).map((user) => ({ label: `${user.full_name} (${user.role})`, value: user.id }))),
                    ]}
                    value={form.assigned_to}
                    onChange={(event) => setForm((current) => ({ ...current, assigned_to: event.target.value }))}
                  />
                  {taskFormErrors.assigned_to ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.assigned_to}</p> : null}
                </div>
                <div className="space-y-1">
                  <Select
                    options={[
                      { label: "Location (optional)", value: "" },
                      ...((locationsQuery.data ?? []).map((location) => ({ label: location.name, value: location.id }))),
                    ]}
                    value={form.location_id}
                    onChange={(event) => setForm((current) => ({ ...current, location_id: event.target.value }))}
                  />
                  {taskFormErrors.location_id ? <p className="text-xs text-[var(--color-danger)]">{taskFormErrors.location_id}</p> : null}
                </div>
              </div>
            </div>
            <div className="border-t border-[var(--color-divider)] px-4 py-4">
              <Button
                onClick={submitTask}
                disabled={!canSubmitTask || createTaskMutation.isPending}
                className="w-full"
              >
                <Plus className="size-4" /> Create task
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}




