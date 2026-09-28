import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow, ListSection } from "@/components/ui/list";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
      </ListSection>

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
