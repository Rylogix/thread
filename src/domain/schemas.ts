import { z } from "zod";

export const actorSchema = z.enum(["human", "agent", "system"]);
export const taskStatusSchema = z.enum(["todo", "in-progress", "blocked", "done"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export const taskKindSchema = z.enum(["task", "milestone"]);

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const finiteNonNegative = z.number().finite().nonnegative();
const preferenceSchema = z.enum(["balanced", "safety", "speed", "impact", "cost"]);

export const workspaceSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(100),
  objective: z.string().trim().min(1).max(500),
  description: z.string().max(2_000),
  deadline: timestamp,
  availableHours: finiteNonNegative.max(10_000),
  budget: finiteNonNegative.max(1_000_000),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const taskSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    title: z.string().trim().min(1).max(140),
    description: z.string().max(2_000),
    kind: taskKindSchema,
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    estimatedHours: finiteNonNegative.max(10_000),
    minimumHours: finiteNonNegative.max(10_000),
    maximumHours: finiteNonNegative.max(10_000),
    confidence: z.number().finite().min(0).max(1),
    cost: finiteNonNegative.max(1_000_000),
    x: z.number().finite().min(-100_000).max(100_000),
    y: z.number().finite().min(-100_000).max(100_000),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .superRefine((task, context) => {
    if (task.minimumHours > task.estimatedHours) {
      context.addIssue({ code: "custom", path: ["minimumHours"], message: "Minimum hours cannot exceed the estimate" });
    }
    if (task.maximumHours < task.estimatedHours) {
      context.addIssue({ code: "custom", path: ["maximumHours"], message: "Maximum hours cannot be below the estimate" });
    }
    if (task.kind === "milestone" && task.maximumHours !== 0) {
      context.addIssue({ code: "custom", path: ["maximumHours"], message: "Milestones must have zero duration" });
    }
  });

export const dependencySchema = z.object({
  id: uuid,
  workspaceId: uuid,
  fromTaskId: uuid,
  toTaskId: uuid,
});

export const constraintSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  type: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(140),
  value: z.union([z.string().max(500), z.number().finite(), z.boolean()]),
  hard: z.boolean(),
  description: z.string().max(1_000),
});

export const resourceSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  name: z.string().trim().min(1).max(100),
  type: z.string().trim().min(1).max(60),
  capacity: finiteNonNegative.max(100_000),
  cost: finiteNonNegative.max(1_000_000),
});

export const riskSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  taskId: uuid.nullable(),
  title: z.string().trim().min(1).max(180),
  probability: z.number().finite().min(0).max(1),
  impact: z.number().finite().min(0).max(1),
  mitigation: z.string().max(1_000),
  resolved: z.boolean(),
});

export const planSnapshotSchema = z.object({
  workspace: workspaceSchema,
  tasks: z.array(taskSchema).max(500),
  dependencies: z.array(dependencySchema).max(2_000),
  constraints: z.array(constraintSchema).max(200),
  resources: z.array(resourceSchema).max(200),
  risks: z.array(riskSchema).max(500),
});

export const scenarioSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1_000),
  snapshot: planSnapshotSchema,
  createdAt: timestamp,
});

export const decisionLedgerEvidenceSchema = z.object({
  action: z.string().min(1).max(120),
  reason: z.string().min(1).max(1_000),
  beforeSummary: z.string().max(500).optional(),
  afterSummary: z.string().max(500).optional(),
  proposalId: uuid.optional(),
  decisionId: uuid.optional(),
  simulation: z.object({
    beforeProbability: z.number().min(0).max(100).optional(),
    afterProbability: z.number().min(0).max(100).optional(),
    seed: z.number().int(),
    iterations: z.number().int().min(1).max(5_000),
  }).optional(),
  result: z.enum(["success", "rejected", "error", "rolled-back"]),
  rollbackAvailable: z.boolean(),
});

export const activityEventSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  actor: actorSchema,
  type: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  payload: z.record(z.string(), z.unknown()),
  evidence: decisionLedgerEvidenceSchema.optional(),
  createdAt: timestamp,
});

