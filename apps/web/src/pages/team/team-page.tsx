import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";
import { InvitesSection } from "@/pages/team/invites-section";
import { LocationsSection } from "@/pages/team/locations-section";
import { PeopleSection } from "@/pages/team/people-section";
import { PermissionsSection } from "@/pages/team/permissions-section";
import { PositionsSection } from "@/pages/team/positions-section";
import { TemplatesSection } from "@/pages/team/templates-section";
import { WorkerSheet } from "@/pages/team/worker-sheet";

export type TeamSection = "people" | "invites" | "positions" | "locations" | "templates" | "permissions";

const TITLE_KEY: Record<TeamSection, string> = {
  people: "sub.people",
  invites: "sub.invites",
  positions: "sub.positions",
  locations: "sub.locations",
  templates: "sub.templates",
  permissions: "sub.permissions",
};

export function TeamPage({ section = "people" }: { section?: TeamSection }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const action =
    section === "people" ? (
      <Button size="sm" onClick={() => navigate("/team/invites")}>
        <UserPlus className="size-4" /> {t("team.invite_people")}
      </Button>
    ) : undefined;

  return (
    <AppShell title={t(TITLE_KEY[section])} action={action} flush>
      <div>
        {section === "people" ? <PeopleSection onOpen={setOpenUserId} /> : null}
        {section === "invites" ? <InvitesSection /> : null}
        {section === "positions" ? <PositionsSection onOpen={setOpenUserId} /> : null}
        {section === "locations" ? <LocationsSection /> : null}
        {section === "templates" ? <TemplatesSection /> : null}
        {section === "permissions" ? <PermissionsSection /> : null}
      </div>
      <WorkerSheet userId={openUserId} onClose={() => setOpenUserId(null)} />
    </AppShell>
  );
}
