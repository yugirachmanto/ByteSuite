-- Project & Task Management (PM) Module Migration

-- 1. Create pm_projects table
CREATE TABLE IF NOT EXISTS pm_projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outlet_id       UUID REFERENCES outlets(id),
  project_code    TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  owner_id        UUID REFERENCES auth.users(id),
  start_date      DATE,
  end_date        DATE,
  status          TEXT DEFAULT 'active' CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Create pm_tasks table
CREATE TABLE IF NOT EXISTS pm_tasks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id           UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  task_number          TEXT NOT NULL,
  parent_task_id       UUID REFERENCES pm_tasks(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  assignee_id          UUID REFERENCES auth.users(id),
  reporter_id          UUID REFERENCES auth.users(id),
  priority             TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status               TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'in_review', 'blocked', 'done')),
  start_date           DATE,
  due_date             DATE,
  progress_percent     INT DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  estimated_hours      NUMERIC,
  actual_hours         NUMERIC,
  approval_status      TEXT DEFAULT 'not_required' CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected')),
  ai_reminder_enabled  BOOLEAN DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- 3. Task Number Generator Trigger
CREATE OR REPLACE FUNCTION generate_task_number_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_project_code TEXT;
  v_seq INT;
BEGIN
  IF NEW.task_number IS NULL OR NEW.task_number = '' THEN
    SELECT project_code INTO v_project_code FROM pm_projects WHERE id = NEW.project_id;
    IF v_project_code IS NULL THEN
      v_project_code := 'PRJ';
    END IF;
    SELECT COALESCE(MAX(SPLIT_PART(task_number, '-T', 2)::INT), 0) + 1
      INTO v_seq
      FROM pm_tasks WHERE project_id = NEW.project_id;
    NEW.task_number := v_project_code || '-T' || LPAD(v_seq::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_task_number ON pm_tasks;
CREATE TRIGGER trg_generate_task_number
BEFORE INSERT ON pm_tasks
FOR EACH ROW
EXECUTE FUNCTION generate_task_number_fn();

-- 4. Create pm_task_dependencies table
CREATE TABLE IF NOT EXISTS pm_task_dependencies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id             UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  depends_on_task_id  UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  dependency_type     TEXT DEFAULT 'FS' CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, depends_on_task_id)
);

-- 5. Create pm_task_comments table
CREATE TABLE IF NOT EXISTS pm_task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id     UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES auth.users(id),
  author_type TEXT DEFAULT 'user' CHECK (author_type IN ('user', 'ai')),
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 6. Create pm_task_attachments table
CREATE TABLE IF NOT EXISTS pm_task_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id     UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  mime_type   TEXT,
  file_size   INT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 7. Create approval tables
CREATE TABLE IF NOT EXISTS pm_approval_chains (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  applies_to  TEXT DEFAULT 'task' CHECK (applies_to IN ('task', 'project_milestone')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pm_approval_steps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id          UUID NOT NULL REFERENCES pm_approval_chains(id) ON DELETE CASCADE,
  step_order        INT NOT NULL,
  approver_role     TEXT,
  approver_user_id  UUID REFERENCES auth.users(id),
  is_required       BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pm_task_approvals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id     UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  chain_id    UUID NOT NULL REFERENCES pm_approval_chains(id) ON DELETE CASCADE,
  step_order  INT NOT NULL,
  approver_id UUID REFERENCES auth.users(id),
  decision    TEXT DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'rejected')),
  decided_at  TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 8. Create pm_ai_reminders table
CREATE TABLE IF NOT EXISTS pm_ai_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id       UUID NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('due_soon', 'overdue', 'stale_in_progress', 'approval_pending')),
  scheduled_at  TIMESTAMPTZ NOT NULL,
  sent_at       TIMESTAMPTZ,
  channel       TEXT DEFAULT 'in_app',
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 9. Create MoM (Minutes of Meeting) tables
CREATE TABLE IF NOT EXISTS pm_mom_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id),
  file_path   TEXT,
  raw_text    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pm_mom_extractions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mom_id            UUID NOT NULL REFERENCES pm_mom_documents(id) ON DELETE CASCADE,
  task_id           UUID REFERENCES pm_tasks(id) ON DELETE SET NULL,
  action            TEXT CHECK (action IN ('update_progress', 'update_status', 'suggest_new_task', 'no_action')),
  suggested_data    JSONB,
  match_confidence  TEXT CHECK (match_confidence IN ('high', 'medium', 'low', 'none')),
  evidence          TEXT,
  review_status     TEXT DEFAULT 'pending_review' CHECK (review_status IN ('pending_review', 'applied', 'discarded')),
  reviewed_by       UUID REFERENCES auth.users(id),
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 10. Create pm_weekly_recaps table
CREATE TABLE IF NOT EXISTS pm_weekly_recaps (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start         DATE NOT NULL,
  week_end           DATE NOT NULL,
  completed_task_ids UUID[] DEFAULT '{}',
  upcoming_task_ids  UUID[] DEFAULT '{}',
  summary_text       TEXT NOT NULL,
  generated_at       TIMESTAMPTZ DEFAULT now()
);

-- 11. Enable Row Level Security (RLS) on all PM tables
ALTER TABLE pm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_approval_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_task_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_ai_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_mom_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_mom_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_weekly_recaps ENABLE ROW LEVEL SECURITY;

-- 12. Create RLS Policies for Org Access
CREATE POLICY "Org access pm_projects" ON pm_projects FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));
CREATE POLICY "Org access pm_tasks" ON pm_tasks FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));
CREATE POLICY "Org access pm_task_dependencies" ON pm_task_dependencies FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));
CREATE POLICY "Org access pm_task_comments" ON pm_task_comments FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));
CREATE POLICY "Org access pm_task_attachments" ON pm_task_attachments FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));
CREATE POLICY "Org access pm_approval_chains" ON pm_approval_chains FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));
CREATE POLICY "Org access pm_approval_steps" ON pm_approval_steps FOR ALL USING (chain_id IN (SELECT id FROM pm_approval_chains WHERE org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid())));
CREATE POLICY "Org access pm_task_approvals" ON pm_task_approvals FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));
CREATE POLICY "Org access pm_ai_reminders" ON pm_ai_reminders FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));
CREATE POLICY "Org access pm_mom_documents" ON pm_mom_documents FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));
CREATE POLICY "Org access pm_mom_extractions" ON pm_mom_extractions FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));
CREATE POLICY "Org access pm_weekly_recaps" ON pm_weekly_recaps FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));
