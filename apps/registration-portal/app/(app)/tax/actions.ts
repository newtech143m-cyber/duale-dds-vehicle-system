"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assessVehicle, bulkAssess, createTaxRule, exemptAssessment, formObject, recordPayment, reversePayment,
  runAction, setTaxRuleActive, type ActionResult,
} from "@dds/server";

export async function assessAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const vid = String(data.get("vehicleId"));
  const r = await runAction("tax.assess", async (staff) => { await assessVehicle(staff, vid, Number(data.get("year"))); });
  revalidatePath(`/vehicles/${vid}`);
  return r;
}

export async function bulkAssessAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  let summary = "";
  const r = await runAction("tax.assess", async (staff) => {
    const res = await bulkAssess(staff, Number(data.get("year")));
    summary = `+${res.created} · ${res.skipped} skipped`;
  });
  revalidatePath("/tax");
  return r?.ok ? { ...r, message: `${r.message} ${summary}` } : r;
}

export async function recordPaymentAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const vid = String(data.get("vehicleId"));
  let receiptId = "";
  const r = await runAction("tax.payment.record", async (staff) => {
    const { receipt } = await recordPayment(staff, formObject(data));
    receiptId = receipt.id;
  });
  if (r?.ok) redirect(`/tax/receipts/${receiptId}`);
  revalidatePath(`/vehicles/${vid}`);
  return r;
}

export async function reversePaymentAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const r = await runAction("tax.payment.reverse", async (staff) => { await reversePayment(staff, formObject(data)); });
  revalidatePath("/tax");
  revalidatePath(`/vehicles/${String(data.get("vehicleId"))}`);
  return r;
}

export async function exemptAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const r = await runAction("tax.exempt", async (staff) => { await exemptAssessment(staff, formObject(data)); });
  revalidatePath(`/vehicles/${String(data.get("vehicleId"))}`);
  return r;
}

export async function createRuleAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const r = await runAction("tax.rule.manage", async (staff) => { await createTaxRule(staff, formObject(data, ["allowPartial"])); });
  revalidatePath("/tax/rules");
  return r;
}

export async function toggleRuleAction(_p: ActionResult, data: FormData): Promise<ActionResult> {
  const r = await runAction("tax.rule.manage", async (staff) => { await setTaxRuleActive(staff, String(data.get("ruleId")), data.get("active") === "true"); });
  revalidatePath("/tax/rules");
  return r;
}
