import { z } from "zod";

export const actorSchema = z.enum(["human", "agent", "system"]);
export const taskStatusSchema = z.enum(["todo", "in-progress", "blocked", "done"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export const taskKindSchema = z.enum(["task", "milestone"]);

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const finiteNonNegative = z.number().finite().nonnegative();

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

export const activityEventSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  actor: actorSchema,
  type: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  payload: z.record(z.string(), z.unknown()),
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

export const workspaceStateSchema = planSnapshotSchema.extend({
  scenarios: z.array(scenarioSchema).max(100),
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
