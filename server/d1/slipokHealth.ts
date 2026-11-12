import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { hotelPaymentSettings, hotels } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import type { EmailSender } from "../email";
import { escapeHtml } from "@shared/escapeHtml";
import { normaliseSlipOkBranchId } from "@shared/slipokBranch";
import { SlipOkError } from "../slipVerification";
import { decryptSlipOkKey } from "../slipokCrypto";
import { hotelNotificationAddress } from "./hotelNotifyEmail";

/**
 * The hotel's SlipOK account as hayhost last saw it. Hotels manage SlipOK in LINE (LIFF), so they do not
 * notice an expired package until guests' slips stop being checked; hayhost tells them instead.
 */
export type SlipOkHealth = "ok" | "package_expired" | "quota_exceeded" | "credentials_rejected";

/** Problems that stop automatic slip checks and are worth an email to the hotel. */
export type SlipOkProblem = Exclude<SlipOkHealth, "ok">;
const ALERT_HEALTH: ReadonlySet<SlipOkHealth> = new Set<SlipOkHealth>(["package_expired", "quota_exceeded", "credentials_rejected"]);

/** The stored health as a problem the hotel must fix, or null when SlipOK works or was never checked. */
export function slipOkProblem(health: string | null | undefined): SlipOkProblem | null {
  return health === "package_expired" || health === "quota_exceeded" || health === "credentials_rejected" ? health : null;
}

/** SlipOK's own management page; it opens the hotel's brand after sign-in (the URL with a brand number is per hotel). */
export const SLIPOK_APP_URL = "https://app.slipok.com";

const DAILY_CHECK_MS = 20 * 60 * 60 * 1000;
const CHECKS_PER_RUN = 25;

/** What a SlipOK error says about the hotel's account; null for problems that pass on their own (bank outage, network). */
export function healthFromSlipOkCode(code: number | undefined, httpStatus?: number): SlipOkHealth | null {
  if (code === 1003) return "package_expired";
  if (code === 1004) return "quota_exceeded";
  if (code === 1001 || code === 1002 || httpStatus === 401 || httpStatus === 403) return "credentials_rejected";
  return null;
}

export function healthFromSlipOkError(error: unknown): SlipOkHealth | null {
  if (!(error instanceof SlipOkError)) return null;
  if (error.code === "INVALID_KEY") return "credentials_rejected";
  return healthFromSlipOkCode(error.slipokCode);
}

