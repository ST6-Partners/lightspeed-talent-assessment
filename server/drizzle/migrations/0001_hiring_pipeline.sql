-- ============================================================
-- HIRING PIPELINE MIGRATION
-- Adds: job_requisitions, job_descriptions, candidates,
--       candidate_stage_history, email_log
-- ============================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE candidate_stage AS ENUM (
    'Applied', 'Assessment', 'Work Sample', 'Values Review',
    'Interview Scheduled', 'Interviewed', 'Offered', 'Hired', 'Rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE requisition_status AS ENUM (
    'Draft', 'Pending Approval', 'Approved', 'Open', 'On Hold', 'Closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE jd_status AS ENUM ('Draft', 'Published', 'Closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE email_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- job_requisitions
CREATE TABLE IF NOT EXISTS job_requisitions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department       VARCHAR(200) NOT NULL,
  hiring_manager   VARCHAR(200) NOT NULL,
  num_openings     INTEGER NOT NULL DEFAULT 1,
  employment_type  VARCHAR(50) NOT NULL DEFAULT 'Full-Time',
  location         VARCHAR(200),
  remote           BOOLEAN NOT NULL DEFAULT false,
  target_start_date TIMESTAMPTZ,
  salary_min       INTEGER,
  salary_max       INTEGER,
  reason           TEXT,
  priority         VARCHAR(20) NOT NULL DEFAULT 'Medium',
  status           requisition_status NOT NULL DEFAULT 'Draft',
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- job_descriptions
CREATE TABLE IF NOT EXISTS job_descriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  req_id                   UUID NOT NULL REFERENCES job_requisitions(id) ON DELETE CASCADE,
  job_title                VARCHAR(300) NOT NULL,
  summary                  TEXT,
  responsibilities         TEXT,
  required_qualifications  TEXT,
  preferred_qualifications TEXT,
  ccat_threshold           INTEGER NOT NULL DEFAULT 30,
  epp_values               JSONB DEFAULT '[]',
  work_sample_instructions TEXT,
  status                   jd_status NOT NULL DEFAULT 'Draft',
  published_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- candidates
CREATE TABLE IF NOT EXISTS candidates (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jd_id                  UUID REFERENCES job_descriptions(id) ON DELETE SET NULL,
  first_name             VARCHAR(100) NOT NULL,
  last_name              VARCHAR(100) NOT NULL,
  email                  VARCHAR(300) NOT NULL,
  phone                  VARCHAR(50),
  linkedin_url           TEXT,
  resume_url             TEXT,
  source                 VARCHAR(100),
  current_stage          candidate_stage NOT NULL DEFAULT 'Applied',
  rejection_reason       TEXT,
  criteria_corp_id       VARCHAR(100),
  ccat_score             INTEGER,
  epp_profile            JSONB,
  epp_values_match_score INTEGER,
  work_sample_score      INTEGER,
  resume_review_score    INTEGER,
  reference_check_score  INTEGER,
  interviewer_name       VARCHAR(200),
  zoom_meeting_id        VARCHAR(100),
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- candidate_stage_history
CREATE TABLE IF NOT EXISTS candidate_stage_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  from_stage    candidate_stage,
  to_stage      candidate_stage NOT NULL,
  changed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- email_log
CREATE TABLE IF NOT EXISTS email_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  recipient     VARCHAR(300) NOT NULL,
  template      VARCHAR(100) NOT NULL,
  subject       VARCHAR(500),
  status        email_status NOT NULL DEFAULT 'pending',
  error         TEXT,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_candidates_jd_id ON candidates(jd_id);
CREATE INDEX IF NOT EXISTS idx_candidates_stage ON candidates(current_stage);
CREATE INDEX IF NOT EXISTS idx_stage_history_candidate ON candidate_stage_history(candidate_id);
CREATE INDEX IF NOT EXISTS idx_email_log_candidate ON email_log(candidate_id);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_req_id ON job_descriptions(req_id);
