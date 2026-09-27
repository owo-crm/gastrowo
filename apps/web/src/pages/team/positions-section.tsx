import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { WorkerAvatar } from "@/components/worker-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

/** The business's list of positions, and who can work each of them. */
export function PositionsSection({ onOpen }: { onOpen: (userId: string) => void }) {
  const { token } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const positionsQuery = useQuery({ queryKey: ["positions"], queryFn: () => api.listPositions(token!), enabled: Boolean(token) });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.listUsers(token!), enabled: Boolean(token) });

  const peopleByPosition = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const user of usersQuery.data ?? []) {
      for (const position of user.positions ?? (user.staff_position ? [user.staff_position] : [])) {
        (map[position.toLowerCase()] ??= []).push(user.full_name.split(" ")[0]);
      }
    }
    return map;
  }, [usersQuery.data]);

  const create = useMutation({
    mutationFn: () => api.createPosition(token!, name.trim()),
    onSuccess: () => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["positions"] });
    },
    onError: (error) => toast.error(t("team.position_create_failed"), error instanceof Error ? error.message : undefined),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deletePosition(token!, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["positions"] }),
    onError: (error) => toast.error(t("team.position_delete_failed"), error instanceof Error ? error.message : undefined),
  });

  const staff = (usersQuery.data ?? []).filter((user) => user.role !== "ADMIN").sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div>
      <ListSection header={t("team.positions_catalog")} footer={t("team.positions_catalog_footer")}>
        {(positionsQuery.data ?? []).map((position) => {
          const people = peopleByPosition[position.name.toLowerCase()] ?? [];
          return (
            <ListRow
              key={position.id}
              title={position.name}
              subtitle={people.length ? people.join(", ") : t("team.position_nobody")}
              trailing={
                <button
                  type="button"
                  aria-label={t("team.delete_position", { position: position.name })}
                  onClick={() => remove.mutate(position.id)}
                  className="grid size-10 place-items-center rounded-full text-[#3c3c43] hover:bg-[var(--color-danger-fill)] hover:text-[var(--color-danger)]"
                >
                  <Trash2 className="size-[18px]" />
                </button>
              }
            />
          );
        })}
        <li className="flex gap-2 px-4 py-3 sm:px-6">
          <Input
            placeholder={t("team.new_position_placeholder")}
            aria-label={t("team.add_position")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && name.trim().length >= 2 && create.mutate()}
          />
          <Button onClick={() => create.mutate()} disabled={name.trim().length < 2 || create.isPending}>
            <Plus className="size-5" /> {t("team.add_position")}
          </Button>
        </li>
      </ListSection>

      <ListSection header={t("team.who_works_what")} footer={t("team.who_works_what_footer")}>
        {staff.map((user) => {
          const positions = user.positions?.length ? user.positions : user.staff_position ? [user.staff_position] : [];
          return (
            <ListRow
              key={user.id}
              onClick={() => onOpen(user.id)}
              chevron
              leading={<WorkerAvatar name={user.full_name} size={36} />}
              title={user.full_name}
              subtitle={
                positions.length ? (
                  <span>
                    <span className="font-semibold text-black">{positions[0]}</span>
                    {positions.length > 1 ? ` · ${positions.slice(1).join(" · ")}` : ""}
                  </span>
                ) : (
                  <span className="font-semibold text-[var(--color-warning)]">{t("team.needs_position")}</span>
                )
              }
            />
          );
        })}
      </ListSection>
    </div>
  );
}
