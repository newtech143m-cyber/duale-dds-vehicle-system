import { prisma } from "@dds/database";
import { formatDate } from "@dds/i18n";
import { getI18n, officeTimezone, requireStaff } from "@dds/server";
import { Alert, Card, CardHeader, Field, Input, PageHeader, Select, StatusBadge, Table, Td, Th } from "@dds/ui";
import { ActionForm, Collapsible, SubmitButton } from "@dds/ui/client";
import { inviteStaffAction, setRolesAction, setStatusAction } from "../admin-actions";

export const metadata = { title: "Staff & roles" };

export default async function StaffPage() {
  const me = await requireStaff("admin.users");
  const { m, locale } = await getI18n();
  const tz = officeTimezone();
  const [users, roles, offices] = await Promise.all([
    prisma.user.findMany({ orderBy: { fullName: "asc" }, include: { office: true, roles: { where: { revokedAt: null }, include: { role: true } } } }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.registrationOffice.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const grantable = roles.filter((r) => r.code !== "SUPER_ADMIN" || me.roles.includes("SUPER_ADMIN"));
  const RoleChecks = ({ selected }: { selected: string[] }) => (
    <fieldset className="grid sm:grid-cols-2 gap-2">
      {grantable.map((r) => (
        <label key={r.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="roles" value={r.code} defaultChecked={selected.includes(r.code)} className="h-4 w-4 accent-teal-600" />
          {r.name}{r.requiresMfa && <span className="text-[10px] text-muted">MFA</span>}
        </label>
      ))}
    </fieldset>
  );

  return (
    <>
      <PageHeader title={m.staff.title} />
      <div className="mb-6"><Alert tone="info">
        1) Supabase → Authentication → Add user (same email). 2) {m.staff.add} below. The account links automatically on first sign-in. Police officers use the verification portal with the &ldquo;Police / Verification Officer&rdquo; role.
      </Alert></div>

      <Card className="mb-6">
        <CardHeader title={`+ ${m.staff.add}`} />
        <ActionForm action={inviteStaffAction} className="p-5 grid gap-4 md:grid-cols-3" resetOnSuccess>
          <Field label={m.staff.fullName} required><Input name="fullName" required minLength={2} /></Field>
          <Field label={m.auth.email} required><Input type="email" name="email" required /></Field>
          <Field label={m.staff.office}><Select name="officeId" defaultValue={me.officeId ?? ""}><option value="">—</option>{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
          <div className="md:col-span-3"><p className="text-[13px] font-medium text-navy-800 mb-2">{m.staff.roles}</p><RoleChecks selected={[]} /></div>
          <div className="md:col-span-3 flex justify-end"><SubmitButton>{m.staff.add}</SubmitButton></div>
        </ActionForm>
      </Card>

      <Card>
        <Table>
          <thead><tr><Th>{m.staff.fullName}</Th><Th>{m.staff.roles}</Th><Th>{m.staff.office}</Th><Th>{m.common.status}</Th><Th /></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id} className="align-top">
              <Td><span className="font-medium text-navy-900">{u.fullName}</span><span className="block text-xs text-muted">{u.email}</span>
                <span className="block text-[11px] text-muted">{u.authUserId ? `${m.staff.linked}${u.lastLoginAt ? ` · ${formatDate(u.lastLoginAt, locale, tz)}` : ""}` : m.staff.invited}</span></Td>
              <Td className="text-sm">{u.roles.map((r) => r.role.name).join(", ") || "—"}{u.mfaRequired && <span className="block text-[11px] text-muted">MFA</span>}</Td>
              <Td className="text-sm">{u.office?.name ?? "—"}</Td>
              <Td><StatusBadge status={u.status} label={m.status[u.status as keyof typeof m.status] ?? u.status} /></Td>
              <Td>{u.id !== me.id && (
                <div className="grid gap-2 justify-items-end">
                  <Collapsible summary={m.staff.roles}>
                    <ActionForm action={setRolesAction} className="grid gap-3 w-80">
                      <input type="hidden" name="userId" value={u.id} />
                      <RoleChecks selected={u.roles.map((r) => r.role.code)} />
                      <SubmitButton variant="secondary">{m.common.save}</SubmitButton>
                    </ActionForm>
                  </Collapsible>
                  <ActionForm action={setStatusAction} confirmText={u.status === "ACTIVE" ? `${m.staff.suspend}?` : undefined}>
                    <input type="hidden" name="userId" value={u.id} /><input type="hidden" name="suspend" value={String(u.status === "ACTIVE")} />
                    <button className={`text-sm hover:underline ${u.status === "ACTIVE" ? "text-bad-700" : "text-teal-700"}`}>{u.status === "ACTIVE" ? m.staff.suspend : m.staff.reactivate}</button>
                  </ActionForm>
                </div>
              )}</Td>
            </tr>
          ))}</tbody>
        </Table>
      </Card>
    </>
  );
}
