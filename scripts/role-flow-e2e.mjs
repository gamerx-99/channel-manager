import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.E2E_BASE_URL ?? "https://channelmngr-pdjhgqu3.manus.space";
const roles = [
  {
    name: "super_admin",
    email: process.env.E2E_SUPER_ADMIN_EMAIL,
    password: process.env.E2E_SUPER_ADMIN_PASSWORD,
  },
  {
    name: "hotel_owner",
    email: process.env.E2E_HOTEL_OWNER_EMAIL,
    password: process.env.E2E_HOTEL_OWNER_PASSWORD,
  },
];

for (const role of roles) {
  if (!role.email || !role.password) {
    throw new Error(`Missing credentials for ${role.name}; provide them through E2E_* environment variables.`);
  }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const results = [];

function hasDateFormat(text) {
  return /\b\d{2}\/\d{2}\/\d{4}\b/.test(text) || text.includes("DD/MM/YYYY");
}

async function inspectRoute(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.waitForTimeout(500);
  const text = await page.locator("body").innerText();
  return {
    requestedPath: path,
    finalPath: new URL(page.url()).pathname,
    text,
  };
}

try {
  for (const role of roles) {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.getByLabel("Email address").fill(role.email);
    await page.getByLabel("Password").fill(role.password);
    await page.getByRole("button", { name: /Continue/i }).click();
    try {
      await page.waitForURL(/\/dashboard$/, { timeout: 45_000 });
    } catch (error) {
      await mkdir("test-artifacts", { recursive: true });
      await page.screenshot({ path: `test-artifacts/${role.name}-login-failure.png`, fullPage: true });
      const failureText = await page.locator("body").innerText();
      console.error(JSON.stringify({ role: role.name, currentUrl: page.url(), failureText: failureText.slice(0, 1000), consoleErrors, error: String(error).split("\\n")[0] }, null, 2));
      throw error;
    }
    await page.waitForTimeout(800);

    const dashboardText = await page.locator("body").innerText();
    const hotelLinks = await page.locator('a[href^="/hotels/"]').evaluateAll((links) =>
      links
        .map((link) => ({
          href: link.getAttribute("href"),
          text: link.textContent?.trim() ?? "",
        }))
        .filter((link) => link.href),
    );
    const uniqueHotelLinks = [...new Map(hotelLinks.map((link) => [link.href, link])).values()];

    const record = {
      role: role.name,
      login: true,
      dashboardPath: new URL(page.url()).pathname,
      otaWidgetVisible: dashboardText.includes("OTA Sync Status"),
      otaUpdatedItemsVisible: dashboardText.includes("Updated items"),
      hotelLinks: uniqueHotelLinks,
      consoleErrors,
    };

    const otaPath = uniqueHotelLinks.find((link) => link.href.endsWith("/ota"))?.href;
    const bookingPath = uniqueHotelLinks.find((link) => link.href.endsWith("/bookings"))?.href;
    if (otaPath) {
      const ota = await inspectRoute(page, otaPath);
      record.otaRoute = {
        finalPath: ota.finalPath,
        pageStateVisible: /OTA|sync|calendar/i.test(ota.text),
      };
    }
    if (bookingPath) {
      const bookings = await inspectRoute(page, bookingPath);
      record.bookingsRoute = {
        finalPath: bookings.finalPath,
        tm30DateGuidanceVisible: hasDateFormat(bookings.text),
      };
    }

    const adminUsers = await inspectRoute(page, "/settings/admin-users");
    record.adminUsersRoute = {
      finalPath: adminUsers.finalPath,
      accessSurfaceVisible: /Admin Users|Users|not found|permission|restricted|access/i.test(adminUsers.text),
    };

    await context.close();
    results.push(record);
  }
} finally {
  await browser.close();
}

const byRole = Object.fromEntries(results.map((result) => [result.role, result]));
const superHotelHrefs = new Set((byRole.super_admin?.hotelLinks ?? []).map((link) => link.href));
const ownerHotelHrefs = new Set((byRole.hotel_owner?.hotelLinks ?? []).map((link) => link.href));
const scopeEvidence = {
  superAdminHotelCount: superHotelHrefs.size,
  hotelOwnerHotelCount: ownerHotelHrefs.size,
  hotelOwnerSubsetOfSuperAdmin: [...ownerHotelHrefs].every((href) => superHotelHrefs.has(href)),
  hotelOwnerDoesNotExposeAdminUsers: byRole.hotel_owner?.adminUsersRoute?.finalPath !== "/settings/admin-users",
  superAdminCanReachAdminUsers: byRole.super_admin?.adminUsersRoute?.finalPath === "/settings/admin-users",
};

await mkdir("test-artifacts", { recursive: true });
await writeFile(
  "test-artifacts/role-flow-evidence.json",
  JSON.stringify({ baseUrl, generatedAt: new Date().toISOString(), results, scopeEvidence }, null, 2),
);

const failures = [];
for (const result of results) {
  if (!result.login || result.dashboardPath !== "/dashboard") failures.push(`${result.role}: dashboard login failed`);
  if (!result.otaWidgetVisible) failures.push(`${result.role}: OTA Sync Status widget not visible`);
  if (!result.otaUpdatedItemsVisible) failures.push(`${result.role}: Updated items signal not visible`);
  if (result.bookingsRoute && !result.bookingsRoute.tm30DateGuidanceVisible) failures.push(`${result.role}: TM.30 date guidance not visible`);
}
if (!scopeEvidence.hotelOwnerSubsetOfSuperAdmin) failures.push("hotel_owner exposes a hotel outside super_admin scope");
if (!scopeEvidence.hotelOwnerDoesNotExposeAdminUsers) failures.push("hotel_owner can reach Admin Users route");
if (!scopeEvidence.superAdminCanReachAdminUsers) failures.push("super_admin cannot reach Admin Users route");

console.log(JSON.stringify({ results: results.map(({ role, login, dashboardPath, otaWidgetVisible, otaUpdatedItemsVisible, hotelLinks, otaRoute, bookingsRoute, adminUsersRoute, consoleErrors }) => ({ role, login, dashboardPath, otaWidgetVisible, otaUpdatedItemsVisible, hotelLinkCount: hotelLinks.length, otaRoute, bookingsRoute, adminUsersRoute, consoleErrorCount: consoleErrors.length })), scopeEvidence, failureCount: failures.length }, null, 2));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
