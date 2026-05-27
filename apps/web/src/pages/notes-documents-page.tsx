import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  CalendarDays,
  Clock3,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Receipt,
  StickyNote,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { formatRelativeTimestamp } from "@/lib/date";
import { fileToDataUrl } from "@/lib/file";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type WorkspaceRecordType = "note" | "document";

type WorkspaceRecord = {
  id: string;
  title: string;
  description: string;
  author: string;
  type: WorkspaceRecordType;
  created_at: string;
  updated_at: string;
  file_name?: string | null;
  file_data_url?: string | null;
  file_size_bytes?: number | null;
};

type WorkspaceContact = {
  id: string;
  name: string;
  company: string;
  role: string;
  phone: string;
  email: string;
  location: string;
  responseWindow: string;
  note: string;
  created_at: string;
  updated_at: string;
};

type RecordDraft = {
  type: WorkspaceRecordType;
  title: string;
  description: string;
  file_name: string | null;
  file_data_url: string | null;
  file_size_bytes: number | null;
};

type ContactDraft = {
  name: string;
  company: string;
  role: string;
  phone: string;
  email: string;
  location: string;
  responseWindow: string;
  note: string;
};

type StoredWorkspaceNotesState = {
  records?: WorkspaceRecord[];
  contacts?: WorkspaceContact[];
};

type EditorModalState =
  | { kind: "record"; mode: "create" | "edit" }
  | { kind: "contact"; mode: "create" | "edit" }
  | null;

const STORAGE_PREFIX = "gastrowo.documents-contacts";
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

const contactToneClasses = [
  "bg-emerald-50 text-emerald-700",
  "bg-sky-50 text-sky-700",
  "bg-amber-50 text-amber-700",
  "bg-fuchsia-50 text-fuchsia-700",
];

const defaultRecords: WorkspaceRecord[] = [
  {
    id: "bulk-order",
    title: "Bulk order discount",
    description: "Vendor offers 5% above 5,000 PLN. Best used for monthly produce consolidation.",
    author: "Marta Manager",
    type: "note",
    created_at: "2026-05-12T11:00:00.000Z",
    updated_at: "2026-05-12T11:00:00.000Z",
  },
  {
    id: "vendor-note",
    title: "Preferred vendor note",
    description: "Primary supplier for raw ingredients. Standard lead time remains two to three business days.",
    author: "Admin",
    type: "note",
    created_at: "2026-05-09T13:45:00.000Z",
    updated_at: "2026-05-09T13:45:00.000Z",
  },
  {
    id: "agreement",
    title: "Agreement.pdf",
    description: "Kitchen equipment maintenance agreement. Renewal terms should be reviewed before next month.",
    author: "Admin",
    type: "document",
    created_at: "2026-04-28T10:00:00.000Z",
    updated_at: "2026-04-28T10:00:00.000Z",
    file_name: "Agreement.pdf",
    file_data_url: null,
    file_size_bytes: null,
  },
];

const defaultContacts: WorkspaceContact[] = [
  {
    id: "green-farm",
    name: "Monika Zielinska",
    company: "Green Farm Supply",
    role: "Produce vendor",
    phone: "+48 602 442 181",
    email: "orders@greenfarm.pl",
    location: "Old Town + Riverside",
    responseWindow: "06:00 - 14:00",
    note: "Best contact for same-day vegetable shortages and Monday bulk ordering.",
    created_at: "2026-05-12T06:00:00.000Z",
    updated_at: "2026-05-12T06:00:00.000Z",
  },
  {
    id: "fixline",
    name: "Pawel Krawiec",
    company: "Fixline Service",
    role: "Equipment support",
    phone: "+48 511 090 332",
    email: "service@fixline.eu",
    location: "All kitchens",
    responseWindow: "24/7 emergency",
    note: "Use for refrigeration and oven outages. Mention contract code WD-91.",
    created_at: "2026-05-11T14:00:00.000Z",
    updated_at: "2026-05-11T14:00:00.000Z",
  },
  {
    id: "amber-pay",
    name: "Karolina Maj",
    company: "Amber Pay",
    role: "Finance contact",
    phone: "+48 606 311 027",
    email: "settlements@amberpay.com",
    location: "HQ",
    responseWindow: "09:00 - 17:00",
    note: "Handles terminal settlements and payout timing for card transactions.",
    created_at: "2026-05-10T09:00:00.000Z",
    updated_at: "2026-05-10T09:00:00.000Z",
  },
];

