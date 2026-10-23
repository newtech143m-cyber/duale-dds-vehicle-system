import { notFound } from "next/navigation";
import { prisma } from "@dds/database";
import { getI18n, requireStaff } from "@dds/server";
import { PageHeader } from "@dds/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { updateVehicleAction } from "../../actions";

export const metadata = { title: "Edit vehicle" };

export default async function EditVehicle({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("vehicle.update");
  const { m } = await getI18n();
  const { id } = await params;
  const vehicle = await prisma.vehicle.findUnique({ where: { id } }).catch(() => null);
  if (!vehicle || vehicle.archivedAt) notFound();
  return (
    <>
      <PageHeader title={`${m.vehicle.editVehicle} · ${vehicle.plateNumber}`} />
      <VehicleForm m={m} staff={staff} vehicle={vehicle} action={updateVehicleAction} />
    </>
  );
}
