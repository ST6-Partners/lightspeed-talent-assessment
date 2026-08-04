-- Rename the "Offered" pipeline stage to "Offer". The stage now means "the
-- candidate is in the offer step" (reached when reference checks clear), and
-- sending the actual offer letter is the follow-on action from the Offer section
-- — so the present-tense "Offer" reads correctly, where past-tense "Offered"
-- implied the letter had already gone out. RENAME VALUE updates every existing
-- row that uses the value (candidates.current_stage, candidate_stage_history)
-- in place, so no data backfill is needed. Guarded so a re-run is a no-op.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'candidate_stage' AND e.enumlabel = 'Offered'
  ) THEN
    ALTER TYPE "candidate_stage" RENAME VALUE 'Offered' TO 'Offer';
  END IF;
END $$;
