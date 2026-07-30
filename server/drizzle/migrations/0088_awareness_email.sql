-- Awareness-list recipients can now carry an email (name stays in person_ref),
-- so the hiring kickoff actually reaches them instead of only rendering a name.
ALTER TABLE "awareness_list" ADD COLUMN IF NOT EXISTS "email" varchar(300);
