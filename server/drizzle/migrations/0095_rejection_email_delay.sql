-- Delayed-send "undo window" for the manual rejection email. On a manual reject the
-- candidate is stamped with rejection_email_send_after = now + 2 min (instead of the
-- email firing immediately); the every-minute send-due-rejection-emails job sends it
-- once due and still Rejected, then clears the stamp. Unreject clears it, cancelling.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "rejection_email_send_after" timestamptz;
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "rejection_email_from_stage" varchar(50);
