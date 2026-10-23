import { requireStaff } from "@dds/server";

export default async function Home() {
  await requireStaff("verify.search");
  return null;
}
