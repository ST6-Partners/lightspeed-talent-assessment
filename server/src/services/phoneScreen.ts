// ============================================================
// PHONE-SCREEN SCHEDULING (recruiter-first)
//
// When a candidate enters the Phone Screen stage we do NOT email the candidate
// yet. Instead the recruiter is emailed a tokenized link to submit availability.
// Once the recruiter submits (see scheduling.submitPhoneScreenAvailability), the
// candidate is emailed those windows to confirm — or to say none of them work.
// ============================================================

import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { candidates, jobDescriptions } from '../db/schema/hiring.js';
import { emailPhoneScreenRecruiterAvailability } from './email.js';

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway}`;
  return '';
}

// Kick off recruiter-first scheduling: mint the recruiter availability token and
// email the recruiter the link. Idempotent — reuses an existing token.
export async function startPhoneScreenScheduling(db: any, candidateId: string): Promise<void> {
  const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, candidateId) });
  if (!candidate) return;

  const token = candidate.phoneScreenRecruiterToken ?? randomUUID();
  if (!candidate.phoneScreenRecruiterToken) {
    await db.update(candidates)
      .set({ phoneScreenRecruiterToken: token, updatedAt: new Date() })
      .where(eq(candidates.id, candidateId));
  }

  const jd = candidate.jdId
    ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
    : null;
  const jobTitle: string | undefined = (jd as any)?.jobTitle ?? undefined;
  const availabilityUrl = `${appBaseUrl()}/phone-screen-availability/${token}`;

  await emailPhoneScreenRecruiterAvailability({
    candidateName: `${candidate.firstName} ${candidate.lastName}`,
    jobTitle,
    availabilityUrl,
  }).catch((err) => console.error('[phoneScreen] recruiter availability email failed:', err));

  console.log(`[phoneScreen] recruiter availability requested for ${candidate.email}`);
}
