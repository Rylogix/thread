import type { ActivityEvent, PlanSnapshot, Scenario, Task, WorkspaceState } from "./types";

const CREATED_AT = "2026-08-27T13:00:00.000Z";
const DEADLINE = "2026-09-03T23:59:00.000Z";

function id(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

type SeedTask = Omit<Task, "workspaceId" | "createdAt" | "updatedAt">;

const seedTasks: SeedTask[] = [
  { id: id(101), title: "Architecture", description: "Define the shared domain model and Worker boundary.", kind: "task", status: "done", priority: "critical", estimatedHours: 3, minimumHours: 2, maximumHours: 4, confidence: 0.9, cost: 0, x: 80, y: 180 },
  { id: id(102), title: "Interface system", description: "Build the judge-ready graph workspace and inspector.", kind: "task", status: "in-progress", priority: "high", estimatedHours: 6, minimumHours: 4, maximumHours: 9, confidence: 0.65, cost: 0, x: 330, y: 60 },
  { id: id(103), title: "Graph engine", description: "Dependency editing, critical path styling, and graph interactions.", kind: "task", status: "todo", priority: "critical", estimatedHours: 7, minimumHours: 5, maximumHours: 10, confidence: 0.58, cost: 0, x: 590, y: 40 },
  { id: id(104), title: "D1 persistence", description: "Normalized D1 storage with browser-local fallback.", kind: "task", status: "in-progress", priority: "high", estimatedHours: 4, minimumHours: 3, maximumHours: 7, confidence: 0.68, cost: 5, x: 330, y: 290 },
  { id: id(105), title: "WebMCP read tools", description: "Expose discoverable structured project context.", kind: "task", status: "todo", priority: "critical", estimatedHours: 4, minimumHours: 3, maximumHours: 6, confidence: 0.78, cost: 0, x: 590, y: 235 },
  { id: id(106), title: "WebMCP mutation tools", description: "Allow agents to safely modify the same live state.", kind: "task", status: "todo", priority: "critical", estimatedHours: 7, minimumHours: 5, maximumHours: 11, confidence: 0.55, cost: 0, x: 850, y: 165 },
  { id: id(107), title: "Simulation engine", description: "Seeded Monte Carlo forecasting and scenario comparison.", kind: "task", status: "todo", priority: "critical", estimatedHours: 5, minimumHours: 3, maximumHours: 8, confidence: 0.6, cost: 0, x: 590, y: 420 },
  { id: id(108), title: "Testing", description: "Unit, integration, and browser coverage for the demo path.", kind: "task", status: "todo", priority: "critical", estimatedHours: 6, minimumHours: 4, maximumHours: 9, confidence: 0.62, cost: 8, x: 1110, y: 240 },
  { id: id(109), title: "Cloudflare deployment", description: "Deploy assets, API, D1 migrations, and custom domain.", kind: "task", status: "todo", priority: "critical", estimatedHours: 3, minimumHours: 2, maximumHours: 6, confidence: 0.56, cost: 12, x: 1370, y: 220 },
  { id: id(110), title: "README", description: "Explain architecture, setup, tools, and deployment.", kind: "task", status: "todo", priority: "medium", estimatedHours: 2, minimumHours: 1, maximumHours: 3, confidence: 0.85, cost: 0, x: 850, y: 10 },
  { id: id(111), title: "Devpost submission", description: "Finalize submission copy, links, and judging map.", kind: "task", status: "todo", priority: "high", estimatedHours: 2, minimumHours: 1, maximumHours: 4, confidence: 0.74, cost: 0, x: 1630, y: 120 },
  { id: id(112), title: "Demo script", description: "Write and rehearse the repeatable 2:30 story.", kind: "task", status: "todo", priority: "high", estimatedHours: 1.5, minimumHours: 1, maximumHours: 3, confidence: 0.7, cost: 0, x: 1110, y: 470 },
  { id: id(113), title: "Demo video", description: "Capture, edit, caption, and export the final demo.", kind: "task", status: "todo", priority: "critical", estimatedHours: 4, minimumHours: 3, maximumHours: 7, confidence: 0.52, cost: 15, x: 1370, y: 450 },
  { id: id(114), title: "Submit before deadline", description: "Devpost entry and video are live.", kind: "milestone", status: "todo", priority: "critical", estimatedHours: 0, minimumHours: 0, maximumHours: 0, confidence: 1, cost: 0, x: 1860, y: 240 },
];

const dependencyPairs: Array<[number, number]> = [
  [101, 102], [101, 104], [101, 107], [102, 103], [103, 105], [104, 105], [103, 106], [105, 106],
  [106, 108], [107, 108], [104, 108], [108, 109], [105, 110], [106, 112], [107, 112], [109, 113],
  [112, 113], [110, 111], [113, 111], [109, 111], [111, 114],
];

function snapshotOf(state: Pick<WorkspaceState, "workspace" | "tasks" | "dependencies" | "constraints" | "resources" | "risks">): PlanSnapshot {
  return structuredClone(state);
}

function makeScenarios(base: PlanSnapshot): Scenario[] {
  const current = structuredClone(base);
  const cutAnimations = structuredClone(base);
  for (const task of cutAnimations.tasks) {
    if (task.id === id(102)) Object.assign(task, { estimatedHours: 4, minimumHours: 3, maximumHours: 5, confidence: 0.86 });
    if (task.id === id(103)) Object.assign(task, { estimatedHours: 5, minimumHours: 4, maximumHours: 6, confidence: 0.84 });
  }
  const recruit = structuredClone(base);
  recruit.workspace.availableHours = 74;
  recruit.resources.push({ id: id(306), workspaceId: base.workspace.id, name: "Demo teammate", type: "person", capacity: 18, cost: 0 });
  const addFeatures = structuredClone(base);
  const additions: Task[] = [
    { ...seedTasks[1]!, id: id(121), workspaceId: base.workspace.id, title: "Calendar integration", status: "todo", estimatedHours: 6, minimumHours: 4, maximumHours: 9, x: 850, y: 610, createdAt: CREATED_AT, updatedAt: CREATED_AT },
    { ...seedTasks[1]!, id: id(122), workspaceId: base.workspace.id, title: "Team comments", status: "todo", estimatedHours: 5, minimumHours: 3, maximumHours: 8, x: 1110, y: 650, createdAt: CREATED_AT, updatedAt: CREATED_AT },
    { ...seedTasks[1]!, id: id(123), workspaceId: base.workspace.id, title: "Export center", status: "todo", estimatedHours: 4, minimumHours: 3, maximumHours: 7, x: 1370, y: 650, createdAt: CREATED_AT, updatedAt: CREATED_AT },
  ];
  addFeatures.tasks.push(...additions);
  addFeatures.dependencies.push(
    { id: id(231), workspaceId: base.workspace.id, fromTaskId: id(106), toTaskId: id(121) },
    { id: id(232), workspaceId: base.workspace.id, fromTaskId: id(121), toTaskId: id(122) },
    { id: id(233), workspaceId: base.workspace.id, fromTaskId: id(122), toTaskId: id(123) },
    { id: id(234), workspaceId: base.workspace.id, fromTaskId: id(123), toTaskId: id(114) },
  );
  return [
    { id: id(401), workspaceId: base.workspace.id, name: "Current", description: "The unmodified seeded plan.", snapshot: current, createdAt: CREATED_AT },
    { id: id(402), workspaceId: base.workspace.id, name: "Cut animations", description: "Reduce nonessential motion and graph polish.", snapshot: cutAnimations, createdAt: CREATED_AT },
    { id: id(403), workspaceId: base.workspace.id, name: "Recruit teammate", description: "Add focused demo-production capacity.", snapshot: recruit, createdAt: CREATED_AT },
    { id: id(404), workspaceId: base.workspace.id, name: "Add three features", description: "Test the cost of uncontrolled scope growth.", snapshot: addFeatures, createdAt: CREATED_AT },
  ];
}

export function createDemoWorkspace(workspaceId: string): WorkspaceState {
  const tasks = seedTasks.map((task) => ({ ...task, workspaceId, createdAt: CREATED_AT, updatedAt: CREATED_AT }));
  const activity: ActivityEvent[] = [
    { id: id(501), workspaceId, actor: "system", type: "demo.reset", message: "Loaded the judge-ready THREAD workspace", payload: {}, createdAt: CREATED_AT },
    { id: id(502), workspaceId, actor: "system", type: "analysis.ready", message: "Deterministic planning engine ready", payload: { seed: 20_260_903 }, createdAt: "2026-08-27T13:00:01.000Z" },
  ];
  const base: WorkspaceState = {
    workspace: {
      id: workspaceId,
      name: "Submit THREAD to the WebMCP Challenge",
      objective: "Ship a polished WebMCP project before September 3",
      description: "Human and agent share one dependency graph, one simulation engine, and one persistent state.",
      deadline: DEADLINE,
      availableHours: 66,
      budget: 50,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    tasks,
    dependencies: dependencyPairs.map(([from, to], index) => ({ id: id(201 + index), workspaceId, fromTaskId: id(from), toTaskId: id(to) })),
    constraints: [
      { id: id(301), workspaceId, type: "deadline", title: "Submit before September 3", value: DEADLINE, hard: true, description: "Devpost closes at the deadline." },
      { id: id(302), workspaceId, type: "budget", title: "Stay under $50", value: 50, hard: true, description: "No additional paid services." },
      { id: id(303), workspaceId, type: "scope", title: "Keep WebMCP functionality", value: true, hard: true, description: "Read and mutation tools are non-negotiable." },
    ],
    resources: [{ id: id(305), workspaceId, name: "One developer", type: "person", capacity: 66, cost: 0 }],
    risks: [
      { id: id(351), workspaceId, taskId: id(106), title: "WebMCP integration delay", probability: 0.44, impact: 0.8, mitigation: "Test registration and malformed inputs early.", resolved: false },
      { id: id(352), workspaceId, taskId: id(113), title: "Video production overrun", probability: 0.36, impact: 0.7, mitigation: "Use the seeded script and capture one continuous demo.", resolved: false },
      { id: id(353), workspaceId, taskId: id(109), title: "Deployment instability", probability: 0.3, impact: 0.85, mitigation: "Dry-run, migrate, and verify the custom domain before recording.", resolved: false },
    ],
    scenarios: [],
    decisionPolicy: {
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
      updatedAt: CREATED_AT,
    },
    planProposals: [],
    humanDecisions: [],
    lastProposalApplication: null,
    planRevision: 1,
    activity,
    lastSimulation: null,
    storageMode: "local",
  };
  base.scenarios = makeScenarios(snapshotOf(base));
  return base;
}

export const DEMO_PROMPT = "Open THREAD and optimize this project so I have at least a 90% chance of submitting on time. Keep the budget under $50 and don't remove WebMCP functionality.";
