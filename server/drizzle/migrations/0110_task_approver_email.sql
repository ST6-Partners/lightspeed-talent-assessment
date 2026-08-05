-- Persist the task's approval recipient so the library can show "pending
-- approval from X" and the review request can be resent / redirected after a
-- mistyped address (previously the approver email was only used to send once).
ALTER TABLE "assessment_tasks" ADD COLUMN IF NOT EXISTS "approver_email" varchar(300);
