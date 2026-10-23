import { ButtonLink, Card } from "@dds/ui";
import { getI18n } from "@dds/server";

export default async function Forbidden() {
  const { m } = await getI18n();
  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <Card className="p-8 max-w-md text-center">
        <p className="text-5xl font-semibold text-navy-800">403</p>
        <p className="mt-3 text-muted">{m.common.forbidden}</p>
        <ButtonLink href="/" className="mt-6">{m.nav.dashboard}</ButtonLink>
      </Card>
    </main>
  );
}
