import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("staff shifts page contract", () => {
 const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
 const scope = readFileSync(resolve(process.cwd(), "client/src/lib/routeScope.ts"), "utf8");
 const page = readFileSync(resolve(process.cwd(), "client/src/pages/StaffShifts.tsx"), "utf8");
 const repo = readFileSync(resolve(process.cwd(), "server/d1/staffShifts.ts"), "utf8");
 const styles = readFileSync(resolve(process.cwd(), "client/src/components/staff-shifts/staff-shifts.css"), "utf8");
 it("registers the named permission gate and monthly table contract", () => { expect(app).toContain('path="/staff-shifts"'); expect(scope).toContain('return "staff.view_shifts"'); expect(page).toContain('className="page-content staff-shifts-page"'); expect(page).toContain('"weekend-shading"'); expect(styles).toContain(".weekend-shading"); expect(page).toContain('className="staff-total-column"'); expect(repo).toContain("hotel_owner"); expect(repo).toContain("leftJoin(user"); expect(page).toContain("memberDetails"); });
});
