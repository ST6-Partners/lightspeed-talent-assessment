-- Re-add the Reference Check pipeline stage (previously added in 0067, removed
-- in 0071). Same position as before: follows the (optional, per-role) Work
-- Sample step and precedes an offer. Flow order lives in domain/stages.ts.
ALTER TYPE "candidate_stage" ADD VALUE IF NOT EXISTS 'Reference Check' BEFORE 'Offered';
