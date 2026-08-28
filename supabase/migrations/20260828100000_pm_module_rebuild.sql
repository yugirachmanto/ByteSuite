-- Rebuild the Project Management module as an outlet-scoped module.
--
-- The previous pm_* schema (kanban, Gantt, AI chat comments, approval
-- chains, AI meeting-notes extraction) was org-wide only: pm_projects.outlet_id
-- was nullable/unused and pm_tasks had no outlet_id at all, so it never
-- followed the outlet-isolation rule used by every other module (invoices,
-- stock_batches, etc). Per product decision, this is a full rebuild rather
-- than a retrofit: drop the old tables (only one test project/task existed,
-- confirmed disposable) and recreate a smaller, properly outlet-scoped
-- schema — kanban + Gantt + time tracking + plain comments + links to
-- invoices/outlets/items. AI chat, approval chains, and MoM extraction are
-- intentionally dropped.

DROP TABLE IF EXISTS
  pm_weekly_recaps,
  pm_mom_extractions,
  pm_mom_documents,
  pm_ai_reminders,
  pm_task_approvals,
  pm_approval_steps,
  pm_approval_chains,
  pm_task_attachments,
  pm_task_comments,
  pm_task_dependencies,
  pm_tasks,
  pm_projects
CASCADE;

-- 1. Projects -----------------------------------------------------------

CREATE TABLE pm_projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  outlet_id   UUID NOT NULL REFERENCES outlets(id),
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'planning'
              CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  start_date  DATE,
  end_date    DATE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tasks ----------------------------------------------------------------
-- outlet_id/org_id are denormalized from the parent project (same
-- convention used elsewhere, e.g. invoices/stock_batches carry outlet_id
-- directly rather than requiring a join for RLS).

CREATE TABLE pm_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id),
  outlet_id   UUID NOT NULL REFERENCES outlets(id),
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'todo'
              CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  priority    TEXT NOT NULL DEFAULT 'medium'
              CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assignee_id UUID REFERENCES auth.users(id),
  start_date  DATE,
  due_date    DATE,
  position    INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Links to other ERP entities (invoices / outlets / items) -------------
-- Polymorphic by design: entity_id has no real FK since it can point at
-- three different tables. This is a documented exception to the rest of
-- the schema (validated in application code, not the database).

CREATE TABLE pm_task_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  outlet_id   UUID NOT NULL REFERENCES outlets(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('invoice', 'outlet', 'item')),
  entity_id   UUID NOT NULL,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, entity_type, entity_id)
);

-- 4. Comments ---------------------------------------------------------------

CREATE TABLE pm_task_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  outlet_id  UUID NOT NULL REFERENCES outlets(id),
  author_id  UUID REFERENCES auth.users(id),
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Time tracking (new) ------------------------------------------------

CREATE TABLE pm_time_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  outlet_id        UUID NOT NULL REFERENCES outlets(id),
  user_id          UUID REFERENCES auth.users(id),
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  duration_minutes INTEGER,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes -------------------------------------------------------------------

CREATE INDEX idx_pm_projects_outlet ON pm_projects(outlet_id);
CREATE INDEX idx_pm_tasks_outlet ON pm_tasks(outlet_id);
CREATE INDEX idx_pm_tasks_project_status ON pm_tasks(project_id, status);
CREATE INDEX idx_pm_task_links_outlet ON pm_task_links(outlet_id);
CREATE INDEX idx_pm_task_links_task ON pm_task_links(task_id);
CREATE INDEX idx_pm_task_comments_outlet ON pm_task_comments(outlet_id);
CREATE INDEX idx_pm_task_comments_task ON pm_task_comments(task_id);
CREATE INDEX idx_pm_time_entries_outlet ON pm_time_entries(outlet_id);
CREATE INDEX idx_pm_time_entries_task ON pm_time_entries(task_id);

-- RLS -------------------------------------------------------------------
-- Same inline outlet-array pattern used for invoices/stock_batches/etc
-- (supabase/migrations/20240504000000_init.sql).

ALTER TABLE pm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Outlet access" ON pm_projects FOR ALL
  USING (outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Outlet access" ON pm_tasks FOR ALL
  USING (outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Outlet access" ON pm_task_links FOR ALL
  USING (outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Outlet access" ON pm_task_comments FOR ALL
  USING (outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Outlet access" ON pm_time_entries FOR ALL
  USING (outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()));

-- updated_at triggers ---------------------------------------------------
-- Reuses update_updated_at_column() (originally defined in
-- 20240511000002_product_prices.sql); re-declared defensively since this
-- project's live schema has drifted from its migration files before.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_pm_projects_updated_at
  BEFORE UPDATE ON pm_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pm_tasks_updated_at
  BEFORE UPDATE ON pm_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Realtime -----------------------------------------------------------------
-- A freshly created table isn't automatically part of the supabase_realtime
-- publication (confirmed empty for this project before this migration) —
-- without this, TaskComments' postgres_changes subscription silently never
-- fires and new comments only appear after a manual refetch.

ALTER PUBLICATION supabase_realtime ADD TABLE pm_task_comments;
