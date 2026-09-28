import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, MailPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { parseTeamTable } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

export function InvitesSection() {
  const { token } = useAuth();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const importRows = parseTeamTable(importText);

  const invitesQuery = useQuery({ queryKey: ["invites"], queryFn: () => api.listInvites(token!), enabled: Boolean(token) });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["invites"] });
    void queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  const send = useMutation({
    mutationFn: (input: { email: string; name?: string }) => api.linkMemberByEmail(token!, input),
    onMutate: () => setError(null),
    onSuccess: (data, input) => {
      if (data.status === "linked") toast.success(t("team.invite_linked"), input.email);
      else if (data.status === "already_member") toast.info(t("team.invite_already_member"), input.email);
      else toast.success(t("team.invite_sent"), input.email);
      setEmail("");
      setName("");
      refresh();
    },
    onError: (err) => setError(err instanceof Error ? err.message : t("team.invite_failed")),
  });
  const importTeam = useMutation({
    mutationFn: () =>
      api.importTeam(token!, importRows.map((row) => ({ email: row.email, name: row.name, position: row.position, rate: row.rate ? Number(row.rate) : undefined }))),
    onSuccess: (result) => {
      toast.success(t("team.import_done", { count: result.invited.length }), result.skipped.length ? t("team.import_skipped", { count: result.skipped.length, reasons: [...new Set(result.skipped.map((item) => t(`team.skip_${item.reason}`)))].join(", ") }) : undefined);
      setImportOpen(false);
      setImportText("");
      refresh();
    },
    onError: (err) => toast.error(t("team.invite_failed"), err instanceof Error ? err.message : undefined),
  });
  const cancel = useMutation({ mutationFn: (inviteId: string) => api.cancelInvite(token!, inviteId), onSuccess: refresh });

  const submit = () => {
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    send.mutate({ email: clean, name: name.trim().length >= 2 ? name.trim() : undefined });
  };

  return (
    <div>
      <ListSection header={t("team.add_worker_title")} footer={t("team.add_by_email_body")}>
        <li className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:px-6">
          <Input type="email" autoComplete="off" placeholder="name@restaurant.com" aria-label={t("login.email")} value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} />
          <Input placeholder={t("team.invite_name_optional")} aria-label={t("login.full_name")} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} />
          <Button onClick={submit} disabled={!email.trim() || send.isPending}>
            <MailPlus className="size-5" /> {t("team.send_invite")}
          </Button>
          {error ? <p className="text-[15px] font-semibold text-[var(--color-danger)] sm:col-span-3">{error}</p> : null}
        </li>
        <ListRow
          leading={<FileSpreadsheet className="size-5 text-[var(--color-primary-strong)]" />}
          title={<span className="font-semibold text-[var(--color-primary-strong)]">{t("team.import_title")}</span>}
          subtitle={t("team.import_hint")}
          chevron
          onClick={() => setImportOpen(true)}
        />
      </ListSection>

      <Sheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t("team.import_title")}
        action={{ label: t("team.import_send", { count: importRows.length }), onClick: () => importTeam.mutate(), disabled: !importRows.length || importTeam.isPending }}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-[15px] leading-6 text-[var(--color-text-muted)]">{t("team.import_explain")}</p>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 text-[15px] font-semibold text-[var(--color-primary-strong)]">
            <FileSpreadsheet className="size-4" /> {t("team.import_choose_file")}
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (file) setImportText(await file.text());
                event.currentTarget.value = "";
              }}
            />
          </label>
          <Textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder={"email,name,position,rate\nana@restaurant.com,Ana Cook,Line cook,21"}
            className="min-h-[140px] font-mono text-[14px]"
          />
          {importRows.length ? (
            <div className="overflow-hidden rounded-2xl border border-[var(--color-separator)]">
              <p className="bg-[var(--color-grouped)] px-3 py-2 text-[13px] font-semibold text-[var(--color-text-muted)]">{t("team.import_preview", { count: importRows.length })}</p>
              <ul className="max-h-[240px] divide-y divide-[var(--color-separator)] overflow-y-auto">
                {importRows.map((row, index) => (
                  <li key={`${row.email}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[14px]">
                    <span className="min-w-0 truncate text-black">
                      {row.name ? `${row.name} · ` : ""}
                      {row.email}
                    </span>
                    <span className="shrink-0 text-[#3c3c43]">{[row.position, row.rate].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Sheet>

      <ListSection header={`${t("team.pending_invites")} (${invitesQuery.data?.length ?? 0})`}>
        {(invitesQuery.data ?? []).map((invite) => (
          <ListRow
            key={invite.id}
            title={invite.email}
            subtitle={t("team.invite_expires", { date: formatDate(invite.expires_at, lang, { month: "short", day: "numeric" }) })}
            trailing={
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => send.mutate({ email: invite.email })} disabled={send.isPending}>
                  {t("team.invite_resend")}
                </Button>
                <Button size="sm" variant="danger-plain" onClick={() => cancel.mutate(invite.id)} disabled={cancel.isPending}>
                  {t("team.invite_cancel")}
                </Button>
              </span>
            }
          />
        ))}
        {!invitesQuery.data?.length ? <ListRow title={<span className="text-[var(--color-text-muted)]">{t("team.no_pending_invites")}</span>} /> : null}
      </ListSection>
    </div>
  );
}
