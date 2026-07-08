-- Clear the seeded real-employee roster so internal-announce can't email real
-- @lightspeedsystems.com addresses during testing. Reviewer_id FKs are ON DELETE
-- SET NULL, so existing value reviews are preserved (reviewer becomes unassigned).
DELETE FROM "employees";
