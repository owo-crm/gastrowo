import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { ChatComposer, ChatMessages } from "@/components/support-chat";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import type { SupportThreadRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Platofy-internal: every customer conversation, newest first; answer right here. */
export function PlatformSupportPage() {
  const { token, me } = useAuth();
  const { t, lang } = useLanguage();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const openId = params.get("thread");

  const threads = useQuery({
    queryKey: ["platform-support", filter],
    queryFn: () => api.supportThreads(token!, filter),
    enabled: Boolean(token && me?.is_platform_admin),
    refetchInterval: 8_000,
    placeholderData: keepPreviousData,
  });

  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("thread", id);
    else next.delete("thread");
    setParams(next, { replace: true });
  };

  if (!me?.is_platform_admin) {
    return (
      <AppShell title={t("support.inbox")}>
        <p className="text-[15px] text-[var(--color-text-muted)]">{t("platform.no_access")}</p>
      </AppShell>
    );
  }

  const rows = threads.data ?? [];

  return (
    <AppShell title={t("support.inbox")} subtitle={t("support.inbox_subtitle")} flush>
      <div className="grid gap-3 px-4 pb-6 sm:px-0 lg:h-[calc(100dvh-10rem)] lg:grid-cols-[340px_1fr]">
        <section className={cn("flex min-h-0 flex-col overflow-hidden rounded-[20px] bg-white", openId && "max-lg:hidden")}>
          <div className="border-b border-[var(--color-separator)] p-3">
            <Segmented
              className="w-full"
              ariaLabel={t("support.filter")}
              value={filter}
              onChange={setFilter}
              options={[
                { value: "open", label: t("support.filter_open") },
                { value: "closed", label: t("support.filter_closed") },
                { value: "all", label: t("support.filter_all") },
              ]}
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="support-threads">
            {rows.map((row) => (
              <ThreadRow key={row.id} row={row} active={row.id === openId} onClick={() => select(row.id)} lang={lang} />
            ))}
            {threads.data && !rows.length ? <li className="px-4 py-10 text-center text-[15px] text-[var(--color-text-muted)]">{t("support.no_threads")}</li> : null}
          </ul>
        </section>
        <section className={cn("flex min-h-[70dvh] flex-col overflow-hidden rounded-[20px] bg-white lg:min-h-0", !openId && "max-lg:hidden")}>
          {openId ? <Conversation id={openId} onBack={() => select(null)} /> : <p className="m-auto p-6 text-[15px] text-[var(--color-text-muted)]">{t("support.pick")}</p>}
        </section>
      </div>
    </AppShell>
  );
}

function ThreadRow({ row, active, onClick, lang }: { row: SupportThreadRow; active: boolean; onClick: () => void; lang: "en" }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn("flex w-full gap-3 border-b border-[var(--color-separator)] px-4 py-3 text-left", active ? "bg-[var(--color-accent)]" : "hover:bg-[var(--color-grouped)]")}
      >
        <span className={cn("mt-2 size-2.5 shrink-0 rounded-full", row.unread ? "bg-[var(--color-primary-strong)]" : "bg-transparent")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-[15px] text-black", row.unread ? "font-bold" : "font-semibold")}>{row.user_name}</span>
            <span className="shrink-0 text-[12px] text-[var(--color-text-muted)]">{formatDate(row.last_message_at, lang, { month: "short", day: "numeric" })}</span>
          </span>
          <span className="block truncate text-[13px] text-[var(--color-text-muted)]">{row.organization_name}</span>
          <span className="mt-0.5 block truncate text-[14px] text-[var(--color-text-tertiary)]">
            {row.last_from_staff ? "You: " : ""}
            {row.last_message}
          </span>
        </span>
      </button>
    </li>
  );
}

function Conversation({ id, onBack }: { id: string; onBack: () => void }) {
  const { token } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const thread = useQuery({
    queryKey: ["platform-support-thread", id],
    queryFn: () => api.supportThread(token!, id),
    enabled: Boolean(token),
    refetchInterval: 4_000,
  });
  const refreshList = () => queryClient.invalidateQueries({ queryKey: ["platform-support"] });

  const reply = useMutation({
    mutationFn: (body: string) => api.replyToSupport(token!, id, body),
    onSuccess: (data) => {
      queryClient.setQueryData(["platform-support-thread", id], data);
      refreshList();
    },
  });
  const status = useMutation({
    mutationFn: (next: "open" | "closed") => api.setSupportStatus(token!, id, next),
    onSuccess: (data) => {
      queryClient.setQueryData(["platform-support-thread", id], data);
      refreshList();
    },
  });

  const data = thread.data;
  return (
    <>
      <div className="flex items-center gap-2 border-b border-[var(--color-separator)] px-3 py-2.5">
        <button type="button" onClick={onBack} className="grid size-9 place-items-center rounded-full text-[var(--color-primary-strong)] lg:hidden" aria-label={t("common.back")}>
          <ChevronLeft className="size-6" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold text-black">{data?.user_name ?? t("common.loading")}</p>
          {data ? (
            <p className="truncate text-[13px] text-[var(--color-text-muted)]">
              {data.organization_name}
              {data.user_email ? (
                <>
                  {" · "}
                  <a href={`mailto:${data.user_email}`} className="text-[var(--color-primary-strong)]">
                    {data.user_email}
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        {data ? (
          <Button size="sm" variant="tinted" disabled={status.isPending} onClick={() => status.mutate(data.status === "open" ? "closed" : "open")}>
            {data.status === "open" ? t("support.close_thread") : t("support.reopen_thread")}
          </Button>
        ) : null}
      </div>
      <ChatMessages messages={data?.messages ?? []} mine="staff" />
      {reply.isError ? <p className="px-4 pb-1 text-[13px] text-[var(--color-danger)]">{reply.error instanceof Error ? reply.error.message : t("support.failed")}</p> : null}
      <ChatComposer key={id} onSend={(body) => reply.mutateAsync(body)} sending={reply.isPending} placeholder={t("support.reply_placeholder")} autoFocus />
    </>
  );
}