function storageKey(organizationId?: string | null) {
  return `${STORAGE_PREFIX}.${organizationId ?? "personal"}`;
}

function emptyRecordDraft(nextType: WorkspaceRecordType = "note"): RecordDraft {
  return {
    type: nextType,
    title: "",
    description: "",
    file_name: null,
    file_data_url: null,
    file_size_bytes: null,
  };
}

function emptyContactDraft(): ContactDraft {
  return {
    name: "",
    company: "",
    role: "",
    phone: "",
    email: "",
    location: "",
    responseWindow: "",
    note: "",
  };
}

function recordIcon(type: WorkspaceRecordType) {
  return type === "document" ? FileText : StickyNote;
}

function recordToneClass(type: WorkspaceRecordType) {
  return type === "document" ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700";
}

function contactToneClass(index: number) {
  return contactToneClasses[index % contactToneClasses.length];
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function readStoredWorkspaceState(nextKey: string): StoredWorkspaceNotesState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(nextKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredWorkspaceNotesState;
  } catch {
    return null;
  }
}

function fallbackNoteTitle(description: string) {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > 42 ? `${normalized.slice(0, 42).trimEnd()}...` : normalized;
}

function contactDisplayName(contact: WorkspaceContact) {
  return contact.name || contact.company || contact.email || contact.phone || "Unnamed contact";
}

function contactRoleLabel(contact: WorkspaceContact) {
  return contact.role || "Business contact";
}

function closeModalAnimation() {
  return {
    initial: { opacity: 0, y: 72, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 72, scale: 0.985 },
    transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const },
  };
}

