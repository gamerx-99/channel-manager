import type { FormEvent } from "react";
import type { StaffTaskEditing, StaffTaskMember, StaffTaskRoom } from "./staffTaskForm";

type Translate = (key: string) => string;
type Props = { t: Translate; editing: StaffTaskEditing; members: StaffTaskMember[]; rooms: StaffTaskRoom[]; date: string; onClose: () => void; onSubmit: (data: FormData) => void };

export default function StaffTaskDialog({ t, editing, members, rooms, date, onClose, onSubmit }: Props) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return (
    <div className="staff-task-dialog-backdrop">
      <form className="panel staff-task-dialog" onSubmit={submit}>
        <div className="panel-heading">
          <h2>{editing.id ? t("staffTasks.editTask") : t("staffTasks.assignTask")}</h2>
          <button type="button" className="button button-quiet button-small" onClick={onClose}>{t("common.close")}</button>
        </div>
        <div className="form-grid">
          <label>{t("staffTasks.staff")}
            <select name="assigned_to" required defaultValue={editing.assigned_to ?? ""}>
              <option value="" disabled>{t("staffTasks.selectStaff")}</option>
              {members.map(member => <option key={member.id} value={member.id}>{member.full_name || member.email || t("staffTasks.unknownStaff")}</option>)}
            </select>
          </label>
          <label>{t("staffTasks.date")}<input name="task_date" type="date" required defaultValue={editing.task_date || date} /></label>
          <label>{t("staffTasks.titleLabel")}<input name="title" required maxLength={160} defaultValue={editing.title ?? ""} /></label>
          <label>{t("staffTasks.room")}
            <select name="room_id" defaultValue={editing.room_id ?? ""}>
              <option value="">{t("staffTasks.noRoom")}</option>
              {rooms.map(room => <option key={room.id} value={room.id}>{room.room_number}</option>)}
            </select>
          </label>
          <label className="form-span-two">{t("staffTasks.details")}<textarea name="details" maxLength={2000} defaultValue={editing.details ?? ""} /></label>
        </div>
        <div className="form-submit">
          <button className="button button-primary">{t("staffTasks.saveTask")}</button>
          <button type="button" className="button button-quiet" onClick={onClose}>{t("common.cancel")}</button>
        </div>
      </form>
    </div>
  );
}
