"use client";

import { useActionState, useRef, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Loader2, Printer, Search, ShieldAlert, RotateCcw, Lock } from "lucide-react";
import type { Messages } from "@dds/i18n";
import { Alert, Card, Field, Input, StatusBadge, Textarea, cx } from "@dds/ui";
import { ActionForm, SubmitButton } from "@dds/ui/client";
import type { VerifyState } from "@/app/actions";
import { reviewAction, verifyAction } from "@/app/actions";

function SearchButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending}
      className="h-14 sm:h-16 px-6 sm:px-8 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-base sm:text-lg inline-flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition">
      {pending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Search className="h-5 w-5" aria-hidden />}
      {label}
    </button>
  );
}

function fmt(d: Date | string | null | undefined, locale: string, time = false) {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale === "am" ? "am-ET" : locale === "en" ? "en-GB" : "so-ET", {
    timeZone: "Africa/Addis_Ababa", year: "numeric", month: "short", day: "2-digit", ...(time ? { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false } : {}),
  }).format(new Date(d));
}

export function VerifyClient({ m, locale, requireReason }: { m: Messages; locale: string; requireReason: boolean }) {
  const [state, action] = useActionState<VerifyState, FormData>(verifyAction, null);
  const reduce = useReducedMotion();
  const resultRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) resultRef.current?.focus();
  }, [state]);
  const status = (s: string) => m.status[s as keyof typeof m.status] ?? s;
  const restricted = <span className="inline-flex items-center gap-1 text-muted"><Lock className="h-3 w-3" aria-hidden />{m.verify.restricted}</span>;

  return (
    <>
      <section className="no-print">
        <h1 className="text-2xl sm:text-3xl font-semibold text-navy-900 tracking-tight">{m.verify.heroTitle}</h1>
        <p className="text-muted mt-1 mb-5">{m.verify.heroSubtitle}</p>
        <form ref={formRef} action={action} className="grid gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="sr-only" htmlFor="plate">{m.vehicle.plate}</label>
            <input id="plate" name="plate" required autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={40}
              placeholder={m.verify.placeholder}
              className="flex-1 h-14 sm:h-16 rounded-xl border-2 border-line bg-white px-5 text-xl sm:text-2xl font-semibold tracking-[0.08em] uppercase text-navy-900 placeholder:text-muted/50 placeholder:normal-case placeholder:tracking-normal placeholder:font-normal focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15 outline-none" />
            <SearchButton label={m.verify.search} />
          </div>
          <details className="text-sm" open={requireReason}>
            <summary className="cursor-pointer text-teal-700 select-none">{m.verify.reason} / {m.verify.location}{requireReason ? " *" : ""}</summary>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <Input name="reason" maxLength={300} required={requireReason} placeholder={m.verify.reason} />
              <Input name="location" maxLength={200} placeholder={m.verify.location} />
            </div>
          </details>
        </form>
        {state && !state.ok && <div className="mt-4"><Alert tone="bad">{state.message}</Alert></div>}
      </section>

      <AnimatePresence mode="wait">
        {state?.ok && (
          <motion.div key={state.outcome.reference} ref={resultRef} tabIndex={-1} className="mt-8 outline-none"
            initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {/* Status header — always first, never animated away */}
            <Card className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">{m.verify.result}</p>
                  <p className="text-2xl font-semibold tracking-wide text-navy-900">{state.outcome.kind === "found" ? state.outcome.data.vehicle.plateNumber : state.outcome.plate}</p>
                </div>
                <div className="flex gap-2 no-print">
                  <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-line bg-white text-sm font-medium text-navy-800 hover:bg-navy-50"><Printer className="h-4 w-4" />{m.common.print}</button>
                  <button type="button" onClick={() => { formRef.current?.reset(); (document.getElementById("plate") as HTMLInputElement | null)?.focus(); window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); }}
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-line bg-white text-sm font-medium text-navy-800 hover:bg-navy-50"><RotateCcw className="h-4 w-4" />{m.verify.newSearch}</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4" role="status" aria-live="polite">
                {state.outcome.statuses.map((s) => <StatusBadge key={s} status={s} label={status(s)} size="lg" />)}
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5 text-xs text-muted">
                <div><dt>{m.verify.reference}</dt><dd className="font-mono text-sm text-navy-900">{state.outcome.reference}</dd></div>
                <div><dt>{m.verify.time}</dt><dd className="text-sm text-navy-900">{fmt(state.outcome.checkedAt, locale, true)}</dd></div>
                <div><dt>{m.verify.officer}</dt><dd className="text-sm text-navy-900">{state.officer.name} · {state.officer.id}</dd></div>
              </dl>
            </Card>

            {state.outcome.kind !== "found" ? (
              <Card className="p-6 mt-4">
                <div className="flex gap-3">
                  <ShieldAlert className="h-6 w-6 text-navy-600 shrink-0" aria-hidden />
                  <div>
                    <p className="font-semibold text-navy-900">{state.outcome.kind === "not_found" ? m.verify.notFound : m.verify.duplicate}</p>
                    <p className="text-sm text-muted mt-1">{m.verify.notFoundNote}</p>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4 mt-4 lg:grid-cols-3">
                <Card className="lg:col-span-2 overflow-hidden">
                  <div className="grid sm:grid-cols-[220px_1fr]">
                    <div className="bg-navy-50 aspect-[4/3] sm:aspect-auto grid place-items-center">
                      {state.outcome.data.vehicle.primaryPhotoId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/files/${state.outcome.data.vehicle.primaryPhotoId}`} alt={state.outcome.data.vehicle.plateNumber} className="h-full w-full object-cover" />
                      ) : <span className="text-sm text-muted">—</span>}
                    </div>
                    <div className="p-5">
                      <h2 className="font-semibold text-navy-900 mb-3">{m.verify.vehicleInfo}</h2>
                      <dl className="grid grid-cols-2 gap-3 text-sm">
                        {[
                          [m.vehicle.make, `${state.outcome.data.vehicle.make} ${state.outcome.data.vehicle.model}`],
                          [m.vehicle.color, state.outcome.data.vehicle.color ?? "—"],
                          [m.vehicle.year, state.outcome.data.vehicle.manufactureYear ?? "—"],
                          [m.vehicle.category, state.outcome.data.vehicle.category],
                          [m.vehicle.vin, state.outcome.data.vehicle.vin ?? restricted],
                          [m.vehicle.certificate, state.outcome.data.registration?.certificateNumber ?? (state.outcome.data.registration ? restricted : "—")],
                          [m.vehicle.registration, state.outcome.data.registration ? status(state.outcome.data.registration.status) : status("NONE")],
                          [m.vehicle.validUntil, fmt(state.outcome.data.registration?.validUntil, locale)],
                          [m.vehicle.office, state.outcome.data.registration?.officeName ?? "—"],
                        ].map(([l, v], i) => (
                          <div key={i} className="min-w-0"><dt className="text-xs text-muted">{l}</dt><dd className="font-medium text-navy-900 break-words">{v}</dd></div>
                        ))}
                      </dl>
                    </div>
                  </div>
                </Card>
                <div className="grid gap-4 content-start">
                  <Card className="p-5">
                    <h2 className="font-semibold text-navy-900 mb-3">{m.verify.ownerInfo}</h2>
                    {state.outcome.data.owner && (
                      <div className="flex gap-3">
                        <div className="h-16 w-16 rounded-lg bg-navy-50 overflow-hidden shrink-0 grid place-items-center">
                          {state.outcome.data.owner.photoId ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/files/${state.outcome.data.owner.photoId}`} alt="" className="h-full w-full object-cover" />
                          ) : <Lock className="h-4 w-4 text-muted" aria-label={m.verify.restricted} />}
                        </div>
                        <dl className="text-sm grid gap-2 min-w-0">
                          <div><dt className="text-xs text-muted">{m.owner.fullName}</dt><dd className="font-semibold text-navy-900">{state.outcome.data.owner.displayName}</dd></div>
                          <div><dt className="text-xs text-muted">{m.owner.type}</dt><dd>{state.outcome.data.owner.ownerType === "BUSINESS" ? m.owner.business : m.owner.individual}</dd></div>
                          <div><dt className="text-xs text-muted">{m.owner.phone}</dt><dd>{state.outcome.data.owner.phone ?? restricted}</dd></div>
                          {state.outcome.data.owner.nationalIdRef && <div><dt className="text-xs text-muted">{m.owner.nationalId}</dt><dd>{state.outcome.data.owner.nationalIdRef}</dd></div>}
                        </dl>
                      </div>
                    )}
                  </Card>
                  <Card className="p-5">
                    <h2 className="font-semibold text-navy-900 mb-3">{m.verify.taxInfo} · {state.outcome.data.tax.year}</h2>
                    <StatusBadge status={state.outcome.data.tax.status} label={status(state.outcome.data.tax.status)} />
                    <dl className="grid grid-cols-2 gap-3 text-sm mt-3">
                      <div><dt className="text-xs text-muted">{m.verify.lastPayment}</dt><dd className="font-medium">{fmt(state.outcome.data.tax.lastPaymentAt, locale)}</dd></div>
                      <div><dt className="text-xs text-muted">{m.tax.receiptNo}</dt><dd className="font-medium font-mono text-xs">{state.outcome.data.tax.lastReceipt ?? restricted}</dd></div>
                      <div><dt className="text-xs text-muted">{m.tax.balance}</dt><dd className="font-medium">{state.outcome.data.tax.balance !== null ? `ETB ${state.outcome.data.tax.balance}` : restricted}</dd></div>
                    </dl>
                  </Card>
                </div>
              </div>
            )}

            <p className="text-xs text-muted mt-4">{m.verify.factualNote}</p>

            <Card className={cx("p-5 mt-4 no-print")}>
              <details>
                <summary className="cursor-pointer font-medium text-teal-700">{m.verify.requestReview}</summary>
                <ActionForm action={reviewAction} className="grid gap-3 mt-3" resetOnSuccess>
                  <input type="hidden" name="verificationRef" value={state.outcome.reference} />
                  <input type="hidden" name="plateQuery" value={state.outcome.kind === "found" ? state.outcome.data.vehicle.plateNumber : state.outcome.plate} />
                  <Field label={m.reviews.description} required><Textarea name="description" required minLength={10} maxLength={2000} /></Field>
                  <div className="flex justify-end"><SubmitButton>{m.verify.requestReview}</SubmitButton></div>
                </ActionForm>
              </details>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
