import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.E2E_BASE_URL ?? "https://channelmngr-pdjhgqu3.manus.space";
const email = process.env.E2E_SUPER_ADMIN_EMAIL;
const password = process.env.E2E_SUPER_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error("E2E_SUPER_ADMIN_EMAIL and E2E_SUPER_ADMIN_PASSWORD are required.");
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const result = { role: "super_admin", baseUrl, consoleErrors: [] };

try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") result.consoleErrors.push(message.text());
  });

  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /Continue/i }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 45_000 });
  await page.waitForTimeout(800);

  result.login = true;
  result.dashboardPath = new URL(page.url()).pathname;
  result.dashboardText = (await page.locator("body").innerText()).slice(0, 5000);
  result.hotelLinks = await page.locator('a[href^="/hotels/"]').evaluateAll((links) =>
    [...new Map(
      links
        .map((link) => ({ href: link.getAttribute("href"), text: link.textContent?.trim() ?? "" }))
        .filter((link) => link.href)
        .map((link) => [link.href, link]),
    ).values()],
  );

  const inspect = async (path) => {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForTimeout(500);
    return { requestedPath: path, finalPath: new URL(page.url()).pathname, text: (await page.locator("body").innerText()).slice(0, 5000) };
  };

  const otaPath = result.hotelLinks.find((link) => link.href.endsWith("/ota"))?.href;
  const bookingPath = result.hotelLinks.find((link) => link.href.endsWith("/bookings"))?.href;
  const calendarPath = result.hotelLinks.find((link) => link.href.endsWith("/calendar"))?.href;

  if (otaPath) {
    const ota = await inspect(otaPath);
    result.otaRoute = { finalPath: ota.finalPath, pageStateVisible: /OTA|sync|calendar/i.test(ota.text) };
  }
  if (bookingPath) {
    const bookings = await inspect(bookingPath);
    result.bookingsRoute = { finalPath: bookings.finalPath, tm30DateGuidanceVisible: /DD\/MM\/YYYY|TM\.30|ตม\.30/i.test(bookings.text) };
  }
  if (calendarPath) {
    const calendar = await inspect(calendarPath);
    result.calendarRoute = { finalPath: calendar.finalPath, calendarVisible: /calendar|availability|ห้องว่าง/i.test(calendar.text) };
  }

  const adminUsers = await inspect("/settings/admin-users");
  result.adminUsersRoute = { finalPath: adminUsers.finalPath, accessSurfaceVisible: /Admin Users|Users|permission|access/i.test(adminUsers.text) };
  result.superAdminCanReachAdminUsers = adminUsers.finalPath === "/settings/admin-users";

  await mkdir("test-artifacts", { recursive: true });
  await writeFile("test-artifacts/super-admin-flow-evidence.json", JSON.stringify(result, null, 2));
  await context.close();
} finally {
  await browser.close();
}

const failures = [];
if (!result.login || result.dashboardPath !== "/dashboard") failures.push("super_admin: dashboard login failed");
if (!result.superAdminCanReachAdminUsers) failures.push("super_admin: Admin Users route was not reachable");
if (result.otaRoute && !result.otaRoute.pageStateVisible) failures.push("super_admin: OTA route did not expose expected state");
if (result.bookingsRoute && !result.bookingsRoute.tm30DateGuidanceVisible) failures.push("super_admin: TM.30 date guidance was not visible");
if (failures.length) {
  console.error(JSON.stringify({ result, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    role: result.role,
    login: result.login,
    dashboardPath: result.dashboardPath,
    hotelLinkCount: result.hotelLinks?.length ?? 0,
    otaRoute: result.otaRoute,
    bookingsRoute: result.bookingsRoute,
    calendarRoute: result.calendarRoute,
    adminUsersRoute: result.adminUsersRoute,
    consoleErrorCount: result.consoleErrors.length,
  }, null, 2));
}
