import type { StaffTaskMember, StaffTaskRecord } from "./staffTaskForm";
import StaffTaskItem from "./StaffTaskItem";

type Translate = (key: string, options?: Record<string, string | number>) => string;
type Props = {
  t: Translate;
  date: string;
  setDate: (date: string) => void;
  loading: boolean;
  tasks: Record<string, StaffTaskRecord[]>;
  members: StaffTaskMember[];
  onEdit: (task: StaffTaskRecord) => void;
  onDelete: (task: StaffTaskRecord) => void;
  onToggle: (task: StaffTaskRecord) => void;
};

export default function StaffTaskManagerPanel({ t, date, setDate, loading, tasks, members, onEdit, onDelete, onToggle }: Props) {
  const groups = Object.entries(tasks);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div><div className="eyebrow">{t("staffTasks.section")}</div><h2>{t("staffTasks.managerHeading")}</h2></div>
        <div className="staff-task-controls"><label>{t("staffTasks.date")}<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label></div>
      </div>
      {loading ? <div className="empty-state">{t("common.loading")}</div> : groups.length ? groups.map(([memberId, memberTasks]) => {
        const member = members.find(item => item.id === memberId);
        const memberName = member?.full_name || member?.email || t("staffTasks.unknownStaff");
        return (
          <section className="staff-task-group" key={memberId}>
            <h3>{member?.position ? `${memberName} · ${member.position}` : memberName}</h3>
            <div className="staff-task-list">
              {memberTasks.map(task => (
                <StaffTaskItem
                  key={task.id}
                  task={task}
                  t={t}
                  manager
                  roomLabel={task.room_number ? t("staffTasks.roomNumber", { room: task.room_number }) : undefined}
                  doneLabel={t("staffTasks.done")}
                  pendingLabel={t("staffTasks.pending")}
                  actionLabel={task.status === "done" ? t("staffTasks.undo") : t("staffTasks.complete")}
                  onEdit={() => onEdit(task)}
                  onDelete={() => onDelete(task)}
                  onToggle={() => onToggle(task)}
                />
              ))}
            </div>
          </section>
        );
      }) : <div className="empty-state">{t("staffTasks.empty")}</div>}
    </section>
  );
}
