import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Check, Flag, LockKeyhole, Play } from "lucide-react";
import type { Task } from "../domain/types";

export type TaskNodeData = { task: Task; critical: boolean; highlighted: boolean };
export type TaskFlowNode = Node<TaskNodeData, "task">;

export function TaskNode({ data, selected }: NodeProps<TaskFlowNode>) {
  const { task, critical, highlighted } = data;
  const StatusIcon = task.kind === "milestone" ? Flag : task.status === "done" ? Check : task.status === "blocked" ? LockKeyhole : Play;
  return (
    <div className={`task-node status-${task.status} ${task.kind === "milestone" ? "milestone-node" : ""} ${critical ? "critical-node" : ""} ${highlighted ? "agent-highlight" : ""} ${selected ? "selected-node" : ""}`} data-testid={`task-node-${task.id}`}>
      <Handle type="target" position={Position.Left} aria-label={`Connect a dependency into ${task.title}`} />
      <div className="task-node-top"><span className="node-status"><StatusIcon size={12} /> {task.kind === "milestone" ? "Milestone" : task.status.replace("-", " ")}</span><span className={`priority priority-${task.priority}`}>{task.priority}</span></div>
      <strong>{task.title}</strong>
      <div className="task-node-meta"><span>{task.estimatedHours}h estimate</span><span>{Math.round(task.confidence * 100)}% confidence</span></div>
      <div className="confidence-track"><span style={{ width: `${task.confidence * 100}%` }} /></div>
      <Handle type="source" position={Position.Right} aria-label={`Connect a dependency from ${task.title}`} />
    </div>
  );
}
