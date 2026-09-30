import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { PlatformAction, PlatformBusiness, PlatformLogItem } from "@/lib/types";

type Translate = (key: string, params?: Record<string, string | number>) => string;

const PLAN_TONE = { free: "neutral", standard: "blue", pro: "green", business: "green", enterprise: "green" } as const;

function planLabel(item: PlatformBusiness, t: Translate) {
  const name = item.plan === "standard" ? "Starter" : item.plan === "pro" ? "Pro" : item.plan === "free" ? "Free" : item.plan;
  if (item.status === "trialing") return `${name} · ${t("platform.until_short")}`;
  if (item.status === "past_due") return `${name} · ${t("platform.past_due")}`;
  return name;
}

function endLabel(item: PlatformBusiness, t: Translate, lang: Parameters<typeof formatDate>[1]) {
  const end = item.status === "trialing" ? item.trial_ends_at : item.current_period_ends_at;
  if (item.plan === "free") return t("platform.free_forever");
  if (!end) return item.has_stripe ? t("platform.paying") : t("platform.no_end");
  return t("platform.until", { date: formatDate(end, lang, { year: "numeric", month: "short", day: "numeric" }) });
}

function describe(log: PlatformLogItem, t: Translate) {
  const d = log.detail as Record<string, string | number | undefined>;
  switch (log.action) {
    case "extend":
      return t("platform.log_extend", { days: d.days ?? "" });
    case "set_plan":
      return t("platform.log_set_plan", { plan: String(d.plan ?? ""), days: d.days === "forever" ? t("platform.forever") : `${d.days} d` });
    case "cancel":
      return t("platform.log_cancel");
    case "discount":
      return t("platform.log_discount", { percent: d.percent ?? "", months: d.months ?? "" });
    case "remove_discount":
      return t("platform.log_remove_discount");
    case "note":
      return t("platform.log_note");
    case "delete_business":
      return t("platform.log_delete", { name: log.organization_name });
    default:
      return log.action;
  }
}

