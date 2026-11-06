import type { StaffTaskRecord } from "./staffTaskForm";
import { formatStaffTaskDate } from "./staffTaskForm";
import StaffTaskItem from "./StaffTaskItem";

type Translate = (key: string, options?: Record<string, string | number>) => string;
type Props = {
  t: Translate;
  language: "en" | "th";
  loading: boolean;
  tasks: StaffTaskRecord[];
  waitingForShiftStart: boolean;
  shiftStart: string | null;
  onToggle: (task: StaffTaskRecord) => void;
};

export default function StaffTaskMyList({ t, language, loading, tasks, waitingForShiftStart, shiftStart, onToggle }: Props) {
  return (
    <section className="panel">
      <div className="panel-heading"><div><div className="eyebrow">{t("staffTasks.eyebrow")}</div><h2>{t("staffTasks.myTasks")}</h2></div></div>
      {waitingForShiftStart && shiftStart && <div className="staff-task-before-shift">{t("staffTasks.beforeShiftAt", { time: shiftStart })}</div>}
      {loading ? <div className="empty-state">{t("common.loading")}</div> : tasks.length ? (
        <div className="staff-task-list">
          {tasks.map(task => (
            <StaffTaskItem
              key={task.id}
              task={task}
              t={t}
              dateLabel={formatStaffTaskDate(task.task_date, language)}
              roomLabel={task.room_number ? t("staffTasks.roomNumber", { room: task.room_number }) : undefined}
              doneLabel={t("staffTasks.done")}
              actionLabel={task.status === "done" ? t("staffTasks.undo") : t("staffTasks.complete")}
              onToggle={() => onToggle(task)}
            />
          ))}
        </div>
      ) : waitingForShiftStart ? null : <div className="empty-state">{t("staffTasks.noOwnTasks")}</div>}
    </section>
  );
}
