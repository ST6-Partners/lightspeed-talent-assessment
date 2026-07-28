-- New-role intake now captures the role/JD title up front (popup on the intake
-- form). Stored on the requisition and used as the generated JD's jobTitle.
ALTER TABLE "job_requisitions" ADD COLUMN IF NOT EXISTS "role_title" varchar(200);