/** Platofy-internal: every business, its subscription, and the buttons to change it. */
export function PlatformPage() {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const statsQuery = useQuery({ queryKey: ["platform-stats"], queryFn: () => api.platformStats(token!), enabled: Boolean(token) });
  const listQuery = useQuery({
    queryKey: ["platform-businesses", debounced],
    queryFn: () => api.platformBusinesses(token!, debounced),
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
  });
  const auditQuery = useQuery({ queryKey: ["platform-audit"], queryFn: () => api.platformAudit(token!), enabled: Boolean(token) });

  const stats = statsQuery.data;
  const refreshAll = (withDetail = true) => {
    const keys = ["platform-stats", "platform-businesses", "platform-audit", ...(withDetail ? ["platform-business"] : [])];
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };

  if (statsQuery.isError) {
    return (
      <AppShell title={t("sub.platform")} flush>
        <p className="px-4 py-10 text-center text-[15px] text-[var(--color-text-muted)] sm:px-6">{t("platform.no_access")}</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("sub.platform")} flush>
      <div className="mb-6 grid grid-cols-2 gap-3 px-4 sm:grid-cols-4 sm:px-6 [&>*]:ios-island">
        {[
          [t("platform.businesses"), stats?.businesses],
          [t("platform.paying_count"), stats?.paying],
          [t("platform.trialing_count"), stats?.trialing],
          [t("platform.people"), stats?.people],
        ].map(([label, value]) => (
          <div key={String(label)} className="px-4 py-4">
            <p className="text-[13px] font-semibold text-[var(--color-text-muted)]">{label}</p>
            <p className="mt-1 text-[28px] font-semibold tabular-nums text-black">{value ?? "–"}</p>
          </div>
        ))}
      </div>

      <div className="px-4 pb-3 sm:px-6">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#6c6c70]" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("platform.search")} className="pl-10" />
        </label>
      </div>

      <ListSection>
        {(listQuery.data ?? []).map((item) => (
          <ListRow
            key={item.id}
            onClick={() => setOpenId(item.id)}
            chevron
            title={item.name}
            subtitle={`${item.owners[0] ?? "—"} · ${t("platform.people_locations", { people: item.members, locations: item.locations })}`}
            trailing={<Badge tone={PLAN_TONE[item.plan] ?? "neutral"}>{planLabel(item, t)}</Badge>}
          />
        ))}
        {listQuery.data && !listQuery.data.length ? <ListRow title={<span className="text-[var(--color-text-muted)]">{t("platform.nothing_found")}</span>} /> : null}
      </ListSection>

      <ListSection header={t("platform.recent")}>
        {(auditQuery.data ?? []).slice(0, 15).map((log) => (
          <ListRow
            key={log.id}
            title={`${log.organization_name} — ${describe(log, t)}`}
            subtitle={`${log.actor_email} · ${formatDate(log.created_at, lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
          />
        ))}
        {auditQuery.data && !auditQuery.data.length ? <ListRow title={<span className="text-[var(--color-text-muted)]">{t("platform.no_changes")}</span>} /> : null}
      </ListSection>

      <BusinessSheet
        id={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => refreshAll()}
        onDeleted={() => {
          queryClient.removeQueries({ queryKey: ["platform-business", openId] });
          setOpenId(null);
          refreshAll(false);
          toast.success(t("platform.deleted"));
        }}
      />
    </AppShell>
  );
}

function BusinessSheet({ id, onClose, onChanged, onDeleted }: { id: string | null; onClose: () => void; onChanged: () => void; onDeleted: () => void }) {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const [plan, setPlan] = useState<"standard" | "pro">("pro");
  const [length, setLength] = useState<"30" | "90" | "365" | "forever">("forever");
  const [percent, setPercent] = useState("50");
  const [months, setMonths] = useState("3");
  const [note, setNote] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const detailQuery = useQuery({ queryKey: ["platform-business", id], queryFn: () => api.platformBusiness(token!, id!), enabled: Boolean(token && id) });
  const item = detailQuery.data;

  useEffect(() => {
    setNote(item?.admin_note ?? "");
    setConfirmName("");
    setConfirmDelete(false);
  }, [item?.id, item?.admin_note]);

  const change = useMutation({
    mutationFn: (body: PlatformAction) => api.platformChange(token!, id!, body),
    onSuccess: (result) => {
      const stripeError = (result.detail as { stripe_error?: string }).stripe_error;
      if (stripeError) toast.error(t("platform.stripe_failed"), stripeError);
      else toast.success(t("platform.saved"));
      onChanged();
    },
    onError: (error) => toast.error(t("platform.failed"), error instanceof Error ? error.message : undefined),
  });
  const remove = useMutation({
    mutationFn: () => api.platformDelete(token!, id!, confirmName),
    onSuccess: onDeleted,
    onError: (error) => toast.error(t("platform.failed"), error instanceof Error ? error.message : undefined),
  });

  return (
    <Sheet open={Boolean(id)} onClose={onClose} title={item?.name ?? t("common.loading")} subtitle={item ? item.owners.join(", ") : undefined} size="lg" grouped>
      {item ? (
        <div className="-mx-4 space-y-1 sm:-mx-5">
          <ListSection header={t("platform.subscription")}>
            <ListRow title={t("platform.plan")} trailing={<Badge tone={PLAN_TONE[item.plan] ?? "neutral"}>{planLabel(item, t)}</Badge>} />
            <ListRow title={t("platform.ends")} trailing={endLabel(item, t, lang)} />
            <ListRow title={t("platform.stripe")} trailing={item.has_stripe ? t("platform.stripe_yes") : t("platform.stripe_no")} />
            {item.discount_percent ? (
              <ListRow
                title={t("platform.discount_now", { percent: item.discount_percent, months: item.discount_months ?? 0 })}
                trailing={
                  <Button size="sm" variant="plain" onClick={() => change.mutate({ action: "remove_discount" })} disabled={change.isPending}>
                    {t("platform.remove")}
                  </Button>
                }
              />
            ) : null}
            <ListRow title={t("platform.size")} trailing={t("platform.people_locations", { people: item.members, locations: item.locations })} />
          </ListSection>

          {item.survey && Object.values(item.survey).some(Boolean) ? (
            <ListSection header={t("platform.survey")}>
              {item.survey.business_type ? <ListRow title={t("signup.business_type.title")} trailing={t(`signup.business_type.${item.survey.business_type}`)} /> : null}
              {item.survey.team_size ? <ListRow title={t("signup.team_size.title")} trailing={t(`signup.team_size.${item.survey.team_size}`)} /> : null}
              {item.survey.previous_tool ? <ListRow title={t("signup.previous_tool.title")} trailing={t(`signup.previous_tool.${item.survey.previous_tool}`)} /> : null}
              {item.survey.source ? <ListRow title={t("login.heard_about")} trailing={t(`source.${item.survey.source}`)} /> : null}
            </ListSection>
          ) : null}

          <ListSection header={t("platform.extend")} footer={item.has_stripe ? t("platform.extend_footer_stripe") : t("platform.extend_footer")}>
            <li className="flex flex-wrap gap-2 px-4 py-3 sm:px-6">
              {[7, 14, 30, 90].map((days) => (
                <Button key={days} size="sm" variant="tinted" onClick={() => change.mutate({ action: "extend", days })} disabled={change.isPending}>
                  +{days} {t("platform.days")}
                </Button>
              ))}
            </li>
          </ListSection>

          <ListSection header={t("platform.give_plan")} footer={t("platform.give_plan_footer")}>
            <li className="space-y-3 px-4 py-3 sm:px-6">
              <Segmented className="w-full" ariaLabel={t("platform.plan")} value={plan} onChange={setPlan} options={[{ value: "standard", label: "Starter" }, { value: "pro", label: "Pro" }]} />
              <Segmented
                className="w-full"
                ariaLabel={t("platform.length")}
                value={length}
                onChange={setLength}
                options={[
                  { value: "30", label: `30 ${t("platform.days")}` },
                  { value: "90", label: `90 ${t("platform.days")}` },
                  { value: "365", label: t("platform.year") },
                  { value: "forever", label: t("platform.forever") },
                ]}
              />
              <Button className="w-full" onClick={() => change.mutate({ action: "set_plan", plan, days: length === "forever" ? null : Number(length) })} disabled={change.isPending}>
                {t("platform.apply")}
              </Button>
            </li>
          </ListSection>

          <ListSection header={t("platform.discount")} footer={t("platform.discount_footer")}>
            <li className="flex items-end gap-3 px-4 py-3 sm:px-6">
              <label className="block flex-1">
                <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">%</span>
                <Input inputMode="numeric" value={percent} onChange={(event) => setPercent(event.target.value.replace(/\D/g, "").slice(0, 3))} />
              </label>
              <label className="block flex-1">
                <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-muted)]">{t("platform.months")}</span>
                <Input inputMode="numeric" value={months} onChange={(event) => setMonths(event.target.value.replace(/\D/g, "").slice(0, 2))} />
              </label>
              <Button
                variant="tinted"
                onClick={() => change.mutate({ action: "discount", percent: Number(percent), months: Number(months) })}
                disabled={change.isPending || !(Number(percent) >= 1 && Number(percent) <= 100 && Number(months) >= 1 && Number(months) <= 36)}
              >
                {t("platform.apply")}
              </Button>
            </li>
          </ListSection>

          <ListSection header={t("platform.note")}>
            <li className="flex gap-3 px-4 py-3 sm:px-6">
              <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("platform.note_placeholder")} />
              <Button variant="secondary" onClick={() => change.mutate({ action: "note", note })} disabled={change.isPending || note === (item.admin_note ?? "")}>
                {t("common.save")}
              </Button>
            </li>
          </ListSection>

          <ListSection header={t("platform.danger")}>
            <ListRow
              title={<span className="font-semibold text-[var(--color-danger)]">{t("platform.cancel_sub")}</span>}
              subtitle={t("platform.cancel_sub_hint")}
              onClick={() => change.mutate({ action: "cancel" })}
            />
            {confirmDelete ? (
              <li className="space-y-3 px-4 py-3 sm:px-6">
                <p className="text-[15px] text-black">{t("platform.delete_confirm", { name: item.name })}</p>
                <Input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} placeholder={item.name} />
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button variant="danger" onClick={() => remove.mutate()} disabled={confirmName !== item.name || remove.isPending}>
                    {t("platform.delete")}
                  </Button>
                </div>
              </li>
            ) : (
              <ListRow title={<span className="font-semibold text-[var(--color-danger)]">{t("platform.delete")}</span>} onClick={() => setConfirmDelete(true)} />
            )}
          </ListSection>

          <ListSection header={t("platform.history")}>
            {item.log.map((log) => (
              <ListRow
                key={log.id}
                title={describe(log, t)}
                subtitle={`${log.actor_email} · ${formatDate(log.created_at, lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
              />
            ))}
            {!item.log.length ? <ListRow title={<span className="text-[var(--color-text-muted)]">{t("platform.no_changes")}</span>} /> : null}
          </ListSection>
        </div>
      ) : null}
    </Sheet>
  );
}
