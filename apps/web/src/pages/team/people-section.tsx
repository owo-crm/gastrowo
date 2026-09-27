import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { WorkerAvatar } from "@/components/worker-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getMonday } from "@/lib/date";
import { useLanguage } from "@/lib/i18n";
import type { Role } from "@/lib/types";
import { nextMondayIso, shiftHours } from "@/pages/team/shared";

type Filter = "all" | Role;

export function PeopleSection({ onOpen }: { onOpen: (userId: string) => void }) {
  const { token } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const thisWeek = getMonday();
  const nextWeek = nextMondayIso();

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => api.listUsers(token!), enabled: Boolean(token) });
  const shiftsQuery = useQuery({ queryKey: ["shifts", thisWeek], queryFn: () => api.listShifts(token!, thisWeek), enabled: Boolean(token) });
  const availabilityQuery = useQuery({
    queryKey: ["team-availability-summary", nextWeek],
    queryFn: () => api.getTeamAvailabilitySummary(token!, nextWeek),
    enabled: Boolean(token),
  });

  const hoursByUser = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const shift of shiftsQuery.data ?? []) {
      for (const assignment of shift.assignments) totals[assignment.user_id] = (totals[assignment.user_id] ?? 0) + shiftHours(shift.start_time, shift.end_time);
    }
    return totals;
  }, [shiftsQuery.data]);
  const availabilityByUser = useMemo(() => Object.fromEntries((availabilityQuery.data ?? []).map((row) => [row.user_id, row.status])), [availabilityQuery.data]);

  const users = usersQuery.data ?? [];
  const counts = { all: users.length, STAFF: users.filter((u) => u.role === "STAFF").length, MANAGER: users.filter((u) => u.role === "MANAGER").length, ADMIN: 0 };
  const visible = users
    .filter((user) => filter === "all" || user.role === filter)
    .filter((user) => user.full_name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-separator)] px-4 py-3 sm:px-6">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#3c3c43]" />
          <Input className="pl-9" placeholder={t("team.search")} value={search} onChange={(event) => setSearch(event.target.value)} aria-label={t("team.search")} />
        </div>
        <Segmented
          ariaLabel={t("team.filter")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `${t("team.filter_all")} ${counts.all}` },
            { value: "STAFF", label: `${t("team.filter_staff")} ${counts.STAFF}` },
            { value: "MANAGER", label: `${t("team.filter_managers")} ${counts.MANAGER}` },
          ]}
        />
      </div>

      <ListSection footer={t("team.people_footer")}>
        {visible.map((user) => {
          const positions = user.positions?.length ? user.positions : user.staff_position ? [user.staff_position] : [];
          const needsPosition = user.role !== "ADMIN" && positions.length === 0;
          const availability = availabilityByUser[user.id];
          const hours = hoursByUser[user.id] ?? 0;
          return (
            <ListRow
              key={user.id}
              onClick={() => onOpen(user.id)}
              chevron
              leading={<WorkerAvatar name={user.full_name} size={40} />}
              title={
                <span className="inline-flex items-center gap-2">
                  {user.full_name}
                  {user.role !== "STAFF" ? <Badge tone="blue">{t(`shell.role.${user.role}`)}</Badge> : null}
                </span>
              }
              subtitle={
                needsPosition ? (
                  <span className="font-semibold text-[var(--color-warning)]">{t("team.needs_position")}</span>
                ) : (
                  [
                    positions.join(" · "),
                    user.role === "ADMIN" ? null : availability === "filled" || availability === "approved" ? t("team.availability_sent") : t("team.availability_missing"),
                  ]
                    .filter(Boolean)
                    .join(" — ")
                )
              }
              trailing={user.role === "ADMIN" ? null : `${hours % 1 ? hours.toFixed(1) : hours} / ${user.max_hours_per_week} h`}
            />
          );
        })}
        {!visible.length ? (
          <li className="px-4 py-10 text-center sm:px-6">
            <p className="text-[17px] font-semibold text-black">{users.length ? t("team.no_match") : t("team.empty_title")}</p>
            {!users.length ? (
              <Button className="mt-4" onClick={() => navigate("/team/invites")}>
                <UserPlus className="size-5" /> {t("team.invite_people")}
              </Button>
            ) : null}
          </li>
        ) : null}
      </ListSection>
    </div>
  );
}