export function NotesDocumentsPage() {
  const { t, lang } = useLanguage();
  const { me } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<"records" | "contacts">("records");
  const [records, setRecords] = useState<WorkspaceRecord[]>(defaultRecords);
  const [contacts, setContacts] = useState<WorkspaceContact[]>(defaultContacts);
  const [recordDraft, setRecordDraft] = useState<RecordDraft>(emptyRecordDraft());
  const [contactDraft, setContactDraft] = useState<ContactDraft>(emptyContactDraft());
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [pendingRecordDeleteId, setPendingRecordDeleteId] = useState<string | null>(null);
  const [pendingContactDeleteId, setPendingContactDeleteId] = useState<string | null>(null);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [editorModal, setEditorModal] = useState<EditorModalState>(null);

  const currentWorkspaceKey = useMemo(() => storageKey(me?.active_organization_id), [me?.active_organization_id]);
  const workspaceName = me?.active_organization_name ?? "this workspace";

  useEffect(() => {
    setStorageHydrated(false);
    setEditingRecordId(null);
    setEditingContactId(null);
    setPendingRecordDeleteId(null);
    setPendingContactDeleteId(null);
    setEditorModal(null);
    setRecordDraft(emptyRecordDraft());
    setContactDraft(emptyContactDraft());

    const stored = readStoredWorkspaceState(currentWorkspaceKey);
    setRecords(Array.isArray(stored?.records) ? stored.records : defaultRecords);
    setContacts(Array.isArray(stored?.contacts) ? stored.contacts : defaultContacts);
    setStorageHydrated(true);
  }, [currentWorkspaceKey]);

  useEffect(() => {
    if (!storageHydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(currentWorkspaceKey, JSON.stringify({ records, contacts }));
    } catch {
      toast.error("Failed to save locally", "Browser storage is full or unavailable.");
    }
  }, [contacts, currentWorkspaceKey, records, storageHydrated, toast]);

  useEffect(() => {
    if (!editorModal || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEditorModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editorModal]);

  const tabs = useMemo(
    () => [
      { key: "records" as const, label: t("notes.tab_notes_documents"), icon: Receipt },
      { key: "contacts" as const, label: t("notes.tab_contacts"), icon: Phone },
    ],
    [t],
  );

  const sortedRecords = useMemo(
    () => [...records].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()),
    [records],
  );
  const sortedContacts = useMemo(
    () => [...contacts].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()),
    [contacts],
  );

  const resetRecordDraft = () => {
    setEditingRecordId(null);
    setRecordDraft(emptyRecordDraft());
  };

  const resetContactDraft = () => {
    setEditingContactId(null);
    setContactDraft(emptyContactDraft());
  };

  const closeEditorModal = () => {
    setEditorModal(null);
    setIsUploadingAttachment(false);
    resetRecordDraft();
    resetContactDraft();
  };

  const openRecordCreateModal = (nextType: WorkspaceRecordType = "note") => {
    setPendingRecordDeleteId(null);
    setPendingContactDeleteId(null);
    setEditingRecordId(null);
    setRecordDraft(emptyRecordDraft(nextType));
    setEditorModal({ kind: "record", mode: "create" });
  };

  const openRecordEditModal = (record: WorkspaceRecord) => {
    setPendingRecordDeleteId(null);
    setPendingContactDeleteId(null);
    setEditingRecordId(record.id);
    setRecordDraft({
      type: record.type,
      title: record.title,
      description: record.description,
      file_name: record.file_name ?? null,
      file_data_url: record.file_data_url ?? null,
      file_size_bytes: record.file_size_bytes ?? null,
    });
    setEditorModal({ kind: "record", mode: "edit" });
  };

  const openContactCreateModal = () => {
    setPendingRecordDeleteId(null);
    setPendingContactDeleteId(null);
    setEditingContactId(null);
    setContactDraft(emptyContactDraft());
    setEditorModal({ kind: "contact", mode: "create" });
  };

  const openContactEditModal = (contact: WorkspaceContact) => {
    setPendingRecordDeleteId(null);
    setPendingContactDeleteId(null);
    setEditingContactId(contact.id);
    setContactDraft({
      name: contact.name,
      company: contact.company,
      role: contact.role,
      phone: contact.phone,
      email: contact.email,
      location: contact.location,
      responseWindow: contact.responseWindow,
      note: contact.note,
    });
    setEditorModal({ kind: "contact", mode: "edit" });
  };

  const handleAttachmentSelected = async (file?: File | null) => {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("File is too large", "Keep document attachments under 2 MB for browser-local storage.");
      return;
    }
    setIsUploadingAttachment(true);
    try {
      const fileDataUrl = await fileToDataUrl(file);
      setRecordDraft((current) => ({
        ...current,
        type: "document",
        title: current.title || file.name,
        file_name: file.name,
        file_data_url: fileDataUrl,
        file_size_bytes: file.size,
      }));
      toast.success("Attachment added", file.name);
    } catch (error) {
      toast.error("Failed to read file", error instanceof Error ? error.message : undefined);
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const saveRecord = () => {
    const description = recordDraft.description.trim();
    const normalizedTitle =
      recordDraft.title.trim() ||
      (recordDraft.type === "document" ? recordDraft.file_name?.trim() || "Untitled document" : fallbackNoteTitle(description));

    if (recordDraft.type === "document" && !recordDraft.file_data_url) {
      toast.error("Document needs a file", "Upload a file before saving the document card.");
      return;
    }
    if (recordDraft.type === "note" && !normalizedTitle) {
      toast.error("Add a title or note body", "A note needs at least some visible text.");
      return;
    }

    const nowIso = new Date().toISOString();
    const author = me?.full_name?.trim() || me?.email || "Workspace member";

    if (editingRecordId) {
      setRecords((current) =>
        current.map((item) =>
          item.id === editingRecordId
            ? {
                ...item,
                title: normalizedTitle,
                description,
                type: recordDraft.type,
                updated_at: nowIso,
                file_name: recordDraft.type === "document" ? recordDraft.file_name : null,
                file_data_url: recordDraft.type === "document" ? recordDraft.file_data_url : null,
                file_size_bytes: recordDraft.type === "document" ? recordDraft.file_size_bytes : null,
              }
            : item,
        ),
      );
      toast.success("Record updated");
    } else {
      setRecords((current) => [
        {
          id: crypto.randomUUID(),
          title: normalizedTitle,
          description,
          author,
          type: recordDraft.type,
          created_at: nowIso,
          updated_at: nowIso,
          file_name: recordDraft.type === "document" ? recordDraft.file_name : null,
          file_data_url: recordDraft.type === "document" ? recordDraft.file_data_url : null,
          file_size_bytes: recordDraft.type === "document" ? recordDraft.file_size_bytes : null,
        },
        ...current,
      ]);
      toast.success(recordDraft.type === "document" ? "Document added" : "Note added");
    }

    closeEditorModal();
  };

  const saveContact = () => {
    const name = contactDraft.name.trim();
    const company = contactDraft.company.trim();
    const phone = contactDraft.phone.trim();
    const email = contactDraft.email.trim();
    const location = contactDraft.location.trim();
    const responseWindow = contactDraft.responseWindow.trim();
    const role = contactDraft.role.trim();
    const note = contactDraft.note.trim();

    if (![name, company, phone, email].some(Boolean)) {
      toast.error("Add at least one contact detail", "Name, company, email, or phone should be filled so the card has something useful to show.");
      return;
    }

    const nowIso = new Date().toISOString();
    const nextContact: WorkspaceContact = {
      id: editingContactId ?? crypto.randomUUID(),
      name,
      company,
      role,
      phone,
      email,
      location,
      responseWindow,
      note,
      created_at: editingContactId ? contacts.find((item) => item.id === editingContactId)?.created_at ?? nowIso : nowIso,
      updated_at: nowIso,
    };

    if (editingContactId) {
      setContacts((current) => current.map((item) => (item.id === editingContactId ? nextContact : item)));
      toast.success("Contact updated");
    } else {
      setContacts((current) => [nextContact, ...current]);
      toast.success("Contact added");
    }

    closeEditorModal();
  };

  const deleteRecord = (record: WorkspaceRecord) => {
    setRecords((current) => current.filter((item) => item.id !== record.id));
    if (editingRecordId === record.id) closeEditorModal();
    setPendingRecordDeleteId(null);
    toast.success("Record deleted");
  };

  const deleteContact = (contact: WorkspaceContact) => {
    setContacts((current) => current.filter((item) => item.id !== contact.id));
    if (editingContactId === contact.id) closeEditorModal();
    setPendingContactDeleteId(null);
    toast.success("Contact deleted");
  };

  const renderRecordEditor = () => (
    <div className="space-y-4">
      <div className="inline-flex rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1">
        {([
          { key: "note", label: "Note", icon: StickyNote },
          { key: "document", label: "Document", icon: FileText },
        ] as const).map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() =>
              setRecordDraft((current) => ({
                ...current,
                type: option.key,
                ...(option.key === "note"
                  ? {
                      file_name: null,
                      file_data_url: null,
                      file_size_bytes: null,
                    }
                  : {}),
              }))
            }
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-[0.8rem] px-4 py-2 text-sm font-semibold transition",
              recordDraft.type === option.key ? "bg-white text-[var(--color-primary)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-heading)]",
            )}
          >
            <option.icon className="size-4" />
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        <Input
          placeholder={recordDraft.type === "document" ? "Title (optional if file name is enough)" : "Title"}
          value={recordDraft.title}
          onChange={(event) => setRecordDraft((current) => ({ ...current, title: event.target.value }))}
        />
        <Textarea
          placeholder={recordDraft.type === "document" ? "Description (optional)" : "Write the note the team should remember"}
          value={recordDraft.description}
          onChange={(event) => setRecordDraft((current) => ({ ...current, description: event.target.value }))}
        />
      </div>

      {recordDraft.type === "document" ? (
        <div className="rounded-[1rem] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-heading)]">{recordDraft.file_name ?? "No file selected yet"}</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {recordDraft.file_size_bytes ? `${formatBytes(recordDraft.file_size_bytes)} stored locally in this browser` : "Upload PDF, image, or document file up to 2 MB."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl2 border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-heading)] transition hover:bg-[var(--color-surface-muted)]">
                <Upload className="size-4" />
                {recordDraft.file_name ? "Replace file" : "Upload file"}
                <input
                  type="file"
                  className="hidden"
                  onChange={async (event) => {
                    await handleAttachmentSelected(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {recordDraft.file_name ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRecordDraft((current) => ({ ...current, file_name: null, file_data_url: null, file_size_bytes: null }))}
                >
                  Remove file
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  const renderContactEditor = () => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input placeholder="Full name" value={contactDraft.name} onChange={(event) => setContactDraft((current) => ({ ...current, name: event.target.value }))} />
      <Input placeholder="Company (optional)" value={contactDraft.company} onChange={(event) => setContactDraft((current) => ({ ...current, company: event.target.value }))} />
      <Input placeholder="Role or responsibility (optional)" value={contactDraft.role} onChange={(event) => setContactDraft((current) => ({ ...current, role: event.target.value }))} />
      <Input placeholder="Location or team (optional)" value={contactDraft.location} onChange={(event) => setContactDraft((current) => ({ ...current, location: event.target.value }))} />
      <Input type="tel" placeholder="Phone (optional)" value={contactDraft.phone} onChange={(event) => setContactDraft((current) => ({ ...current, phone: event.target.value }))} />
      <Input type="email" placeholder="Email (optional)" value={contactDraft.email} onChange={(event) => setContactDraft((current) => ({ ...current, email: event.target.value }))} />
      <Input
        className="sm:col-span-2"
        placeholder="Response window or availability (optional)"
        value={contactDraft.responseWindow}
        onChange={(event) => setContactDraft((current) => ({ ...current, responseWindow: event.target.value }))}
      />
      <Textarea
        className="sm:col-span-2"
        placeholder="Operational note, escalation path, or contract detail (optional)"
        value={contactDraft.note}
        onChange={(event) => setContactDraft((current) => ({ ...current, note: event.target.value }))}
      />
    </div>
  );

  return (
    <AppShell
      title={t("notes.title")}
      subtitle={t("notes.subtitle")}
      hideBottomNav={Boolean(editorModal)}
    >
      <div className="space-y-5">
        <div className="inline-flex flex-wrap items-center gap-2 rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-[0.9rem] px-4 py-2 text-sm font-semibold transition",
                activeTab === tab.key ? "bg-white text-[var(--color-primary)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-heading)]",
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "records" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => openRecordCreateModal("note")}>
                <Plus className="size-4" />
                New note
              </Button>
              <Button variant="secondary" onClick={() => openRecordCreateModal("document")}>
                <Upload className="size-4" />
                New document
              </Button>
            </div>
            <section className="space-y-4">
              {sortedRecords.length ? (
                sortedRecords.map((item) => {
                  const Icon = recordIcon(item.type);
                  return (
                    <article
                      key={item.id}
                      className="overflow-hidden rounded-[1.35rem] border border-[var(--color-border)] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.06)]"
                    >
                      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-4">
                          <div className={cn("grid size-12 shrink-0 place-items-center rounded-[1rem]", recordToneClass(item.type))}>
                            <Icon className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-bold tracking-[-0.03em] text-[var(--color-heading)]">{item.title}</h3>
                              <Badge className={cn("border-transparent", item.type === "document" ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700")}>
                                {item.type === "document" ? "Document" : "Note"}
                              </Badge>
                              {item.file_size_bytes ? <Badge className="border-slate-200 bg-slate-100 text-slate-700">{formatBytes(item.file_size_bytes)}</Badge> : null}
                            </div>
                            {item.description ? <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{item.description}</p> : null}
                            {item.type === "document" && item.file_data_url ? (
                              <a
                                href={item.file_data_url}
                                download={item.file_name ?? item.title}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-[var(--color-heading)] transition hover:bg-white"
                              >
                                <FileText className="size-4 text-[var(--color-primary)]" />
                                Open attachment
                              </a>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openRecordEditModal(item)}>
                            <Pencil className="size-4" />
                            {t("common.edit")}
                          </Button>
                          {pendingRecordDeleteId === item.id ? (
                            <>
                              <Button variant="danger" size="sm" onClick={() => deleteRecord(item)}>
                                <Trash2 className="size-4" />
                                Confirm delete
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setPendingRecordDeleteId(null)}>
                                {t("common.cancel")}
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"
                              onClick={() => {
                                setPendingRecordDeleteId(item.id);
                                setPendingContactDeleteId(null);
                              }}
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-divider)] px-5 py-3 text-sm text-[var(--color-text-muted)]">
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound className="size-4" /> {item.author}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="size-4" />{" "}
                          {formatRelativeTimestamp(item.updated_at, {
                            todayLabel: t("common.today"),
                            yesterdayLabel: t("common.yesterday"),
                            locale: lang,
                          })}
                        </span>
                      </div>
                    </article>
                  );
                })
              ) : (
                <Card>
                  <CardContent className="p-6">
                    <p className="text-sm text-[var(--color-text-muted)]">No notes or documents yet. Use the buttons above to create the first one.</p>
                  </CardContent>
                </Card>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={openContactCreateModal}>
                <Plus className="size-4" />
                New contact
              </Button>
            </div>
            <section className="grid gap-4 md:grid-cols-2">
              {sortedContacts.length ? (
                sortedContacts.map((contact, index) => (
                  <Card key={contact.id} className="overflow-hidden border border-[var(--color-border)] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-lg font-bold tracking-[-0.03em] text-[var(--color-heading)]">{contactDisplayName(contact)}</p>
                          <p className="mt-1 text-sm font-medium text-[var(--color-text-muted)]">{contactRoleLabel(contact)}</p>
                          {contact.company && contact.company !== contactDisplayName(contact) ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">{contact.company}</p> : null}
                        </div>
                        <div className={cn("grid size-11 shrink-0 place-items-center rounded-[1rem]", contactToneClass(index))}>
                          <Phone className="size-5" />
                        </div>
                      </div>

                      <div className="grid gap-2 text-sm text-[var(--color-text-muted)]">
                        {contact.phone ? (
                          <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-2 hover:text-[var(--color-heading)]">
                            <Phone className="size-4 text-[var(--color-primary)]" />
                            {contact.phone}
                          </a>
                        ) : null}
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-2 hover:text-[var(--color-heading)]">
                            <Mail className="size-4 text-[var(--color-primary)]" />
                            {contact.email}
                          </a>
                        ) : null}
                        {contact.location ? (
                          <p className="inline-flex items-center gap-2">
                            <MapPin className="size-4 text-[var(--color-primary)]" />
                            {contact.location}
                          </p>
                        ) : null}
                        {contact.responseWindow ? (
                          <p className="inline-flex items-center gap-2">
                            <Clock3 className="size-4 text-[var(--color-primary)]" />
                            {contact.responseWindow}
                          </p>
                        ) : null}
                      </div>

                      {contact.note ? (
                        <div className="rounded-[1rem] bg-[var(--color-surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--color-text-muted)]">
                          {contact.note}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-divider)] pt-3 text-xs text-[var(--color-text-muted)]">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="size-3.5" />
                          {formatRelativeTimestamp(contact.updated_at, {
                            todayLabel: t("common.today"),
                            yesterdayLabel: t("common.yesterday"),
                            locale: lang,
                          })}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openContactEditModal(contact)}>
                            <Pencil className="size-4" />
                            {t("common.edit")}
                          </Button>
                          {pendingContactDeleteId === contact.id ? (
                            <>
                              <Button variant="danger" size="sm" onClick={() => deleteContact(contact)}>
                                <Trash2 className="size-4" />
                                Confirm delete
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setPendingContactDeleteId(null)}>
                                {t("common.cancel")}
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"
                              onClick={() => {
                                setPendingContactDeleteId(contact.id);
                                setPendingRecordDeleteId(null);
                              }}
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="md:col-span-2">
                  <CardContent className="p-6">
                    <p className="text-sm text-[var(--color-text-muted)]">No contacts yet. Use the button above to add the first one.</p>
                  </CardContent>
                </Card>
              )}
            </section>
          </div>
        )}
      </div>

      <AnimatePresence>
        {editorModal ? (
          <OverlayPortal>
            <motion.div
              className="fixed inset-0 z-[140] bg-slate-950/42 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={closeEditorModal}
            >
              <div className="flex h-full w-full flex-col justify-end px-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-16 sm:items-center sm:justify-center sm:p-4">
                <motion.section
                  {...closeModalAnimation()}
                  className="flex w-full max-h-[calc(100dvh-5rem-env(safe-area-inset-bottom))] flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-[0_-24px_60px_rgba(15,23,42,0.18)] sm:max-h-[90dvh] sm:max-w-[760px] sm:rounded-[1.6rem] sm:border sm:border-[var(--color-border)] sm:shadow-[0_26px_80px_rgba(15,23,42,0.18)]"
                  role="dialog"
                  aria-modal="true"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-4 sm:px-6 sm:py-5">
                    <div className="min-w-0">
                      <p className="text-lg font-bold tracking-[-0.03em] text-[var(--color-heading)]">
                        {editorModal.kind === "record"
                          ? editorModal.mode === "edit"
                            ? "Edit note or document"
                            : "Create note or document"
                          : editorModal.mode === "edit"
                            ? "Edit contact"
                            : "Create contact"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                        {editorModal.kind === "record"
                          ? "The editor slides from the bottom on mobile. Description is optional for documents."
                          : "Company is optional. Fill only the contact details you have right now."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-heading)]"
                      onClick={closeEditorModal}
                      aria-label="Close"
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-6 sm:px-6 sm:py-5">
                    {editorModal.kind === "record" ? renderRecordEditor() : renderContactEditor()}
                  </div>

                  <div className="shrink-0 border-t border-[var(--color-divider)] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 sm:px-6 sm:py-5">
                    <div className="grid gap-2 sm:flex sm:justify-end">
                      <Button variant="secondary" onClick={closeEditorModal}>
                        {t("common.cancel")}
                      </Button>
                      <Button
                        onClick={editorModal.kind === "record" ? saveRecord : saveContact}
                        disabled={editorModal.kind === "record" ? isUploadingAttachment : false}
                      >
                        {editorModal.mode === "edit" ? "Save changes" : editorModal.kind === "record" ? "Create item" : "Create contact"}
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
