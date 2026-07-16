-- Add the Reference Check pipeline stage. It follows the (now optional,
-- per-role) Work Sample step and precedes an offer. Flow order lives in
-- domain/stages.ts (decoupled from the enum's intrinsic order), so this
-- only needs to make the value legal — position via BEFORE 'Offered'.
ALTER TYPE "candidate_stage" ADD VALUE IF NOT EXISTS 'Reference Check' BEFORE 'Offered';
