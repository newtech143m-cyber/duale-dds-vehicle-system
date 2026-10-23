import { audit, buildReport, canRunReport, getAuthState, REPORT_KINDS, toCsv, type ReportKind } from "@dds/server";

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const state = await getAuthState();
  if (state.status !== "ok") return new Response("Unauthorized", { status: 401 });
  const { kind } = await params;
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) return new Response("Not found", { status: 404 });
  const staff = state.staff;
  if (!staff.permissions.has("report.export") || !canRunReport(staff, kind as ReportKind)) return new Response("Forbidden", { status: 403 });

  const u = new URL(req.url).searchParams;
  const report = await buildReport(kind as ReportKind, {
    from: u.get("from") ?? undefined, to: u.get("to") ?? undefined, q: u.get("q") ?? undefined,
    year: u.get("year") ? Number(u.get("year")) : undefined,
  });
  await audit({ actorId: staff.id, action: "report.export", entityType: "report", entityId: kind, metadata: { rows: report.rows.length, format: "csv" } });
  const csv = "﻿" + toCsv(report.title, report.columns, report.rows); // BOM so Excel reads Somali/Amharic correctly
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dds-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