/** SlipOK's quota endpoint: costs no quota, and fails with the same codes as a slip check when the package lapsed. */
export async function checkSlipOkQuota(credentials: { apiKey: string; branchId: string }, fetchImpl: typeof fetch = fetch): Promise<{ health: SlipOkHealth; quota: number | null } | null> {
  const branchId = normaliseSlipOkBranchId(credentials.branchId);
  if (!branchId) return { health: "credentials_rejected", quota: null };
  let response: Response;
  try {
    response = await fetchImpl(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(branchId)}/quota`, { headers: { "x-authorization": credentials.apiKey } });
  } catch {
    return null;
  }
  const body = (await response.json().catch(() => null)) as { success?: boolean; code?: number; data?: { quota?: unknown } } | null;
  if (!response.ok || !body?.success) {
    const health = healthFromSlipOkCode(typeof body?.code === "number" ? body.code : undefined, response.status);
    return health ? { health, quota: null } : null;
  }
  return { health: "ok", quota: typeof body.data?.quota === "number" ? body.data.quota : null };
}

function alertContent(hotelName: string, health: SlipOkHealth) {
  const problem = health === "package_expired" ? "แพ็กเกจ SlipOK ของที่พักหมดอายุแล้ว"
    : health === "quota_exceeded" ? "โควตาตรวจสลิปของ SlipOK หมดแล้ว"
      : "SlipOK ไม่รับ API Key หรือ API URL ที่บันทึกไว้";
  const action = health === "credentials_rejected"
    ? "เปิด SlipOK ใน LINE คัดลอก API URL และ API Key ใหม่ แล้วบันทึกในหน้าตั้งค่าการเงินของ hayhost"
    : "เปิด SlipOK ใน LINE ไปที่หน้าแบรนด์ แล้วกด \"จ่ายบิลรอบถัดไป\" เพื่อต่ออายุแพ็กเกจ";
  const subject = `SlipOK หยุดตรวจสลิปให้ ${hotelName}`;
  const text = `${problem}\nระหว่างนี้สลิปของแขกทุกใบจะรอให้พนักงานตรวจเอง\n\nวิธีแก้: ${action}\n${SLIPOK_APP_URL}\n\nPowered by hayhost`;
  const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">${escapeHtml(problem)}</h2>
        <p style="font-size: 16px; line-height: 24px;">ระหว่างนี้สลิปของแขกที่ <strong>${escapeHtml(hotelName)}</strong> ทุกใบจะรอให้พนักงานตรวจเอง แขกยังไม่ได้รับการยืนยันการจองจนกว่าจะตรวจ</p>
        <p style="font-size: 16px; line-height: 24px;"><strong>วิธีแก้:</strong> ${escapeHtml(action)}</p>
        <div style="margin: 32px 0;">
          <a href="${SLIPOK_APP_URL}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">เปิด SlipOK</a>
        </div>
      </div>
      <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:24px;">Powered by hayhost</p>`;
  return { subject, html, text };
}

/**
 * Saves what hayhost learned about the hotel's SlipOK account and emails the hotel once per new problem.
 * A working account clears the warning, so the next lapse is emailed again. Never throws: a slip check
 * or the cron must not fail because of it.
 */
export async function recordSlipOkHealth(
  db: D1ScopedDatabase,
  emailSender: EmailSender | undefined,
  hotelId: string,
  health: SlipOkHealth,
  options: { quota?: number | null; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  try {
    const [row] = await db.select({ alerted: hotelPaymentSettings.slipokAlertedHealth }).from(hotelPaymentSettings)
      .where(eq(hotelPaymentSettings.hotelId, hotelId)).limit(1);
    if (!row) return;
    const shouldAlert = ALERT_HEALTH.has(health) && row.alerted !== health;
    await db.update(hotelPaymentSettings).set({
      slipokHealth: health,
      slipokCheckedAt: now,
      ...(options.quota !== undefined ? { slipokQuota: options.quota } : {}),
      ...(health === "ok" ? { slipokAlertedHealth: null } : {}),
    }).where(eq(hotelPaymentSettings.hotelId, hotelId));
    if (!shouldAlert || !emailSender) return;

    const [hotel] = await db.select({ id: hotels.id, name: hotels.name, notificationEmail: hotels.notificationEmail, ownerContact: hotels.ownerContact })
      .from(hotels).where(eq(hotels.id, hotelId)).limit(1);
    const to = hotel ? await hotelNotificationAddress(db, hotel) : null;
    if (!hotel || !to) return;
    const delivery = await emailSender.sendEmail({ to, ...alertContent(hotel.name, health) });
    if (delivery.success) {
      await db.update(hotelPaymentSettings).set({ slipokAlertedHealth: health }).where(eq(hotelPaymentSettings.hotelId, hotelId));
    }
  } catch (error) {
    console.error("[slipokHealth] could not record SlipOK health:", error instanceof Error ? error.message : error);
  }
}

/** Cron: checks each hotel's SlipOK account about once a day, before a guest's slip runs into a lapsed package. */
export async function runSlipOkHealthChecks(
  db: D1ScopedDatabase,
  env: { SLIPOK_ENCRYPTION_KEY?: string },
  emailSender: EmailSender | undefined,
  options: { now?: Date; fetchImpl?: typeof fetch } = {},
) {
  const now = options.now ?? new Date();
  const due = await db.select({ hotelId: hotelPaymentSettings.hotelId, keyEnc: hotelPaymentSettings.slipokKeyEnc, branchId: hotelPaymentSettings.slipokBranchId })
    .from(hotelPaymentSettings)
    .where(and(
      eq(hotelPaymentSettings.slipokEnabled, true),
      isNotNull(hotelPaymentSettings.slipokKeyEnc),
      isNotNull(hotelPaymentSettings.slipokBranchId),
      or(isNull(hotelPaymentSettings.slipokCheckedAt), lt(hotelPaymentSettings.slipokCheckedAt, new Date(now.getTime() - DAILY_CHECK_MS))),
    ))
    .limit(CHECKS_PER_RUN);
  for (const row of due) {
    try {
      const apiKey = await decryptSlipOkKey(row.keyEnc!, env.SLIPOK_ENCRYPTION_KEY);
      const result = await checkSlipOkQuota({ apiKey, branchId: row.branchId! }, options.fetchImpl);
      // An unknown answer (outage, network) is tried again on a later run.
      if (result) await recordSlipOkHealth(db, emailSender, row.hotelId, result.health, { quota: result.quota, now });
    } catch (error) {
      console.error("[slipokHealth] daily check failed for a hotel:", error instanceof Error ? error.message : error);
    }
  }
}