export const simulationResultSchema = z.object({
  seed: z.number().int(),
  iterations: z.number().int().min(1).max(5_000),
  onTimeProbability: z.number().min(0).max(100),
  medianCompletionHours: finiteNonNegative,
  p80CompletionHours: finiteNonNegative,
  p95CompletionHours: finiteNonNegative,
  projectedCostRange: z.object({ minimum: finiteNonNegative, maximum: finiteNonNegative }),
  failureSources: z.array(z.object({ source: z.string(), frequency: z.number().min(0).max(1) })),
  varianceContributors: z.array(z.object({ taskId: uuid, title: z.string(), score: finiteNonNegative })),
  warnings: z.array(z.string()),
  calculatedAt: timestamp,
});

export const decisionPolicySchema = z.object({
  negotiationActive: z.boolean(),
  deadlineLocked: z.boolean(),
  budgetLocked: z.boolean(),
  minimumProbabilityLocked: z.boolean(),
  minimumProbability: z.number().min(0).max(99.9),
  capacityLocked: z.boolean(),
  preservedTaskIds: z.array(uuid).max(500),
  maximumRiskLocked: z.boolean(),
  maximumRisk: z.number().min(0).max(1),
  preference: preferenceSchema,
  updatedAt: timestamp,
});

const planOperationTypeSchema = z.enum(["create_task", "update_task", "create_dependency", "complete_task", "resolve_risk", "update_risk", "delete_task", "delete_dependency", "update_workspace"]);

export const proposalOperationSchema = z.object({
  id: uuid,
  type: planOperationTypeSchema,
  input: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(1).max(1_000),
});

const criticalPathSummarySchema = z.object({
  taskIds: z.array(uuid),
  taskTitles: z.array(z.string()),
  totalDuration: finiteNonNegative,
});

const proposalEvidenceSchema = z.object({
  criticalPath: criticalPathSummarySchema,
  simulation: simulationResultSchema,
  remainingCost: finiteNonNegative,
  unresolvedRiskScore: finiteNonNegative,
  taskCount: z.number().int().nonnegative(),
});

const proposalConstraintCheckSchema = z.object({
  key: z.enum(["deadline", "budget", "minimum-probability", "capacity", "preserved-scope", "maximum-risk"]),
  label: z.string().min(1).max(100),
  passed: z.boolean(),
  actual: z.string().max(200),
  required: z.string().max(200),
  explanation: z.string().max(500),
});

const proposalDiffSchema = z.object({
  addedTasks: z.array(z.object({ taskId: uuid, title: z.string() })),
  removedTasks: z.array(z.object({ taskId: uuid, title: z.string() })),
  modifiedTasks: z.array(z.object({
    taskId: uuid,
    title: z.string(),
    changes: z.array(z.object({
      field: z.enum(["title", "estimatedHours", "minimumHours", "maximumHours", "confidence", "priority", "status", "cost"]),
      before: z.union([z.string(), z.number()]),
      after: z.union([z.string(), z.number()]),
    })),
  })),
  addedDependencies: z.array(z.object({ dependencyId: uuid, fromTitle: z.string(), toTitle: z.string() })),
  removedDependencies: z.array(z.object({ dependencyId: uuid, fromTitle: z.string(), toTitle: z.string() })),
  changedRisks: z.array(z.object({ riskId: uuid, title: z.string(), beforeProbability: z.number(), afterProbability: z.number(), resolved: z.boolean() })),
});

