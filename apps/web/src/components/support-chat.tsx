import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, MessageCircle, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import type { SupportMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Chat with the Platofy team. A round button in the corner of the app opens it; the team answers
 * from Platform → Support. Both sides get a bell notification (and a push) for each new message.
 */

const OPEN_EVENT = "platofy:open-support";
const OPEN_POLL = 4_000;
const IDLE_POLL = 30_000;
/** Pages with their own full-screen job, or outside the app: no chat button there. */
const HIDDEN_ON = ["/", "/login", "/join", "/kiosk", "/demo", "/pending-link", "/terms", "/privacy", "/cookies", "/how-it-works"];

export function openSupportChat() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function timeLabel(value: string, lang: "en") {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : formatDate(date, lang, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The message list, shared by the customer panel and the team inbox. `mine` decides which side is right-aligned. */
export function ChatMessages({ messages, mine, empty }: { messages: SupportMessage[]; mine: "customer" | "staff"; empty?: React.ReactNode }) {
  const { lang } = useLanguage();
  const endRef = useRef<HTMLDivElement | null>(null);
  const last = messages[messages.length - 1]?.id;

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [last]);

  if (!messages.length) return <div className="flex flex-1 items-center justify-center px-6 text-center">{empty}</div>;

  return (
    <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4" data-testid="chat-messages">
      {messages.map((message, index) => {
        const own = (mine === "staff") === message.from_staff;
        const previous = messages[index - 1];
        const firstOfGroup = !previous || previous.from_staff !== message.from_staff;
        return (
          <div key={message.id} className={cn("flex flex-col", own ? "items-end" : "items-start", firstOfGroup && index > 0 && "pt-2")}>
            {firstOfGroup && !own ? <span className="mb-0.5 px-2 text-[12px] font-semibold text-[var(--color-text-muted)]">{message.author_name}</span> : null}
            <div
              className={cn(
                "max-w-[82%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-[15px] leading-[20px]",
                own ? "bg-[var(--color-primary-strong)] text-white" : "bg-[var(--color-fill)] text-black",
              )}
            >
              {message.body}
            </div>
            <span className="mt-0.5 px-2 text-[11px] text-[var(--color-text-muted)]">{timeLabel(message.created_at, lang)}</span>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

/** Message box: Enter sends, Shift+Enter adds a line. */
export function ChatComposer({ onSend, sending, placeholder, autoFocus }: { onSend: (body: string) => Promise<unknown>; sending: boolean; placeholder: string; autoFocus?: boolean }) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }, [text]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    await onSend(body);
    setText("");
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t border-[var(--color-separator)] bg-white p-3">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        autoFocus={autoFocus}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        maxLength={4000}
        aria-label={placeholder}
        className="min-h-10 flex-1 resize-none rounded-[20px] bg-[var(--color-fill)] px-4 py-2.5 text-[15px] leading-5 text-black outline-none placeholder:text-[var(--color-text-muted)]"
      />
      <button
        type="button"
        onClick={() => void send()}
        disabled={!text.trim() || sending}
        aria-label={t("support.send")}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-primary-strong)] text-white disabled:opacity-40"
      >
        <ArrowUp className="size-5" strokeWidth={2.6} />
      </button>
    </div>
  );
}

function SupportPanel({ onClose }: { onClose: () => void }) {
  const { token } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const conversation = useQuery({
    queryKey: ["support", "conversation"],
    queryFn: () => api.supportConversation(token!, true),
    enabled: Boolean(token),
    refetchInterval: OPEN_POLL,
  });
  // Opening the chat reads it: clear the badge.
  useEffect(() => {
    if (conversation.data) queryClient.setQueryData(["support", "unread"], { unread: 0 });
  }, [conversation.data, queryClient]);

  const send = useMutation({
    mutationFn: (body: string) => api.writeToSupport(token!, body),
    onSuccess: (data) => queryClient.setQueryData(["support", "conversation"], data),
  });

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={t("support.title")}
      className="fixed inset-0 z-[260] flex flex-col bg-white pt-[env(safe-area-inset-top)] sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(600px,calc(100dvh-8rem))] sm:w-[380px] sm:overflow-hidden sm:rounded-[24px] sm:pt-0 sm:shadow-[var(--shadow-float)]"
      data-testid="support-panel"
    >
      <div className="flex items-center gap-3 border-b border-[var(--color-separator)] px-4 py-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-primary-strong)] text-[15px] font-bold text-white">P</span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold leading-5 text-black">{t("support.title")}</p>
          <p className="text-[13px] text-[var(--color-text-muted)]">{t("support.subtitle")}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("common.close")} className="grid size-9 place-items-center rounded-full bg-[var(--color-fill)] text-[var(--color-text-muted)]">
          <X className="size-5" />
        </button>
      </div>
      <ChatMessages
        messages={conversation.data?.messages ?? []}
        mine="customer"
        empty={
          conversation.isLoading ? null : (
            <div>
              <p className="text-[17px] font-semibold text-black">{t("support.empty_title")}</p>
              <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">{t("support.empty_body")}</p>
            </div>
          )
        }
      />
      {send.isError ? <p className="px-4 pb-1 text-[13px] text-[var(--color-danger)]">{send.error instanceof Error ? send.error.message : t("support.failed")}</p> : null}
      <div className="pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <ChatComposer onSend={(body) => send.mutateAsync(body)} sending={send.isPending} placeholder={t("support.placeholder")} autoFocus />
      </div>
    </div>
  );
}

/** The round chat button in the corner of the app, with the unread count. */
export function SupportLauncher() {
  const { token, me } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const allowed =
    Boolean(token && me?.is_linked) &&
    !me?.is_sandbox &&
    !me?.is_platform_admin &&
    !HIDDEN_ON.includes(location.pathname);

  const unread = useQuery({
    queryKey: ["support", "unread"],
    queryFn: () => api.supportUnread(token!),
    enabled: allowed && !open,
    refetchInterval: IDLE_POLL,
  });

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  // Notification links open the chat with ?support=1; drop the flag so a reload doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("support") !== "1") return;
    setOpen(true);
    params.delete("support");
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  if (!allowed) return null;
  const count = unread.data?.unread ?? 0;

  return createPortal(
    <>
      {open ? <SupportPanel onClose={() => setOpen(false)} /> : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={count ? t("support.open_unread", { count }) : t("support.open")}
        aria-expanded={open}
        className={cn(
          "fixed right-4 z-[115] grid size-14 place-items-center rounded-full bg-[var(--color-primary-strong)] text-white shadow-[0_10px_30px_rgba(0,122,255,0.35)] transition-transform active:scale-95",
          "bottom-[calc(max(10px,env(safe-area-inset-bottom))+76px)] lg:bottom-6 lg:right-6",
          open && "max-sm:hidden",
        )}
        data-testid="support-launcher"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
        {count && !open ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[12px] font-bold leading-5 text-white ring-2 ring-white">{count}</span>
        ) : null}
      </button>
    </>,
    document.body,
  );
}
