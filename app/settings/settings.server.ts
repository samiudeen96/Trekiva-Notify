import type { Prisma } from "@prisma/client";
import db from "../db.server";
import {
  DEFAULT_BUTTON,
  DEFAULT_EMAIL,
  DEFAULT_FORM,
  DEFAULT_SHOW_ON,
  mergeConfig,
  type ProductRule,
} from "./defaults";
import type { EditorValues, GeneralValues } from "./schema";
import { SHOW_ON } from "./schema";

/** Settings of a shop with every default filled in; a shop that never saved anything gets defaults. */
export async function loadSettings(shopDomain: string) {
  const row = await db.settings.findUnique({ where: { shopDomain } });
  const rule = (row?.productRule ?? {}) as Partial<ProductRule>;
  const showOn = (row?.showOn?.length ? row.showOn : DEFAULT_SHOW_ON).filter((s): s is (typeof SHOW_ON)[number] =>
    (SHOW_ON as readonly string[]).includes(s),
  );
  return {
    exists: row !== null,
    enabled: row?.enabled ?? true,
    hidePurchaseButtons: row?.hidePurchaseButtons ?? true,
    senderEmail: row?.senderEmail ?? "",
    replyTo: row?.replyTo ?? "",
    enabledLocationIds: row?.enabledLocationIds ?? [],
    minStockThreshold: row?.minStockThreshold ?? 1,
    reportFrequency: (row?.reportFrequency ?? "") as "" | "DAILY" | "WEEKLY" | "MONTHLY",
    reportEmail: row?.reportEmail ?? "",
    reportCc: row?.reportCc ?? [],
    embedActivated: row?.embedActivated ?? false,
    setupConfirmed: row?.setupConfirmed ?? false,
    buttonCustomized: Boolean(row && Object.keys((row.buttonConfig ?? {}) as object).length > 0),
    editor: {
      button: mergeConfig(DEFAULT_BUTTON, row?.buttonConfig),
      form: mergeConfig(DEFAULT_FORM, row?.formConfig),
      email: mergeConfig(DEFAULT_EMAIL, row?.emailConfig),
      showOn,
      productRule: {
        mode: rule.mode ?? "ALL",
        ids: rule.ids ?? [],
        tags: rule.tags ?? [],
      } as Required<ProductRule>,
    },
  };
}

export async function saveEditor(shopDomain: string, v: EditorValues): Promise<void> {
  const data = {
    buttonConfig: v.button as unknown as Prisma.InputJsonValue,
    formConfig: v.form as unknown as Prisma.InputJsonValue,
    emailConfig: v.email as unknown as Prisma.InputJsonValue,
    showOn: v.showOn,
    productRule: v.productRule as unknown as Prisma.InputJsonValue,
  };
  await db.settings.upsert({ where: { shopDomain }, create: { shopDomain, ...data }, update: data });
}

export async function saveGeneral(shopDomain: string, v: GeneralValues): Promise<void> {
  const existing = await db.settings.findUnique({ where: { shopDomain }, select: { reportFrequency: true } });
  const data = {
    // Reports count requests since the last one: turning them on starts the clock now, so the first
    // report does not dump the shop's whole history.
    ...(v.reportFrequency && !existing?.reportFrequency ? { lastReportAt: new Date() } : {}),
    ...(!v.reportFrequency ? { lastReportAt: null } : {}),
    enabled: v.enabled,
    hidePurchaseButtons: v.hidePurchaseButtons,
    senderEmail: v.senderEmail || null,
    replyTo: v.replyTo || null,
    enabledLocationIds: v.enabledLocationIds,
    minStockThreshold: v.minStockThreshold,
    reportFrequency: v.reportFrequency || null,
    reportEmail: v.reportEmail || null,
    reportCc: v.reportCc,
  };
  await db.settings.upsert({ where: { shopDomain }, create: { shopDomain, ...data }, update: data });
}

export async function setFlags(
  shopDomain: string,
  flags: Partial<{ enabled: boolean; embedActivated: boolean; setupConfirmed: boolean }>,
): Promise<void> {
  await db.settings.upsert({ where: { shopDomain }, create: { shopDomain, ...flags }, update: flags });
}
