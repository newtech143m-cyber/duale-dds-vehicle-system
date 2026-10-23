import "server-only";
import { redirect } from "next/navigation";
import { Alert, Card, Emblem, Field, Input } from "@dds/ui";
import { ActionForm, LanguageSwitcher, SubmitButton } from "@dds/ui/client";
import { getI18n } from "./i18n";
import { getAuthState } from "./session";
import { signInAction, verifyMfaAction } from "./auth-actions";
import { MfaEnroll } from "./mfa-enroll";

function Shell({ title, subtitle, children, locale, langLabel }: { title: string; subtitle: string; children: React.ReactNode; locale: Parameters<typeof LanguageSwitcher>[0]["current"]; langLabel: string }) {
  return (
    <main className="min-h-dvh grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-between bg-navy-900 text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] [background-size:22px_22px]" aria-hidden />
        <div className="relative flex items-center gap-3"><Emblem className="h-11 w-11" /><span className="font-semibold tracking-tight">DDS</span></div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">{title}</h1>
          <p className="mt-3 text-navy-100/80">{subtitle}</p>
        </div>
        <p className="relative text-xs text-navy-100/60">Authorized personnel only · Activity is logged</p>
      </section>
      <section className="flex flex-col p-6 sm:p-12">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 lg:hidden"><Emblem /><span className="font-semibold text-navy-900">DDS</span></div>
          <div className="ml-auto"><LanguageSwitcher current={locale} label={langLabel} /></div>
        </div>
        <div className="flex-1 grid place-items-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </section>
    </main>
  );
}

const ERRORS: Record<string, string> = { not_staff: "auth.notStaff", suspended: "auth.suspended", no_access: "auth.notStaff" };

export async function LoginPage({ portal, error }: { portal: "registration" | "verification"; error?: string }) {
  const state = await getAuthState();
  if (state.status === "ok") redirect("/");
  if (state.status === "mfa_enroll" || state.status === "mfa_verify") redirect("/mfa");
  const { m, t, locale } = await getI18n();
  return (
    <Shell title={portal === "registration" ? m.app.registration : m.app.verification} subtitle={m.app.office} locale={locale} langLabel={m.common.language}>
      <h2 className="text-2xl font-semibold text-navy-900 mb-1">{m.auth.signIn}</h2>
      <p className="text-sm text-muted mb-6">{portal === "registration" ? m.app.registration : m.app.verification}</p>
      {error && ERRORS[error] && <div className="mb-4"><Alert tone="bad">{t(ERRORS[error]!)}</Alert></div>}
      <ActionForm action={signInAction} className="space-y-4">
        <Field label={m.auth.email}><Input name="email" type="email" autoComplete="username" required autoFocus /></Field>
        <Field label={m.auth.password}><Input name="password" type="password" autoComplete="current-password" required /></Field>
        <SubmitButton className="w-full h-11" pendingLabel={m.auth.signingIn}>{m.auth.signIn}</SubmitButton>
      </ActionForm>
    </Shell>
  );
}

export async function MfaPage({ portal }: { portal: "registration" | "verification" }) {
  const state = await getAuthState();
  if (state.status === "ok") redirect("/");
  if (state.status !== "mfa_enroll" && state.status !== "mfa_verify") redirect("/login");
  const { m, locale } = await getI18n();
  const enrolling = state.status === "mfa_enroll";
  return (
    <Shell title={portal === "registration" ? m.app.registration : m.app.verification} subtitle={m.app.office} locale={locale} langLabel={m.common.language}>
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-navy-900">{m.auth.mfaTitle}</h2>
        <p className="text-sm text-muted mt-1 mb-5">{enrolling ? m.auth.mfaEnrollIntro : m.auth.mfaVerifyIntro}</p>
        {enrolling ? (
          <MfaEnroll labels={{ code: m.auth.code, verify: m.auth.verify, secretFallback: m.auth.secretFallback, error: m.common.error }} />
        ) : (
          <ActionForm action={verifyMfaAction} className="space-y-4">
            <Field label={m.auth.code}>
              <Input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required autoFocus className="text-center tracking-[0.4em] text-lg h-12" />
            </Field>
            <SubmitButton className="w-full h-11">{m.auth.verify}</SubmitButton>
          </ActionForm>
        )}
      </Card>
    </Shell>
  );
}
