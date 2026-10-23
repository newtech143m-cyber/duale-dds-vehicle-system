import { prisma } from "@dds/database";
import { formatMoney, toCents } from "@dds/domain";
import { formatDate } from "@dds/i18n";
import { activeTaxYear, getI18n, requireStaff } from "@dds/server";
import { Alert, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, StatusBadge, Table, Td, Textarea, Th } from "@dds/ui";
import { ActionForm, Collapsible, SubmitButton } from "@dds/ui/client";
import { createRuleAction, toggleRuleAction } from "../actions";

export const metadata = { title: "Tax rules" };
const USAGES = ["PRIVATE", "COMMERCIAL", "PUBLIC_TRANSPORT", "GOVERNMENT", "NGO", "DIPLOMATIC", "OTHER"] as const;
const human = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default async function RulesPage() {
  const staff = await requireStaff("tax.read");
  const { m, locale } = await getI18n();
  const year = await activeTaxYear();
  const [rules, categories] = await Promise.all([
    prisma.taxRule.findMany({ orderBy: [{ taxYear: "desc" }, { priority: "desc" }, { name: "asc" }], include: { category: true, _count: { select: { assessments: true } } } }),
    prisma.vehicleCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const canManage = staff.permissions.has("tax.rule.manage");
  const canVerify = staff.permissions.has("tax.rule.verify");

  return (
    <>
      <PageHeader title={m.nav.taxRules} />
      <div className="mb-6"><Alert tone="warn">{m.tax.configuredWarning} {m.tax.source}: <strong>{m.tax.configured}</strong> / <strong>{m.tax.verifiedOfficial}</strong>.</Alert></div>

      {canManage && (
        <Card className="mb-6 p-5">
          <Collapsible summary={`+ ${m.tax.newRule}`} defaultOpen={rules.length === 0}>
            <ActionForm action={createRuleAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" resetOnSuccess>
              <Field label={m.tax.rule} required className="sm:col-span-2"><Input name="name" required minLength={2} maxLength={150} placeholder="e.g. Private automobiles 2026" /></Field>
              <Field label={m.tax.year} required><Input type="number" name="taxYear" defaultValue={year} min={2000} max={2100} required /></Field>
              <Field label={`${m.tax.amount} (ETB)`} required><Input name="amount" inputMode="decimal" required placeholder="0.00" /></Field>
              <Field label={m.vehicle.category}>
                <Select name="categoryId" defaultValue=""><option value="">{m.common.all}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              </Field>
              <Field label={m.vehicle.usage}>
                <Select name="usage" defaultValue=""><option value="">{m.common.all}</option>{USAGES.map((u) => <option key={u} value={u}>{human(u)}</option>)}</Select>
              </Field>
              <Field label={m.tax.dueDate} required><Input type="date" name="dueDate" required /></Field>
              <Field label="Priority" hint="Higher wins when several rules match"><Input type="number" name="priority" defaultValue={0} min={0} max={1000} /></Field>
              <Field label={m.tax.source}>
                <Select name="source" defaultValue="CONFIGURED">
                  <option value="CONFIGURED">{m.tax.configured}</option>
                  {canVerify && <option value="VERIFIED_OFFICIAL">{m.tax.verifiedOfficial}</option>}
                </Select>
              </Field>
              <Field label={m.tax.legalReference} className="sm:col-span-2 lg:col-span-3" hint="Required for a verified official rule (regulation / directive number and date)"><Input name="legalReference" maxLength={500} /></Field>
              <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" name="allowPartial" className="h-4 w-4 accent-teal-600" />{m.tax.allowPartial}</label>
              <Field label={m.common.notes} className="sm:col-span-2 lg:col-span-4" hint="Penalties are NOT calculated automatically."><Textarea name="penaltyNote" maxLength={1000} /></Field>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end"><SubmitButton>{m.common.create}</SubmitButton></div>
            </ActionForm>
          </Collapsible>
        </Card>
      )}

      <Card>
        <CardHeader title={m.nav.taxRules} />
        {rules.length === 0 ? <EmptyState title={m.common.noResults}>{m.tax.noRule}</EmptyState> : (
          <Table>
            <thead><tr><Th>{m.tax.rule}</Th><Th>{m.tax.year}</Th><Th>{m.vehicle.category}</Th><Th>{m.vehicle.usage}</Th><Th>{m.tax.amount}</Th><Th>{m.tax.dueDate}</Th><Th>{m.tax.source}</Th><Th>{m.common.status}</Th><Th /></tr></thead>
            <tbody>{rules.map((r) => (
              <tr key={r.id}>
                <Td className="max-w-64"><span className="font-medium text-navy-900">{r.name}</span>{r.legalReference && <span className="block text-xs text-muted truncate">{r.legalReference}</span>}</Td>
                <Td>{r.taxYear}</Td><Td>{r.category?.name ?? m.common.all}</Td><Td>{r.usage ? human(r.usage) : m.common.all}</Td>
                <Td className="tabular-nums">{formatMoney(toCents(r.amount.toString()))}{r.allowPartial && <span className="block text-[11px] text-muted">{m.tax.allowPartial}</span>}</Td>
                <Td>{formatDate(r.dueDate, locale, "UTC")}</Td>
                <Td>{r.source === "VERIFIED_OFFICIAL" ? <StatusBadge status="VERIFIED" label={m.tax.verifiedOfficial} /> : <StatusBadge status="PENDING" label={m.tax.configured} />}</Td>
                <Td><StatusBadge status={r.isActive ? "ACTIVE" : "ARCHIVED"} label={r.isActive ? m.status.ACTIVE : m.status.ARCHIVED} /></Td>
                <Td>{canManage && (
                  <ActionForm action={toggleRuleAction}>
                    <input type="hidden" name="ruleId" value={r.id} /><input type="hidden" name="active" value={String(!r.isActive)} />
                    <button className="text-sm text-teal-700 hover:underline">{r.isActive ? m.common.archive : m.staff.reactivate}</button>
                  </ActionForm>
                )}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
