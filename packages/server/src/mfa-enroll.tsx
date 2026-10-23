"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, Field, Input } from "@dds/ui";
import { ActionForm, SubmitButton } from "@dds/ui/client";
import { startMfaEnrollment, verifyMfaAction } from "./auth-actions";

interface Labels { code: string; verify: string; secretFallback: string; error: string }

/**
 * Holds the enrollment (factor id, QR, secret) in client state so it survives
 * server re-renders after a failed code attempt.
 */
export function MfaEnroll({ labels }: { labels: Labels }) {
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startMfaEnrollment().then(setEnroll).catch(() => setFailed(true));
  }, []);

  if (failed) return <Alert tone="bad">{labels.error}</Alert>;
  if (!enroll) return <div className="h-48 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted" aria-hidden /></div>;

  return (
    <>
      <div className="mb-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enroll.qr} alt="QR code" className="mx-auto h-48 w-48 rounded-lg border border-line bg-white p-2" />
        <p className="text-xs text-muted mt-3">{labels.secretFallback}</p>
        <code className="block mt-1 text-xs break-all bg-navy-50 rounded px-2 py-1.5 select-all">{enroll.secret}</code>
      </div>
      <ActionForm action={verifyMfaAction} className="space-y-4">
        <input type="hidden" name="factorId" value={enroll.factorId} />
        <Field label={labels.code}>
          <Input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required autoFocus className="text-center tracking-[0.4em] text-lg h-12" />
        </Field>
        <SubmitButton className="w-full h-11">{labels.verify}</SubmitButton>
      </ActionForm>
    </>
  );
}
