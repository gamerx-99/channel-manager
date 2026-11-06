import type { AppRouter } from "../../../../server/routers";
import type { inferRouterOutputs } from "@trpc/server";

export type StaffTaskRecord = inferRouterOutputs<AppRouter>["staffTasks"]["list"][number];
export type StaffTaskEditing = Partial<StaffTaskRecord> & { task_date: string };
export type StaffTaskRoom = { id: string; room_number: string };
export type StaffTaskMember = { id: string; full_name: string | null; position: string | null; email: string | null };
export type StaffTaskFormInput = {
  assigned_to: string;
  task_date: string;
  title: string;
  details: string | null;
  room_id: string | null;
};

export function staffTaskFormToInput(data: FormData): StaffTaskFormInput {
  return {
    assigned_to: String(data.get("assigned_to")),
    task_date: String(data.get("task_date")),
    title: String(data.get("title")).trim(),
    details: String(data.get("details")).trim() || null,
    room_id: String(data.get("room_id")) || null,
  };
}

export function formatStaffTaskDate(date: string, language: "en" | "th"): string {
  return new Intl.DateTimeFormat(language === "th" ? "th-TH-u-ca-buddhist" : "en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
