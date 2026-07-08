ALTER TABLE "value_reviews" ADD COLUMN IF NOT EXISTS "interview_id" uuid REFERENCES "candidate_interviews"("id") ON DELETE SET NULL;
