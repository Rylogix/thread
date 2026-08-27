import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowRight, GitCommitHorizontal, Minus, Pencil, Plus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { PlanProposal, PlanSnapshot, Task, TaskFieldChange } from "../domain/types";

interface ProposalDiffGraphProps {
  currentPlan: PlanSnapshot;
  proposal: PlanProposal;
}

type DiffKind = "added" | "removed" | "modified" | "unchanged";
type DiffNodeData = Record<string, unknown> & { label: ReactNode };

function valueLabel(value: string | number): string {
  if (typeof value === "number" && value > 0 && value < 1) return `${Math.round(value * 100)}%`;
  return String(value);
}

function fieldLabel(change: TaskFieldChange): string {
  const label = change.field.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
  return `${label}: ${valueLabel(change.before)} → ${valueLabel(change.after)}`;
}

function nodeLabel(task: Task, kind: DiffKind, changes: TaskFieldChange[]): ReactNode {
  const icon = kind === "added" ? <Plus size={11} /> : kind === "removed" ? <Minus size={11} /> : kind === "modified" ? <Pencil size={10} /> : null;
  return (
    <div className="proposal-node-content">
      <div className="proposal-node-state">
        {kind !== "unchanged" && <span className={`proposal-change-badge ${kind}`}>{icon}{kind}</span>}
        <span>{task.status.replace("-", " ")}</span>
      </div>
      <strong>{task.title}</strong>
      {kind === "modified" && changes[0]
        ? <small>{fieldLabel(changes[0])}{changes.length > 1 ? ` +${changes.length - 1}` : ""}</small>
        : <small>{task.estimatedHours}h · {Math.round(task.confidence * 100)}% confidence</small>}
    </div>
  );
}

function criticalEdges(taskIds: string[]): Set<string> {
  return new Set(taskIds.slice(0, -1).map((taskId, index) => `${taskId}:${taskIds[index + 1]}`));
}

export function ProposalDiffGraph({ currentPlan, proposal }: ProposalDiffGraphProps) {
  const [pathView, setPathView] = useState<"before" | "after">("after");
  const [showFullGraph, setShowFullGraph] = useState(false);
  const { nodes, edges } = useMemo(() => {
    const addedIds = new Set(proposal.diff.addedTasks.map((task) => task.taskId));
    const removedIds = new Set(proposal.diff.removedTasks.map((task) => task.taskId));
    const modified = new Map(proposal.diff.modifiedTasks.map((task) => [task.taskId, task.changes]));
    const tasks = new Map<string, Task>();
    for (const task of currentPlan.tasks) tasks.set(task.id, task);
    for (const task of proposal.proposedPlan.tasks) tasks.set(task.id, task);
    const path = criticalEdges(pathView === "before" ? proposal.before.criticalPath.taskIds : proposal.after.criticalPath.taskIds);

    const graphNodes: Node<DiffNodeData>[] = [...tasks.values()].flatMap((task) => {
      const kind: DiffKind = addedIds.has(task.id) ? "added" : removedIds.has(task.id) ? "removed" : modified.has(task.id) ? "modified" : "unchanged";
      if (!showFullGraph && kind === "unchanged") return [];
      return [{
        id: task.id,
        position: { x: task.x, y: task.y },
        data: { label: nodeLabel(task, kind, modified.get(task.id) ?? []) },
        className: `decision-diff-node diff-${kind}`,
        selectable: true,
      }];
    });
    const visibleIds = new Set(graphNodes.map((node) => node.id));

    const currentDependencies = new Map(currentPlan.dependencies.map((dependency) => [dependency.id, dependency]));
    const proposedDependencies = new Map(proposal.proposedPlan.dependencies.map((dependency) => [dependency.id, dependency]));
    const allDependencies = new Map([...currentDependencies, ...proposedDependencies]);
    const addedDependencyIds = new Set(proposal.diff.addedDependencies.map((dependency) => dependency.dependencyId));
    const removedDependencyIds = new Set(proposal.diff.removedDependencies.map((dependency) => dependency.dependencyId));
    const graphEdges: Edge[] = [...allDependencies.values()].flatMap((dependency) => {
      if (!visibleIds.has(dependency.fromTaskId) || !visibleIds.has(dependency.toTaskId)) return [];
      const kind = addedDependencyIds.has(dependency.id) ? "added" : removedDependencyIds.has(dependency.id) ? "removed" : "unchanged";
      const critical = path.has(`${dependency.fromTaskId}:${dependency.toTaskId}`);
      return [{
        id: dependency.id,
        source: dependency.fromTaskId,
        target: dependency.toTaskId,
        type: "smoothstep",
        className: `decision-diff-edge diff-${kind}${critical ? " is-critical" : ""}`,
        animated: critical && kind !== "removed",
      }];
    });
    return { nodes: graphNodes, edges: graphEdges };
  }, [currentPlan, pathView, proposal, showFullGraph]);

  const changedCount = proposal.diff.addedTasks.length + proposal.diff.removedTasks.length + proposal.diff.modifiedTasks.length;
  const dependencyCount = proposal.diff.addedDependencies.length + proposal.diff.removedDependencies.length;

  return (
    <section className="proposal-diff-graph" aria-labelledby="proposal-graph-heading">
      <header>
        <div>
          <p className="panel-kicker">PROPOSED GRAPH</p>
          <h3 id="proposal-graph-heading">See exactly what changes</h3>
          <span>{changedCount} tasks · {dependencyCount} dependencies changed</span>
        </div>
        <div className="path-toggle" aria-label="Critical path view">
          <button type="button" className={showFullGraph ? "active" : ""} aria-pressed={showFullGraph} onClick={() => setShowFullGraph((value) => !value)}>{showFullGraph ? "Changed only" : "Full graph"}</button>
          <button type="button" className={pathView === "before" ? "active" : ""} aria-pressed={pathView === "before"} onClick={() => setPathView("before")}>Before <b>{proposal.before.criticalPath.totalDuration}h</b></button>
          <ArrowRight size={13} aria-hidden="true" />
          <button type="button" className={pathView === "after" ? "active" : ""} aria-pressed={pathView === "after"} onClick={() => setPathView("after")}>After <b>{proposal.after.criticalPath.totalDuration}h</b></button>
        </div>
      </header>
      <div className="proposal-diff-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable
          fitView
          fitViewOptions={{ padding: 0.2, minZoom: 0.28, maxZoom: 1.05 }}
          minZoom={0.2}
          maxZoom={1.45}
          proOptions={{ hideAttribution: true }}
          aria-label={`${proposal.name} dependency graph changes`}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1d343a" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <footer className="proposal-diff-legend" aria-label="Graph change legend">
        <span><i className="added"><Plus size={10} /></i> Added</span>
        <span><i className="removed"><Minus size={10} /></i> Removed</span>
        <span><i className="modified"><Pencil size={9} /></i> Modified</span>
        <span><i className="critical"><GitCommitHorizontal size={11} /></i> {pathView === "before" ? "Current" : "Proposed"} critical path</span>
      </footer>
    </section>
  );
}
