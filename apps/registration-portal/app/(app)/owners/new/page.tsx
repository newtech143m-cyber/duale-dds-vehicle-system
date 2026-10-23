import { getI18n, requireStaff } from "@dds/server";
import { PageHeader } from "@dds/ui";
import { OwnerForm } from "@/components/owner-form";
import { createOwnerAction } from "../actions";

export const metadata = { title: "New owner" };

export default async function NewOwner({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const staff = await requireStaff("owner.create");
  const { m } = await getI18n();
  const { next } = await searchParams;
  return (
    <>
      <PageHeader title={m.owner.newOwner} />
      <OwnerForm m={m} action={createOwnerAction} next={next === "vehicle" ? "vehicle" : undefined} canSeeNationalId={staff.permissions.has("owner.view.national_id")} />
    </>
  );
}
