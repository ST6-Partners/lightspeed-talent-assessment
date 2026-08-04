-- Tokenized link for the candidate to pick a time for an interview round from the
-- assigned interviewer's already-submitted availability (interviewer_availability,
-- collected at intake approval). Minted the first time a round's scheduling opens.
ALTER TABLE "candidate_interviews" ADD COLUMN IF NOT EXISTS "booking_token" varchar(64);
