-- V0095__sr_driver_academy.sql
-- SR-ACADEMY-BE-001: course, quiz, completion and retraining data service.
--
-- Creates the four new academy primary tables (schema-allocation.json
-- SR-ACADEMY-BE-001 entry) and corrects the pre-existing
-- reg.driver_training_records / reg.driver_reg_profiles driver_id columns to
-- the runtime text-id model, per
-- docs/04-uat/system-remediation-20260906/academy-identity-decision.md §2.1,
-- §2.4, following the V0055 precedent for the same trap
-- (reg.drivers is a uuid-keyed table with no runtime write path; the only
-- driver identity any write path actually creates is the varchar(100)
-- drv_<uuid> text id minted by regulatory-registry.service.ts and persisted
-- to reg.phase1_registry_drivers).
--
-- Idempotent / deploy-safe. No destructive rewrite: no DROP TABLE, TRUNCATE,
-- or data-losing ALTER. The ::text cast preserves any existing row verbatim.

-- 1. New academy tables. Course/module/question rows are versioned
--    (course_id, course_version) snapshots: republishing a course inserts a
--    new version row rather than mutating history, so past attempts remain
--    gradeable/traceable against the exact content they were graded with.

CREATE TABLE IF NOT EXISTS reg.phase1_driver_academy_courses (
  course_id varchar(100) NOT NULL,
  course_version integer NOT NULL,
  course_code varchar(100) NOT NULL,
  title varchar(200) NOT NULL,
  category varchar(50) NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  validity_days integer NULL,
  passing_score numeric(5,2) NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, course_version)
);

CREATE TABLE IF NOT EXISTS reg.phase1_driver_academy_modules (
  course_id varchar(100) NOT NULL,
  course_version integer NOT NULL,
  module_id varchar(100) NOT NULL,
  title varchar(200) NOT NULL,
  module_type varchar(50) NOT NULL,
  content_url text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (course_id, course_version, module_id),
  FOREIGN KEY (course_id, course_version)
    REFERENCES reg.phase1_driver_academy_courses (course_id, course_version)
);

CREATE TABLE IF NOT EXISTS reg.phase1_driver_quiz_questions (
  course_id varchar(100) NOT NULL,
  course_version integer NOT NULL,
  question_id varchar(100) NOT NULL,
  prompt text NOT NULL,
  options jsonb NOT NULL,
  correct_option_id varchar(100) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (course_id, course_version, question_id),
  FOREIGN KEY (course_id, course_version)
    REFERENCES reg.phase1_driver_academy_courses (course_id, course_version)
);

-- driver_id is the runtime text id (varchar(100), drv_<uuid>) minted by
-- regulatory-registry.service.ts; no FK, matching
-- reg.phase1_registry_drivers.driver_id / the V0055 precedent. Existence is
-- validated by the backend, not a DB-level FK (academy-identity-decision.md
-- §3 negative acceptance).
CREATE TABLE IF NOT EXISTS reg.phase1_driver_quiz_attempts (
  attempt_id varchar(100) PRIMARY KEY,
  course_id varchar(100) NOT NULL,
  course_version integer NOT NULL,
  driver_id varchar(100) NOT NULL,
  attempted_at timestamptz NOT NULL,
  score numeric(5,2) NOT NULL,
  passed boolean NOT NULL,
  answers_summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (course_id, course_version)
    REFERENCES reg.phase1_driver_academy_courses (course_id, course_version)
);

CREATE INDEX IF NOT EXISTS idx_phase1_driver_academy_modules_course
  ON reg.phase1_driver_academy_modules (course_id, course_version, sort_order);
CREATE INDEX IF NOT EXISTS idx_phase1_driver_quiz_questions_course
  ON reg.phase1_driver_quiz_questions (course_id, course_version, sort_order);
CREATE INDEX IF NOT EXISTS idx_phase1_driver_quiz_attempts_driver_course
  ON reg.phase1_driver_quiz_attempts (driver_id, course_id, attempted_at DESC);

-- 2. Correct the identity model on the two pre-existing shared regulatory
--    tables the academy backend must write to (academy-identity-decision.md
--    §2.4). No prefix stripping, hashing, casting to uuid, or synthetic
--    reg.drivers parent-row creation. reg.drivers itself is untouched.

ALTER TABLE IF EXISTS reg.driver_training_records
  DROP CONSTRAINT IF EXISTS driver_training_records_driver_id_fkey;
ALTER TABLE IF EXISTS reg.driver_training_records
  ALTER COLUMN driver_id TYPE varchar(100) USING driver_id::text;

ALTER TABLE IF EXISTS reg.driver_reg_profiles
  DROP CONSTRAINT IF EXISTS driver_reg_profiles_driver_id_fkey;
ALTER TABLE IF EXISTS reg.driver_reg_profiles
  ALTER COLUMN driver_id TYPE varchar(100) USING driver_id::text;

-- 3. Seed the one published course referenced by feature-contracts.md §3.5
--    example payloads, so the read APIs have real, non-fixture content out
--    of the box. Idempotent: a second migration run is a no-op.

INSERT INTO reg.phase1_driver_academy_courses (
  course_id, course_version, course_code, title, category,
  is_required, validity_days, passing_score, description
) VALUES (
  'crs_basics_001', 1, 'platform_basics', '平台合作基礎', 'compliance',
  true, 365, 80,
  '平台合作司機必修的基礎合規課程，涵蓋接單規範、乘客權益與安全作業要求。'
)
ON CONFLICT (course_id, course_version) DO NOTHING;

INSERT INTO reg.phase1_driver_academy_modules (
  course_id, course_version, module_id, title, module_type, content_url,
  duration_minutes, sort_order
) VALUES
  ('crs_basics_001', 1, 'mod_basics_intro', '平台合作司機須知', 'video',
   'https://academy.internal.example/videos/platform-basics-intro', 12, 1),
  ('crs_basics_001', 1, 'mod_basics_sop', '接單與行前檢查 SOP', 'sop',
   'https://academy.internal.example/sop/platform-basics-checklist', 8, 2)
ON CONFLICT (course_id, course_version, module_id) DO NOTHING;

INSERT INTO reg.phase1_driver_quiz_questions (
  course_id, course_version, question_id, prompt, options,
  correct_option_id, sort_order
) VALUES
  ('crs_basics_001', 1, 'q_basics_1', '司機於接單前，下列何者為必要行前檢查項目？',
   '[{"optionId":"opt_a","text":"確認行照與強制險有效"},{"optionId":"opt_b","text":"清空油箱"},{"optionId":"opt_c","text":"更換車牌"}]'::jsonb,
   'opt_a', 1),
  ('crs_basics_001', 1, 'q_basics_2', '乘客要求繞路且未影響安全時，司機應如何處理？',
   '[{"optionId":"opt_a","text":"直接拒絕不予理會"},{"optionId":"opt_b","text":"依平台規範確認並可能調整車資後配合"},{"optionId":"opt_c","text":"中途請乘客下車"}]'::jsonb,
   'opt_b', 2)
ON CONFLICT (course_id, course_version, question_id) DO NOTHING;
