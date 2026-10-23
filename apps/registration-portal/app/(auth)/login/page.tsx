import { LoginPage } from "@dds/server/auth-pages";

export const metadata = { title: "Sign in" };

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginPage portal="registration" error={error} />;
}
