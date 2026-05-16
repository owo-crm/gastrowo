import { Link2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

export function PendingLinkPage() {
  const { logout, refreshMe } = useAuth();
  const toast = useToast();

  const handleRefresh = async () => {
    try {
      await refreshMe();
      toast.success("Status refreshed");
    } catch {
      toast.error("Failed to refresh status", "Try again.");
    }
  };

  return (
    <AppShell
      title="Waiting for business link"
      subtitle="Your account exists, but it is not linked to a business yet."
      action={<Badge>Worker</Badge>}
    >
      <div className="mx-auto max-w-3xl">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Account created</CardTitle>
              <CardDescription>
                Ask an ADMIN or manager to add your email in Team, or open your invite link from email.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-white px-4 py-4">
                <p className="text-sm font-semibold text-[var(--color-heading)]">What happens next</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--color-text-muted)]">
                  <li>1. Your manager adds your email from Team.</li>
                  <li>2. Or you accept an invite sent to your email.</li>
                  <li>3. Access opens automatically after refresh.</li>
                </ul>
              </div>
              <div className="rounded-[1.25rem] border border-[var(--color-border)] bg-[linear-gradient(140deg,rgba(47,111,237,0.10),rgba(255,255,255,0.90))] px-4 py-4">
                <div className="inline-flex items-center gap-2 text-[var(--color-heading)]">
                  <Link2 className="size-4 text-emerald-600" />
                  Email-first join flow is active.
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                  UID fallback is gone. All access now unlocks through your real email identity.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={handleRefresh}>
                Refresh status
              </Button>
              <Button variant="secondary" onClick={logout}>
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
