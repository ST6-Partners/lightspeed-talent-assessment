-- Add Rejected + Changes Requested to the requisition status so a rejected step
-- in the approval chain rolls up to a Rejected status, and "send back for edits"
-- has its own non-rejected state.
ALTER TYPE "requisition_status" ADD VALUE IF NOT EXISTS 'Rejected';
ALTER TYPE "requisition_status" ADD VALUE IF NOT EXISTS 'Changes Requested';
