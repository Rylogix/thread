import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyNodeChanges,
  type Connection,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CirclePlus, LocateFixed, Route } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useThread } from "../app/ThreadProvider";
import type { Task } from "../domain/types";
import { TaskNode, type TaskFlowNode } from "./TaskNode";

interface GraphPanelProps {
  selectedTaskId: string | null;
  onSelectTask(taskId: string | null): void;
  showCritical: boolean;
  onToggleCritical(): void;
}

const nodeTypes = { task: TaskNode };

export function GraphPanel({ selectedTaskId, onSelectTask, showCritical, onToggleCritical }: GraphPanelProps) {
  const { service, state } = useThread();
  const [nodes, setNodes] = useState<TaskFlowNode[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const critical = useMemo(() => service.getCriticalPath(), [service, state?.workspace.updatedAt]);
  const criticalIds = useMemo(() => new Set(critical.taskIds), [critical]);
  const status = service.getAgentStatus();

  useEffect(() => {
    if (!state) return;
    setNodes(state.tasks.map((task) => ({
      id: task.id,
      type: "task",
      position: { x: task.x, y: task.y },
      data: { task, critical: showCritical && criticalIds.has(task.id), highlighted: status.highlightedTaskId === task.id },
      selected: selectedTaskId === task.id,
    })));
  }, [state, showCritical, selectedTaskId, status.highlightedTaskId, criticalIds]);

  const edges = useMemo<Edge[]>(() => state?.dependencies.map((dependency) => ({
    id: dependency.id,
    source: dependency.fromTaskId,
    target: dependency.toTaskId,
    className: showCritical && criticalIds.has(dependency.fromTaskId) && criticalIds.has(dependency.toTaskId) ? "critical-edge" : "",
    animated: showCritical && criticalIds.has(dependency.fromTaskId) && criticalIds.has(dependency.toTaskId),
  })) ?? [], [state?.dependencies, showCritical, criticalIds]);

  const onNodesChange = useCallback((changes: NodeChange<TaskFlowNode>[]) => setNodes((current) => applyNodeChanges(changes, current)), []);
  const onConnect = async (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    try { setError(null); await service.createDependency({ fromTaskId: connection.source, toTaskId: connection.target }, { actor: "human" }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };
  const createTask = async (form: FormData) => {
    try {
      await service.createTask({ title: String(form.get("title")), estimatedHours: Number(form.get("estimatedHours")), priority: String(form.get("priority")), description: "", status: "todo", confidence: 0.72, cost: 0, x: 420, y: 320 }, { actor: "human" });
      setDialogOpen(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };

  return (
    <section className="graph-panel" aria-label="Interactive dependency graph">
      <div className="graph-toolbar">
        <div><span className="panel-kicker">DEPENDENCY GRAPH</span><b>{state?.tasks.length ?? 0} tasks · {state?.dependencies.length ?? 0} links</b></div>
        <div className="toolbar-actions">
          <button className={`icon-text-button ${showCritical ? "active" : ""}`} onClick={onToggleCritical} aria-pressed={showCritical}><Route size={15} /> Critical path</button>
          <button className="icon-text-button" data-testid="add-task" onClick={() => setDialogOpen(true)}><CirclePlus size={15} /> Add task</button>
        </div>
      </div>
      {error && <div className="inline-error" role="alert">{error}<button onClick={() => setError(null)} aria-label="Dismiss error">×</button></div>}
      <div className="flow-wrap" data-testid="graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => onSelectTask(node.id)}
          onPaneClick={() => onSelectTask(null)}
          onNodeDragStop={(_, node) => void service.moveTask({ taskId: node.id, x: node.position.x, y: node.position.y }, { actor: "human" })}
          onConnect={(connection) => void onConnect(connection)}
          onEdgesDelete={(deleted) => void Promise.all(deleted.map((edge) => service.deleteDependency(edge.id, { actor: "human" })))}
          defaultViewport={{ x: 38, y: 90, zoom: 0.66 }}
          minZoom={0.2}
          maxZoom={1.7}
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "smoothstep" }}
          aria-label="THREAD task dependency graph"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1d343a" />
          <MiniMap nodeColor={(node) => criticalIds.has(node.id) ? "#2dd4bf" : "#263940"} maskColor="rgba(5,8,10,.72)" pannable zoomable aria-label="Graph overview" />
          <Controls showInteractive={false}><button title="Fit graph" aria-label="Fit graph"><LocateFixed size={14} /></button></Controls>
        </ReactFlow>
      </div>
      {dialogOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDialogOpen(false)}>
          <form className="modal-card compact-modal" role="dialog" aria-modal="true" aria-labelledby="create-task-heading" onMouseDown={(event) => event.stopPropagation()} action={(form) => void createTask(form)}>
            <p className="panel-kicker">NEW GRAPH NODE</p><h2 id="create-task-heading">Create a task</h2>
            <label>Task title<input name="title" required maxLength={140} autoFocus /></label>
            <div className="form-row"><label>Estimate (hours)<input name="estimatedHours" type="number" min="0" max="1000" step="0.5" defaultValue="2" required /></label><label>Priority<select name="priority" defaultValue="medium"><option>low</option><option>medium</option><option>high</option><option>critical</option></select></label></div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDialogOpen(false)}>Cancel</button><button className="primary-button" type="submit">Create task</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
