export type Actor = "human" | "agent" | "system";
export type TaskStatus = "todo" | "in-progress" | "blocked" | "done";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskKind = "task" | "milestone";
export type StorageMode = "remote" | "local";
export type ProposalMode = "safest" | "fastest" | "highest-impact";
export type ProposalStatus = "ready" | "awaiting-decision" | "rejected" | "applied" | "rolled-back";
export type DecisionPreference = "balanced" | "safety" | "speed" | "impact" | "cost";

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
  evidence?: DecisionLedgerEvidence;
  createdAt: string;
}

export interface DecisionLedgerEvidence {
  action: string;
  reason: string;
  beforeSummary?: string;
  afterSummary?: string;
  proposalId?: string;
  decisionId?: string;
  simulation?: {
    beforeProbability?: number;
    afterProbability?: number;
    seed: number;
    iterations: number;
  };
  result: "success" | "rejected" | "error" | "rolled-back";
  rollbackAvailable: boolean;
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
  decisionPolicy: DecisionPolicy;
  planProposals: PlanProposal[];
  humanDecisions: HumanDecision[];
  lastProposalApplication: ProposalApplication | null;
  planRevision: number;
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
    | "update_risk"
    | "delete_task"
    | "delete_dependency"
    | "update_workspace";
  input: Record<string, unknown>;
}

export interface DecisionPolicy {
  negotiationActive: boolean;
  deadlineLocked: boolean;
  budgetLocked: boolean;
  minimumProbabilityLocked: boolean;
  minimumProbability: number;
  capacityLocked: boolean;
  preservedTaskIds: string[];
  maximumRiskLocked: boolean;
  maximumRisk: number;
  preference: DecisionPreference;
  updatedAt: string;
}

export interface ProposalOperation extends PlanOperation {
  id: string;
  reason: string;
}

export interface CriticalPathSummary {
  taskIds: string[];
  taskTitles: string[];
  totalDuration: number;
}

export interface ProposalEvidence {
  criticalPath: CriticalPathSummary;
  simulation: SimulationResult;
  remainingCost: number;
  unresolvedRiskScore: number;
  taskCount: number;
}

export interface ProposalConstraintCheck {
  key: "deadline" | "budget" | "minimum-probability" | "capacity" | "preserved-scope" | "maximum-risk";
  label: string;
  passed: boolean;
  actual: string;
  required: string;
  explanation: string;
}

export interface TaskFieldChange {
  field: "title" | "estimatedHours" | "minimumHours" | "maximumHours" | "confidence" | "priority" | "status" | "cost";
  before: string | number;
  after: string | number;
}

export interface ProposalDiff {
  addedTasks: Array<{ taskId: string; title: string }>;
  removedTasks: Array<{ taskId: string; title: string }>;
  modifiedTasks: Array<{ taskId: string; title: string; changes: TaskFieldChange[] }>;
  addedDependencies: Array<{ dependencyId: string; fromTitle: string; toTitle: string }>;
  removedDependencies: Array<{ dependencyId: string; fromTitle: string; toTitle: string }>;
  changedRisks: Array<{ riskId: string; title: string; beforeProbability: number; afterProbability: number; resolved: boolean }>;
}

export interface PlanProposal {
  id: string;
  workspaceId: string;
  name: string;
  mode: ProposalMode;
  status: ProposalStatus;
  revision: number;
  rationale: string;
  operations: ProposalOperation[];
  proposedPlan: PlanSnapshot;
  before: ProposalEvidence;
  after: ProposalEvidence;
  diff: ProposalDiff;
  constraintChecks: ProposalConstraintCheck[];
  expectedUpside: string[];
  tradeoffs: string[];
  basePlanRevision: number;
  simulationSeed: number;
  simulationIterations: number;
  idempotencyKey?: string;
  requestFingerprint?: string;
  createdBy: Actor;
  createdAt: string;
  updatedAt: string;
}

export interface HumanDecisionOption {
  id: string;
  proposalId: string;
  label: string;
  summary: string;
  predictedProbability: number;
  predictedP80: number;
  predictedCostMaximum: number;
  scopeDelta: number;
}

export interface HumanDecision {
  id: string;
  workspaceId: string;
  question: string;
  context: string;
  proposalIds: string[];
  options: HumanDecisionOption[];
  status: "open" | "answered";
  selectedOptionId: string | null;
  customResponse: string | null;
  idempotencyKey?: string;
  requestFingerprint?: string;
  requestedAt: string;
  answeredAt: string | null;
}

export interface ProposalApplication {
  proposalId: string;
  previousPlan: PlanSnapshot;
  previousPlanRevision: number;
  appliedAt: string;
}
