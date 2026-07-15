-- Add the human recruiter phone-screen stage to the pipeline. It sits between
-- the automated narrowing (assessment + work sample + values review) and the
-- interview loop: a quick human call to confirm logistics — salary range,
-- availability, timeline, "does the person match the paper" — before committing
-- interviewer time. Placed BEFORE 'Interview Scheduled' in the enum ordering.
ALTER TYPE "candidate_stage" ADD VALUE IF NOT EXISTS 'Phone Screen' BEFORE 'Interview Scheduled';
