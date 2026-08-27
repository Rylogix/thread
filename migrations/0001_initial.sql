PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  deadline TEXT NOT NULL,
  available_hours REAL NOT NULL CHECK (available_hours >= 0),
  budget REAL NOT NULL CHECK (budget >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('task', 'milestone')),
  status TEXT NOT NULL CHECK (status IN ('todo', 'in-progress', 'blocked', 'done')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  estimated_hours REAL NOT NULL CHECK (estimated_hours >= 0),
  minimum_hours REAL NOT NULL CHECK (minimum_hours >= 0),
  maximum_hours REAL NOT NULL CHECK (maximum_hours >= minimum_hours),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  cost REAL NOT NULL CHECK (cost >= 0),
  x REAL NOT NULL,
  y REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dependencies (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  to_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(workspace_id, from_task_id, to_task_id)
);

CREATE TABLE IF NOT EXISTS constraints (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  value_json TEXT NOT NULL,
  hard INTEGER NOT NULL CHECK (hard IN (0, 1)),
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  capacity REAL NOT NULL CHECK (capacity >= 0),
  cost REAL NOT NULL CHECK (cost >= 0)
);

CREATE TABLE IF NOT EXISTS risks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  probability REAL NOT NULL CHECK (probability >= 0 AND probability <= 1),
  impact REAL NOT NULL CHECK (impact >= 0 AND impact <= 1),
  mitigation TEXT NOT NULL DEFAULT '',
  resolved INTEGER NOT NULL CHECK (resolved IN (0, 1))
);

CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor TEXT NOT NULL CHECK (actor IN ('human', 'agent', 'system')),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_workspace ON dependencies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_from ON dependencies(from_task_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_to ON dependencies(to_task_id);
CREATE INDEX IF NOT EXISTS idx_constraints_workspace ON constraints(workspace_id);
CREATE INDEX IF NOT EXISTS idx_resources_workspace ON resources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_risks_workspace ON risks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_workspace ON scenarios(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activity_workspace_created ON activity_events(workspace_id, created_at DESC);
