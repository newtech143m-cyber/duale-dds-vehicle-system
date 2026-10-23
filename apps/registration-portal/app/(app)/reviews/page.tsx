import Link from "next/link";
import { prisma } from "@dds/database";
import { formatDate } from "@dds/i18n";
import { getI18n, officeTimezone, requireStaff } from "@dds/server";
import { ButtonLink, Card, EmptyState, Input, PageHeader, StatusBadge, Table, Td, Th } from "@dds/ui";
import { ActionForm, Collapsible, SubmitButton } from "@dds/ui/client";
import { resolveReviewAction } from "../admin-actions";

export const metadata = { title: "Review requests" };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const staff = await requireStaff("review.read");
  const { m, locale } = await getI18n();
  const { status } = await searchParams;
  const closed = status === "closed";
  const rows = await prisma.reviewRequest.findMany({
    where: { status: closed ? { in: ["RESOLVED", "REJECTED"] } : { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: { createdAt: "desc" }, take: 200, include: { vehicle: true },
  });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.submittedById) } }, select: { id: true, fullName: true } });
  const name = new Map(users.map((u) => [u.id, u.fullName]));
  const tz = officeTimezone();
  return (
    <>
      <PageHeader title={m.reviews.title} actions={<>
        <ButtonLink variant={closed ? "secondary" : "primary"} href="/reviews">{m.status.OPEN}</ButtonLink>
        <ButtonLink variant={closed ? "primary" : "secondary"} href="/reviews?status=closed">{m.status.RESOLVED}</ButtonLink>
      </>} />
      <Card>
        {rows.length === 0 ? <EmptyState title={m.common.noResults} /> : (
          <Table>
            <thead><tr><Th>{m.common.date}</Th><Th>{m.vehicle.plate}</Th><Th>{m.reviews.description}</Th><Th>{m.reviews.submittedBy}</Th><Th>{m.common.status}</Th><Th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="align-top">
                <Td className="whitespace-nowrap text-muted">{formatDate(r.createdAt, locale, tz, true)}</Td>
                <Td>{r.vehicle ? <Link className="font-semibold text-navy-800 hover:underline" href={`/vehicles/${r.vehicle.id}`}>{r.vehicle.plateNumber}</Link> : (r.plateQuery ?? "—")}{r.verificationRef && <span className="block font-mono text-[11px] text-muted">{r.verificationRef}</span>}</Td>
                <Td className="max-w-md whitespace-pre-wrap">{r.description}{r.resolution && <p className="mt-2 text-xs text-muted">↳ {r.resolution}</p>}</Td>
                <Td>{name.get(r.submittedById) ?? "—"}<span className="block text-[11px] text-muted">{r.source}</span></Td>
                <Td><StatusBadge status={r.status} label={m.status[r.status]} /></Td>
                <Td>{staff.permissions.has("review.resolve") && !closed && (
                  <Collapsible summary={m.reviews.resolve}>
                    <ActionForm action={resolveReviewAction} className="grid gap-2 w-64">
                      <input type="hidden" name="id" value={r.id} />
                      <Input name="resolution" placeholder={m.reviews.resolution} required minLength={5} />
                      <div className="flex gap-2">
                        <SubmitButton>{m.reviews.resolve}</SubmitButton>
                        <button name="outcome" value="REJECTED" className="text-sm text-bad-700 hover:underline">{m.reviews.reject}</button>
                      </div>
                    </ActionForm>
                  </Collapsible>
                )}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