export const planProposalSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  name: z.string().trim().min(1).max(100),
  mode: z.enum(["safest", "fastest", "highest-impact"]),
  status: z.enum(["ready", "awaiting-decision", "rejected", "applied", "rolled-back"]),
  revision: z.number().int().min(1).max(100),
  rationale: z.string().min(1).max(2_000),
  operations: z.array(proposalOperationSchema).min(1).max(50),
  proposedPlan: planSnapshotSchema,
  before: proposalEvidenceSchema,
  after: proposalEvidenceSchema,
  diff: proposalDiffSchema,
  constraintChecks: z.array(proposalConstraintCheckSchema),
  expectedUpside: z.array(z.string().max(500)).max(12),
  tradeoffs: z.array(z.string().max(500)).max(12),
  basePlanRevision: z.number().int().positive(),
  simulationSeed: z.number().int(),
  simulationIterations: z.number().int().min(50).max(5_000),
  idempotencyKey: z.string().max(120).optional(),
  requestFingerprint: z.string().max(2_000).optional(),
  createdBy: actorSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const humanDecisionSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  question: z.string().trim().min(1).max(500),
  context: z.string().max(1_000),
  proposalIds: z.array(uuid).min(2).max(4),
  options: z.array(z.object({
    id: uuid,
    proposalId: uuid,
    label: z.string().min(1).max(100),
    summary: z.string().max(500),
    predictedProbability: z.number().min(0).max(100),
    predictedP80: finiteNonNegative,
    predictedCostMaximum: finiteNonNegative,
    scopeDelta: z.number().int(),
  })).min(2).max(4),
  status: z.enum(["open", "answered"]),
  selectedOptionId: uuid.nullable(),
  customResponse: z.string().max(1_000).nullable(),
  idempotencyKey: z.string().max(120).optional(),
  requestFingerprint: z.string().max(2_000).optional(),
  requestedAt: timestamp,
  answeredAt: timestamp.nullable(),
});

export const proposalApplicationSchema = z.object({
  proposalId: uuid,
  previousPlan: planSnapshotSchema,
  previousPlanRevision: z.number().int().positive(),
  appliedAt: timestamp,
});

export const workspaceStateSchema = planSnapshotSchema.extend({
  scenarios: z.array(scenarioSchema).max(100),
  decisionPolicy: decisionPolicySchema.default({
    negotiationActive: false,
    deadlineLocked: false,
    budgetLocked: false,
    minimumProbabilityLocked: false,
    minimumProbability: 90,
    capacityLocked: false,
    preservedTaskIds: [],
    maximumRiskLocked: false,
    maximumRisk: 0.4,
    preference: "balanced",
    updatedAt: "2026-08-27T13:00:00.000Z",
  }),
  planProposals: z.array(planProposalSchema).max(12).default([]),
  humanDecisions: z.array(humanDecisionSchema).max(50).default([]),
  lastProposalApplication: proposalApplicationSchema.nullable().default(null),
  planRevision: z.number().int().positive().default(1),
  activity: z.array(activityEventSchema).max(1_000),
  lastSimulation: simulationResultSchema.nullable(),
  storageMode: z.enum(["remote", "local"]),
});

export const createTaskInputSchema = z
  .object({
    id: uuid.optional(),
    title: z.string().trim().min(1).max(140),
    description: z.string().max(2_000).default(""),
    kind: taskKindSchema.default("task"),
    status: taskStatusSchema.default("todo"),
    priority: taskPrioritySchema.default("medium"),
    estimatedHours: finiteNonNegative.max(10_000).default(1),
    minimumHours: finiteNonNegative.max(10_000).optional(),
    maximumHours: finiteNonNegative.max(10_000).optional(),
    confidence: z.number().min(0).max(1).default(0.75),
    cost: finiteNonNegative.max(1_000_000).default(0),
    x: z.number().finite().default(0),
    y: z.number().finite().default(0),
  })
  .strict();

export const updateTaskInputSchema = z
  .object({
    taskId: uuid,
    title: z.string().trim().min(1).max(140).optional(),
    description: z.string().max(2_000).optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    estimatedHours: finiteNonNegative.max(10_000).optional(),
    minimumHours: finiteNonNegative.max(10_000).optional(),
    maximumHours: finiteNonNegative.max(10_000).optional(),
    confidence: z.number().min(0).max(1).optional(),
    cost: finiteNonNegative.max(1_000_000).optional(),
  })
  .strict();

export const simulationInputSchema = z
  .object({
    iterations: z.number().int().min(50).max(5_000).default(1_000),
    scenarioId: uuid.optional(),
    seed: z.number().int().min(1).max(2_147_483_647).default(20_260_903),
  })
  .strict();

export function formatValidationError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
}
