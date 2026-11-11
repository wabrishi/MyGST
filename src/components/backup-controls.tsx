"use client";

import { useRouter } from "next/navigation";
import { backupNow, disconnectBackup, setBackupEnabled } from "@/lib/backup/actions";
import { useAction } from "./form-utils";
import { Alert, Button, ButtonLink } from "./ui";

export function BackupControls({
  scope,
  companyId,
  enabled,
  connectHref,
}: {
  scope: "platform" | "company";
  companyId: string | null;
  enabled: boolean;
  connectHref: string;
}) {
  const router = useRouter();
  const now = useAction(backupNow.bind(null, scope, companyId));
  const toggle = useAction(setBackupEnabled.bind(null, scope, companyId, !enabled));
  const disconnect = useAction(disconnectBackup.bind(null, scope, companyId));
  const error = now.error || toggle.error || disconnect.error;
  const refreshAfter = async (p: Promise<{ ok: boolean } | undefined>) => {
    if ((await p)?.ok) router.refresh();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button disabled={now.pending} onClick={() => refreshAfter(now.execute())}>
          {now.pending ? "Backing up…" : "Back up now"}
        </Button>
        <Button variant="secondary" disabled={toggle.pending} onClick={() => refreshAfter(toggle.execute())}>
          {enabled ? "Pause automatic backups" : "Resume automatic backups"}
        </Button>
        <ButtonLink variant="ghost" href={connectHref} prefetch={false}>
          Reconnect / change account
        </ButtonLink>
        <Button
          variant="ghost"
          className="text-danger"
          disabled={disconnect.pending}
          onClick={() => confirm("Disconnect Google Drive? Automatic backups stop. Files already in Drive are kept.") && refreshAfter(disconnect.execute())}
        >
          Disconnect
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {(now.message || toggle.message || disconnect.message) && <Alert kind="success">{now.message || toggle.message || disconnect.message}</Alert>}
    </div>
  );
}
