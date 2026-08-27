import type { PlanSnapshot, WorkspaceState } from "../domain/types";
import { topologicalSort } from "./criticalPath";

export function validatePlanInvariants(plan: PlanSnapshot): string[] {
  const errors: string[] = [];
  const workspaceId = plan.workspace.id;
  const taskIds = new Set<string>();
  const dependencyIds = new Set<string>();
  const recordIds = new Set<string>();
  for (const task of plan.tasks) {
    if (taskIds.has(task.id)) errors.push(`Duplicate task ID: ${task.id}`);
    taskIds.add(task.id);
    if (task.workspaceId !== workspaceId) errors.push(`Task ${task.id} belongs to another workspace`);
  }
  for (const dependency of plan.dependencies) {
    if (dependencyIds.has(dependency.id)) errors.push(`Duplicate dependency ID: ${dependency.id}`);
    dependencyIds.add(dependency.id);
    if (dependency.workspaceId !== workspaceId) errors.push(`Dependency ${dependency.id} belongs to another workspace`);
    if (!taskIds.has(dependency.fromTaskId)) errors.push(`Dependency ${dependency.id} has an unknown source task`);
    if (!taskIds.has(dependency.toTaskId)) errors.push(`Dependency ${dependency.id} has an unknown target task`);
    if (dependency.fromTaskId === dependency.toTaskId) errors.push(`Dependency ${dependency.id} links a task to itself`);
  }
  for (const item of [...plan.constraints, ...plan.resources, ...plan.risks]) {
    if (recordIds.has(item.id)) errors.push(`Duplicate plan record ID: ${item.id}`);
    recordIds.add(item.id);
    if (item.workspaceId !== workspaceId) errors.push(`${"title" in item ? item.title : item.id} belongs to another workspace`);
  }
  for (const risk of plan.risks) {
    if (risk.taskId && !taskIds.has(risk.taskId)) errors.push(`Risk ${risk.id} references an unknown task`);
  }
  try { topologicalSort(plan.tasks, plan.dependencies); }
  catch { errors.push("The dependency graph contains a cycle"); }
  return [...new Set(errors)];
}

export function validateWorkspaceStateInvariants(state: WorkspaceState): string[] {
  const errors = validatePlanInvariants(state);
  const addPlan = (scope: string, plan: PlanSnapshot) => {
    for (const error of validatePlanInvariants(plan)) errors.push(`${scope}: ${error}`);
  };
  const unique = (scope: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) { if (seen.has(id)) errors.push(`${scope}: duplicate ID ${id}`); seen.add(id); }
  };
  unique("scenarios", state.scenarios.map((item) => item.id));
  unique("proposals", state.planProposals.map((item) => item.id));
  unique("decisions", state.humanDecisions.map((item) => item.id));
  unique("activity", state.activity.map((item) => item.id));
  for (const taskId of state.decisionPolicy.preservedTaskIds) if (!state.tasks.some((task) => task.id === taskId)) errors.push(`Decision policy protects unknown task ${taskId}`);
  for (const scenario of state.scenarios) addPlan(`Scenario ${scenario.id}`, scenario.snapshot);
  const proposalIds = new Set(state.planProposals.map((proposal) => proposal.id));
  for (const proposal of state.planProposals) {
    addPlan(`Proposal ${proposal.id}`, proposal.proposedPlan);
    if (proposal.basePlanRevision > state.planRevision) errors.push(`Proposal ${proposal.id} has a future base revision`);
  }
  for (const decision of state.humanDecisions) {
    for (const proposalId of decision.proposalIds) if (!proposalIds.has(proposalId)) errors.push(`Decision ${decision.id} references unknown proposal ${proposalId}`);
    unique(`Decision ${decision.id} options`, decision.options.map((option) => option.id));
    for (const option of decision.options) if (!decision.proposalIds.includes(option.proposalId)) errors.push(`Decision ${decision.id} option ${option.id} references an unrelated proposal`);
  }
  if (state.lastProposalApplication) {
    if (!proposalIds.has(state.lastProposalApplication.proposalId)) errors.push("Rollback record references an unknown proposal");
    addPlan("Rollback record", state.lastProposalApplication.previousPlan);
  }
  return [...new Set(errors)];
}
