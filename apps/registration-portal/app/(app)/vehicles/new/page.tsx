import { getI18n, requireStaff } from "@dds/server";
import { PageHeader } from "@dds/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { createVehicleAction } from "../actions";

export const metadata = { title: "Register vehicle" };

export default async function NewVehicle({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const staff = await requireStaff("vehicle.create");
  const { m } = await getI18n();
  const { owner } = await searchParams;
  return (
    <>
      <PageHeader title={m.vehicle.newVehicle} />
      <VehicleForm m={m} staff={staff} action={createVehicleAction} ownerId={owner} />
    </>
  );
}
