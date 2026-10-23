import { getAuthState, streamFile } from "@dds/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const state = await getAuthState();
  if (state.status !== "ok") return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  return streamFile(state.staff, id);
}
