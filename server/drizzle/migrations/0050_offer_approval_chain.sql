-- Multi-level offer approval chain (see server/src/db/schema/offerApprovals.ts).
-- `chain` holds the ordered approver steps; `current_step` points at the
-- approver whose sign-off is currently awaited. Existing rows default to an
-- empty chain, which offerApprovalDecide treats as the legacy single gate.
ALTER TABLE "offer_approvals" ADD COLUMN IF NOT EXISTS "chain" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "offer_approvals" ADD COLUMN IF NOT EXISTS "current_step" integer DEFAULT 0 NOT NULL;
