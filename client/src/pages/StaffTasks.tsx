import { useStaffTasks } from "@/components/staff-tasks/useStaffTasks";
import StaffTaskDialog from "@/components/staff-tasks/StaffTaskDialog";
import StaffTaskManagerPanel from "@/components/staff-tasks/StaffTaskManagerPanel";
import StaffTaskMyList from "@/components/staff-tasks/StaffTaskMyList";
import { staffTaskFormToInput, type StaffTaskRecord } from "@/components/staff-tasks/staffTaskForm";
import "@/components/staff-tasks/staff-tasks.css";

export default function StaffTasks() {
  const state = useStaffTasks();
  const { t } = state;

  function handleSubmit(data: FormData) {
    const input = { hotel_id: state.selectedHotelId!, ...staffTaskFormToInput(data) };
    if (state.editing?.id) state.update.mutate({ ...input, id: state.editing.id });
    else state.create.mutate(input);
  }

  function handleDelete(task: StaffTaskRecord) {
    if (!window.confirm(t("staffTasks.confirmDelete"))) return;
    state.remove.mutate({ hotel_id: state.selectedHotelId!, id: task.id });
  }

  function toggleDone(task: StaffTaskRecord) {
    state.setDone.mutate({ hotel_id: state.selectedHotelId!, id: task.id, done: task.status !== "done" });
  }

  return (
    <div className="page-content staff-tasks-page">
      <section className="page-intro intro-split">
        <div>
          <div className="eyebrow">{t("staffTasks.eyebrow")}</div>
          <h1>{t("staffTasks.title")}<span className="title-mark">.</span></h1>
          <p className="lede">{t("staffTasks.lede")}</p>
        </div>
        {state.canManage && <button className="button button-primary" onClick={() => state.setEditing({ task_date: state.date })}>{t("staffTasks.addTask")}</button>}
      </section>

      {state.canManage && (
        <StaffTaskManagerPanel
          t={t}
          date={state.date}
          setDate={state.setDate}
          loading={state.list.isLoading}
          tasks={state.grouped as Record<string, StaffTaskRecord[]>}
          members={state.staff.data?.members ?? []}
          onEdit={task => state.setEditing(task)}
          onDelete={handleDelete}
          onToggle={toggleDone}
        />
      )}

      {!state.canManage && state.canViewOwn && (
        <StaffTaskMyList
          t={t}
          language={state.language}
          loading={state.mine.isLoading}
          tasks={state.mine.data?.tasks ?? []}
          waitingForShiftStart={state.mine.data?.waiting_for_shift_start ?? false}
          shiftStart={state.mine.data?.shift_start ?? null}
          onToggle={toggleDone}
        />
      )}

      {state.editing && state.canManage && (
        <StaffTaskDialog
          t={t}
          editing={state.editing}
          members={state.staff.data?.members ?? []}
          rooms={state.rooms}
          date={state.date}
          onClose={() => state.setEditing(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
