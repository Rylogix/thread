ALTER TABLE workspaces ADD COLUMN decision_policy_json TEXT;
ALTER TABLE workspaces ADD COLUMN last_proposal_application_json TEXT;
ALTER TABLE workspaces ADD COLUMN plan_revision INTEGER NOT NULL DEFAULT 1 CHECK (plan_revision > 0);

ALTER TABLE activity_events ADD COLUMN evidence_json TEXT;

CREATE TABLE plan_proposals (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  proposal_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'awaiting-decision', 'rejected', 'applied', 'rolled-back')),
  mode TEXT NOT NULL CHECK (mode IN ('safest', 'fastest', 'highest-impact')),
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE human_decisions (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  decision_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'answered')),
  idempotency_key TEXT,
  requested_at TEXT NOT NULL,
  answered_at TEXT,
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX idx_plan_proposals_workspace_updated ON plan_proposals(workspace_id, updated_at DESC);
CREATE UNIQUE INDEX idx_plan_proposals_idempotency ON plan_proposals(workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_human_decisions_workspace_requested ON human_decisions(workspace_id, requested_at DESC);
CREATE UNIQUE INDEX idx_human_decisions_idempotency ON human_decisions(workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
