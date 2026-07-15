-- Add a distinct terminal candidate disposition for role-closed / role-filled
-- candidates. This is deliberately NOT 'Rejected': these candidates were not
-- individually declined on their merits — their candidacy ended because the
-- requisition closed or filled. Keeping it separate preserves clean rejection
-- semantics for adverse-impact reporting.
ALTER TYPE "candidate_stage" ADD VALUE IF NOT EXISTS 'Not Selected';
