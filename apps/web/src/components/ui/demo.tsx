import { Alert, AlertIcon, AlertTitle } from "@/components/ui/alert-1";
import { Bell, CircleAlert, CircleCheck, MessageSquareWarning, ShieldAlert, TriangleAlert } from "lucide-react";

export default function AlertDemo() {
  return (
    <div className="mx-auto flex h-screen w-full max-w-[600px] flex-col items-center justify-center gap-5 p-10">
      <Alert appearance="light" close>
        <AlertIcon>
          <CircleAlert />
        </AlertIcon>
        <AlertTitle>This is a default alert</AlertTitle>
      </Alert>

      <Alert variant="primary" appearance="light" close>
        <AlertIcon>
          <MessageSquareWarning />
        </AlertIcon>
        <AlertTitle>This is a primary alert</AlertTitle>
      </Alert>

      <Alert variant="success" appearance="light" close>
        <AlertIcon>
          <CircleCheck />
        </AlertIcon>
        <AlertTitle>This is a success alert</AlertTitle>
      </Alert>

      <Alert variant="destructive" appearance="light" close>
        <AlertIcon>
          <TriangleAlert />
        </AlertIcon>
        <AlertTitle>This is a destructive alert</AlertTitle>
      </Alert>

      <Alert variant="info" appearance="light" close>
        <AlertIcon>
          <Bell />
        </AlertIcon>
        <AlertTitle>This is an info alert</AlertTitle>
      </Alert>

      <Alert variant="warning" appearance="light" close>
        <AlertIcon>
          <ShieldAlert />
        </AlertIcon>
        <AlertTitle>This is a warning alert</AlertTitle>
      </Alert>
    </div>
  );
}
