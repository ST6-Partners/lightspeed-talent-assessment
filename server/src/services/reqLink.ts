// ============================================================
// reqLink — resolve which requisition a job description belongs to.
//
// Under the reusable-JD model a JD is library content that can be linked FROM
// many requisitions (job_requisitions.base_jd_id). Older JDs may still carry the
// legacy 1:1 job_descriptions.req_id. This helper hides that transition: given a
// JD id, return the requisition id (or null), preferring the JD's own req_id and
// falling back to the requisition that points at it via base_jd_id.
// ============================================================

import { eq } from 'drizzle-orm';
import { jobDescriptions, jobRequisitions } from '../db/schema/hiring.js';

export async function resolveReqIdForJd(
  db: any,
  jdId: string | null | undefined,
): Promise<string | null> {
  if (!jdId) return null;
  const jd = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, jdId) });
  if (jd?.reqId) return jd.reqId as string;
  const req = await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.baseJdId, jdId) });
  return (req?.id as string) ?? null;
}
