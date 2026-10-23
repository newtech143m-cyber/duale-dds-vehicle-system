import { notFound } from "next/navigation";
import { prisma } from "@dds/database";
import { getI18n, ownerDisplayName, requireStaff } from "@dds/server";
import { PageHeader } from "@dds/ui";
import { OwnerForm } from "@/components/owner-form";
import { updateOwnerAction } from "../../actions";

export const metadata = { title: "Edit owner" };

export default async function EditOwner({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("owner.update");
  const { m } = await getI18n();
  const { id } = await params;
  const owner = await prisma.owner.findUnique({ where: { id } }).catch(() => null);
  if (!owner || owner.archivedAt) notFound();
  const canId = staff.permissions.has("owner.view.national_id");
  return (
    <>
      <PageHeader title={`${m.common.edit} · ${ownerDisplayName(owner)}`} />
      <OwnerForm m={m} action={updateOwnerAction} canSeeNationalId={canId}
        owner={{ ...owner, nationalIdRef: canId ? owner.nationalIdRef : undefined }} />
    </>
  );
}
