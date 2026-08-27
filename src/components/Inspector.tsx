import { CheckCircle2, CircleHelp, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useThread } from "../app/ThreadProvider";
import type { Task } from "../domain/types";

type InspectorTab = "task" | "constraints" | "risks" | "resources";

export function Inspector({ selectedTaskId, open, onClose }: { selectedTaskId: string | null; open: boolean; onClose(): void }) {
  const { service, state } = useThread();
  const [tab, setTab] = useState<InspectorTab>("task");
  const task = state?.tasks.find((candidate) => candidate.id === selectedTaskId) ?? null;
  useEffect(() => { if (task) setTab("task"); }, [task?.id]);
  if (!state) return null;
  return (
    <aside className={`inspector-panel glass-panel mobile-sheet ${open ? "sheet-open" : ""}`} aria-label="Context inspector">
      <button className="sheet-close" onClick={onClose}>Close</button>
      <div className="inspector-tabs" role="tablist" aria-label="Inspector category">
        {(["task", "constraints", "risks", "resources"] as const).map((value) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value}</button>)}
      </div>
      {tab === "task" && (task ? <TaskForm key={`${task.id}-${task.updatedAt}`} task={task} /> : <div className="inspector-empty"><CircleHelp /><h2>Select a task</h2><p>Choose a graph node to edit schedule, priority, uncertainty, status, cost, and description.</p></div>)}
      {tab === "constraints" && <EntityEditor title="Constraints" items={state.constraints} render={(constraint) => <form className="entity-card" key={constraint.id} action={(form) => void service.updateConstraint({ constraintId: constraint.id, title: String(form.get("title")), value: String(form.get("value")), hard: form.get("hard") === "on", description: constraint.description, type: constraint.type }, { actor: "human" })}><input name="title" defaultValue={constraint.title} aria-label="Constraint title" /><input name="value" defaultValue={String(constraint.value)} aria-label="Constraint value" /><label className="checkbox"><input name="hard" type="checkbox" defaultChecked={constraint.hard} /> Hard constraint</label><button><Save size={13} /> Save</button></form>} />}
      {tab === "risks" && <EntityEditor title="Risks" items={state.risks} render={(risk) => <form className="entity-card" key={risk.id} action={(form) => void service.updateRisk({ riskId: risk.id, title: String(form.get("title")), probability: Number(form.get("probability")), impact: Number(form.get("impact")), mitigation: String(form.get("mitigation")), resolved: risk.resolved, taskId: risk.taskId }, { actor: "human" })}><input name="title" defaultValue={risk.title} aria-label="Risk title" /><div className="form-row"><label>Probability<input name="probability" type="number" min="0" max="1" step="0.05" defaultValue={risk.probability} /></label><label>Impact<input name="impact" type="number" min="0" max="1" step="0.05" defaultValue={risk.impact} /></label></div><textarea name="mitigation" defaultValue={risk.mitigation} aria-label="Risk mitigation" /><div className="entity-actions"><button><Save size={13} /> Save</button>{!risk.resolved && <button type="button" onClick={() => void service.resolveRisk({ riskId: risk.id }, { actor: "human" })}><CheckCircle2 size={13} /> Resolve</button>}</div></form>} />}
      {tab === "resources" && <EntityEditor title="Resources" items={state.resources} render={(resource) => <form className="entity-card" key={resource.id} action={(form) => void service.updateResource({ resourceId: resource.id, name: String(form.get("name")), capacity: Number(form.get("capacity")), cost: Number(form.get("cost")), type: resource.type }, { actor: "human" })}><input name="name" defaultValue={resource.name} aria-label="Resource name" /><div className="form-row"><label>Capacity<input name="capacity" type="number" min="0" defaultValue={resource.capacity} /></label><label>Cost<input name="cost" type="number" min="0" defaultValue={resource.cost} /></label></div><button><Save size={13} /> Save</button></form>} />}
    </aside>
  );
}

function TaskForm({ task }: { task: Task }) {
  const { service } = useThread();
  const save = async (form: FormData) => {
    await service.updateTask({ taskId: task.id, title: String(form.get("title")), description: String(form.get("description")), status: String(form.get("status")), priority: String(form.get("priority")), estimatedHours: Number(form.get("estimatedHours")), minimumHours: Number(form.get("minimumHours")), maximumHours: Number(form.get("maximumHours")), confidence: Number(form.get("confidence")), cost: Number(form.get("cost")) }, { actor: "human" });
  };
  return (
    <form className="task-form" data-testid="task-inspector" action={(form) => void save(form)}>
      <p className="panel-kicker">{task.kind === "milestone" ? "MILESTONE" : "TASK INSPECTOR"}</p><input className="title-input" name="title" defaultValue={task.title} aria-label="Task title" />
      <div className="form-row"><label>Status<select name="status" defaultValue={task.status}><option value="todo">To do</option><option value="in-progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></label><label>Priority<select name="priority" defaultValue={task.priority}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label></div>
      <div className="form-grid-3"><label>Minimum<input name="minimumHours" type="number" min="0" step="0.1" defaultValue={task.minimumHours} disabled={task.kind === "milestone"} /></label><label>Estimate<input name="estimatedHours" data-testid="task-estimate" type="number" min="0" step="0.1" defaultValue={task.estimatedHours} disabled={task.kind === "milestone"} /></label><label>Maximum<input name="maximumHours" type="number" min="0" step="0.1" defaultValue={task.maximumHours} disabled={task.kind === "milestone"} /></label></div>
      <label>Confidence <span className="label-value">0 - 1</span><input name="confidence" type="number" min="0" max="1" step="0.01" defaultValue={task.confidence} /></label><label>Cost ($)<input name="cost" type="number" min="0" step="1" defaultValue={task.cost} /></label><label>Description<textarea name="description" rows={4} defaultValue={task.description} /></label>
      <button className="primary-button wide-button" type="submit"><Save size={15} /> Save changes</button>
      <button className="danger-button wide-button" type="button" onClick={() => { if (window.confirm(`Delete ${task.title}?`)) void service.deleteTask(task.id, { actor: "human" }); }}><Trash2 size={15} /> Delete task</button>
    </form>
  );
}

function EntityEditor<T>({ title, items, render }: { title: string; items: T[]; render(item: T): React.ReactNode }) {
  return <div className="entity-editor"><p className="panel-kicker">{title.toUpperCase()}</p><h2>{items.length} {title.toLowerCase()}</h2>{items.map(render)}</div>;
}
