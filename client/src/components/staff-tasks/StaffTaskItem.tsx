import type { StaffTaskRecord } from "./staffTaskForm";

type Translate = (key: string, options?: Record<string, string | number>) => string;

type Props = {
  task: StaffTaskRecord;
  t: Translate;
  roomLabel?: string;
  dateLabel?: string;
  doneLabel: string;
  pendingLabel?: string;
  actionLabel: string;
  manager?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggle: () => void;
};

export default function StaffTaskItem({ task, t, roomLabel, dateLabel, doneLabel, pendingLabel, actionLabel, manager = false, onEdit, onDelete, onToggle }: Props) {
  const done = task.status === "done";
  const meta = [dateLabel, roomLabel, manager ? (done ? doneLabel : pendingLabel) : undefined].filter(Boolean).join(" · ");
  return (
    <article className={`staff-task-item${done ? " is-done" : ""}`}>
      <div className="staff-task-copy">
        <strong>{task.title}</strong>
        {task.details && <span>{task.details}</span>}
        <span className="staff-task-meta">{meta}</span>
        {manager && done && <span className="status-pill done">{doneLabel}</span>}
      </div>
      {manager ? (
        <div className="staff-task-actions">
          <button className="button button-quiet button-small" onClick={onEdit}>{t("common.edit")}</button>
          <button className="button button-quiet button-small" onClick={onDelete}>{t("common.delete")}</button>
          <button className="button button-quiet button-small" onClick={onToggle}>{actionLabel}</button>
        </div>
      ) : (
        <button className="button button-primary" onClick={onToggle}>{actionLabel}</button>
      )}
    </article>
  );
}
