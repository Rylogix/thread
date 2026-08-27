PRAGMA defer_foreign_keys = TRUE;

CREATE TABLE tasks_scoped (
  id TEXT NOT NULL,
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
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE dependencies_scoped (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_task_id TEXT NOT NULL,
  to_task_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, from_task_id, to_task_id),
  FOREIGN KEY (workspace_id, from_task_id) REFERENCES tasks_scoped(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, to_task_id) REFERENCES tasks_scoped(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE constraints_scoped (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  value_json TEXT NOT NULL,
  hard INTEGER NOT NULL CHECK (hard IN (0, 1)),
  description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE resources_scoped (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  capacity REAL NOT NULL CHECK (capacity >= 0),
  cost REAL NOT NULL CHECK (cost >= 0),
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE risks_scoped (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id TEXT,
  title TEXT NOT NULL,
  probability REAL NOT NULL CHECK (probability >= 0 AND probability <= 1),
  impact REAL NOT NULL CHECK (impact >= 0 AND impact <= 1),
  mitigation TEXT NOT NULL DEFAULT '',
  resolved INTEGER NOT NULL CHECK (resolved IN (0, 1)),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, task_id) REFERENCES tasks_scoped(workspace_id, id) ON DELETE SET NULL
);

CREATE TABLE scenarios_scoped (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE activity_events_scoped (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor TEXT NOT NULL CHECK (actor IN ('human', 'agent', 'system')),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

INSERT INTO tasks_scoped SELECT * FROM tasks;
INSERT INTO dependencies_scoped SELECT * FROM dependencies;
INSERT INTO constraints_scoped SELECT * FROM constraints;
INSERT INTO resources_scoped SELECT * FROM resources;
INSERT INTO risks_scoped SELECT * FROM risks;
INSERT INTO scenarios_scoped SELECT * FROM scenarios;
INSERT INTO activity_events_scoped SELECT * FROM activity_events;

DROP TABLE dependencies;
DROP TABLE risks;
DROP TABLE tasks;
DROP TABLE constraints;
DROP TABLE resources;
DROP TABLE scenarios;
DROP TABLE activity_events;

ALTER TABLE tasks_scoped RENAME TO tasks;
ALTER TABLE dependencies_scoped RENAME TO dependencies;
ALTER TABLE constraints_scoped RENAME TO constraints;
ALTER TABLE resources_scoped RENAME TO resources;
ALTER TABLE risks_scoped RENAME TO risks;
ALTER TABLE scenarios_scoped RENAME TO scenarios;
ALTER TABLE activity_events_scoped RENAME TO activity_events;

CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX idx_dependencies_workspace ON dependencies(workspace_id);
CREATE INDEX idx_dependencies_from ON dependencies(workspace_id, from_task_id);
CREATE INDEX idx_dependencies_to ON dependencies(workspace_id, to_task_id);
CREATE INDEX idx_constraints_workspace ON constraints(workspace_id);
CREATE INDEX idx_resources_workspace ON resources(workspace_id);
CREATE INDEX idx_risks_workspace ON risks(workspace_id);
CREATE INDEX idx_scenarios_workspace ON scenarios(workspace_id);
CREATE INDEX idx_activity_workspace_created ON activity_events(workspace_id, created_at DESC);

PRAGMA defer_foreign_keys = FALSE;
