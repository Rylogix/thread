export type Actor = "human" | "agent" | "system";
export type TaskStatus = "todo" | "in-progress" | "blocked" | "done";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskKind = "task" | "milestone";
export type StorageMode = "remote" | "local";

export interface Workspace {
  id: string;
  name: string;
  objective: string;
  description: string;
  deadline: string;
  availableHours: number;
  budget: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  kind: TaskKind;
  status: TaskStatus;
  priority: TaskPriority;
  estimatedHours: number;
  minimumHours: number;
  maximumHours: number;
  confidence: number;
  cost: number;
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
}

export interface Dependency {
  id: string;
  workspaceId: string;
  fromTaskId: string;
  toTaskId: string;
}

export interface Constraint {
  id: string;
  workspaceId: string;
  type: string;
  title: string;
  value: string | number | boolean;
  hard: boolean;
  description: string;
}

export interface Resource {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  capacity: number;
  cost: number;
}

export interface Risk {
  id: string;
  workspaceId: string;
  taskId: string | null;
  title: string;
  probability: number;
  impact: number;
  mitigation: string;
  resolved: boolean;
}

export interface PlanSnapshot {
  workspace: Workspace;
  tasks: Task[];
  dependencies: Dependency[];
  constraints: Constraint[];
  resources: Resource[];
  risks: Risk[];
}

export interface Scenario {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  snapshot: PlanSnapshot;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  workspaceId: string;
  actor: Actor;
  type: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TaskTiming {
  taskId: string;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  slack: number;
  critical: boolean;
}

export interface CriticalPathResult {
  taskIds: string[];
  taskTitles: string[];
  totalDuration: number;
  timings: Record<string, TaskTiming>;
}

export interface Conflict {
  type:
    | "dependency-cycle"
    | "missing-task"
    | "impossible-deadline"
    | "available-hours"
    | "budget-overrun"
    | "milestone-prerequisite"
    | "resource-capacity";
  severity: "warning" | "error";
  message: string;
  taskIds: string[];
}

export interface Bottleneck {
  taskId: string;
  title: string;
  score: number;
  signals: string[];
}

export interface SimulationResult {
  seed: number;
  iterations: number;
  onTimeProbability: number;
  medianCompletionHours: number;
  p80CompletionHours: number;
  p95CompletionHours: number;
  projectedCostRange: { minimum: number; maximum: number };
  failureSources: Array<{ source: string; frequency: number }>;
  varianceContributors: Array<{ taskId: string; title: string; score: number }>;
  warnings: string[];
  calculatedAt: string;
}

export interface FeasibilityResult {
  percentage: number;
  explanation: string;
  positiveFactors: string[];
  failureSources: string[];
  recommendedChanges: Array<{
    action: string;
    targetId?: string;
    reason: string;
  }>;
}

export interface WorkspaceState extends PlanSnapshot {
  scenarios: Scenario[];
  activity: ActivityEvent[];
  lastSimulation: SimulationResult | null;
  storageMode: StorageMode;
}

export interface SaveResult {
  mode: StorageMode;
  warning?: string;
}

export interface MutationMeta {
  actor: Actor;
  idempotencyKey?: string;
}

export interface PlanOperation {
  type:
    | "create_task"
    | "update_task"
    | "create_dependency"
    | "complete_task"
    | "resolve_risk"
    | "update_workspace";
  input: Record<string, unknown>;
}
