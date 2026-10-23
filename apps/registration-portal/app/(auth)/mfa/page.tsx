import { MfaPage } from "@dds/server/auth-pages";

export const metadata = { title: "Verification" };

export default function Page() {
  return <MfaPage portal="registration" />;
}
