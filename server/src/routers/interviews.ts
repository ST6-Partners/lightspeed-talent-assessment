// ============================================================
// INTERVIEWS ROUTER — per-candidate, multi-round interviews.
//
// Each round is its own record (interviewer, schedule, transcript,
// score, feedback, follow-ups). The prep email for a round carries a
// briefing compiled from earlier COMPLETED rounds: the read on the
// candidate (scores hidden) + the follow-up list, minus the coaching
// notes written for the earlier interviewers.
// ============================================================

import { z } from 'zod';
import { eq, asc, sql, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { db } from '../db.js';
import { candidateInterviews } from '../db/schema/interviews.js';
import { candidates, jobDescriptions, jobRequisitions } from '../db/schema/hiring.js';
import { interviewQuestions } from '../db/schema/intake.js';
import {
  seedRoundsFromPlan,
  generateRoundFeedback,
  buildPriorRoundsBriefing,
} from '../services/interviewRounds.js';
import { emailInterviewRoundPrep } from '../services/email.js';

const roundStatus = z.enum(['planned', 'scheduled', 'completed']);

async function loadRound(id: string) {
  const round = (await db.select().from(candidateInterviews).where(eq(candidateInterviews.id, id)).limit(1))[0];
  if (!round) throw new TRPCError({ code: 'NOT_FOUND', message: 'Interview round not found.' });
  return round;
}

export const interviewsRouter = router({
  // All rounds for a candidate, in order.
  list: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ input }) => {
      return db.select().from(candidateInterviews)
        .where(eq(candidateInterviews.candidateId, input.candidateId))
        .orderBy(asc(candidateInterviews.sortOrder));
    }),

  // Seed rounds from the requisition's interview plan (idempotent).
  seedFromPlan: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return seedRoundsFromPlan(input.candidateId);
    }),

  // The role's STANDARD (~70%) interview question set for this candidate's
  // opening. Candidate-agnostic; stored per requisition. Resolves the opening
  // the same way rounds do (reqs tied to the JD, preferring Open/Approved).
  standardQuestions: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ input }) => {
      const cand = await db.query.candidates.findFirst({ where: eq(candidates.id, input.candidateId) });
      if (!cand?.jdId) return { questions: [] as any[], source: null as string | null };
      const jd = await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, cand.jdId) });
      const byId = new Map<string, any>();
      const reuse = await db.select().from(jobRequisitions).where(eq(jobRequisitions.baseJdId, cand.jdId));
      for (const r of reuse) byId.set(r.id, r);
      if (jd?.reqId) {
        const home = await db.query.jobRequisitions.findFirst({ where: eq(jobRequisitions.id, jd.reqId) });
        if (home) byId.set(home.id, home);
      }
      const reqs = [...byId.values()];
      if (!reqs.length) return { questions: [] as any[], source: null as string | null };
      const rank = (st: string | null | undefined) => (st === 'Open' ? 3 : st === 'Approved' ? 2 : st === 'Pending Approval' ? 1 : 0);
      reqs.sort((a, b) => rank(b.status) - rank(a.status) || (new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()));
      const row = (await db.select().from(interviewQuestions)
        .where(eq(interviewQuestions.reqId, reqs[0].id))
        .orderBy(desc(interviewQuestions.createdAt)).limit(1))[0];
      return { questions: (row?.questions as any[]) ?? [], source: (row?.source as string | null) ?? null };
    }),

  // Add one round to the end.
  addRound: protectedProcedure
    .input(z.object({
      candidateId: z.string().uuid(),
      roundName: z.string().min(1).max(120),
      interviewerName: z.string().max(200).optional(),
      interviewerEmail: z.string().email().max(300).optional(),
    }))
    .mutation(async ({ input }) => {
      const maxRow = (await db.select({ m: sql<number>`coalesce(max(${candidateInterviews.sortOrder}), -1)` })
        .from(candidateInterviews)
        .where(eq(candidateInterviews.candidateId, input.candidateId)))[0];
      const nextOrder = (maxRow?.m ?? -1) + 1;
      const [row] = await db.insert(candidateInterviews).values({
        candidateId: input.candidateId,
        roundName: input.roundName,
        interviewerName: input.interviewerName ?? null,
        interviewerEmail: input.interviewerEmail ?? null,
        sortOrder: nextOrder,
      }).returning();
      return row;
    }),

  // Update round fields (interviewer, schedule, status, name).
  updateRound: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      roundName: z.string().min(1).max(120).optional(),
      interviewerName: z.string().max(200).nullable().optional(),
      interviewerEmail: z.string().email().max(300).nullable().optional(),
      scheduledAt: z.string().datetime().nullable().optional(),
      status: roundStatus.optional(),
    }))
    .mutation(async ({ input }) => {
      // Enforce the 48-hour window: setting a round time can't spread this
      // candidate's scheduled rounds more than 48h apart.
      if (input.scheduledAt) {
        const current = await loadRound(input.id);
        const siblings = await db.select().from(candidateInterviews)
          .where(eq(candidateInterviews.candidateId, current.candidateId));
        const times = siblings
          .filter((r: any) => r.id !== input.id && r.scheduledAt)
          .map((r: any) => new Date(r.scheduledAt).getTime());
        times.push(new Date(input.scheduledAt).getTime());
        if (times.length > 1) {
          const spreadH = (Math.max(...times) - Math.min(...times)) / 3_600_000;
          if (spreadH > 48) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `That time would spread this candidate's interview rounds across ${Math.round(spreadH)} hours. Keep all rounds within 48 hours of each other.`,
            });
          }
        }
      }
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.roundName !== undefined) patch.roundName = input.roundName;
      if (input.interviewerName !== undefined) patch.interviewerName = input.interviewerName;
      if (input.interviewerEmail !== undefined) patch.interviewerEmail = input.interviewerEmail;
      if (input.scheduledAt !== undefined) patch.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
      if (input.status !== undefined) patch.status = input.status;
      const [row] = await db.update(candidateInterviews).set(patch)
        .where(eq(candidateInterviews.id, input.id)).returning();
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Interview round not found.' });
      return row;
    }),

  removeRound: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.delete(candidateInterviews).where(eq(candidateInterviews.id, input.id));
      return { ok: true };
    }),

  // Transcript → AI feedback for one round (stores feedback + follow-ups).
  recordFeedback: protectedProcedure
    .input(z.object({ id: z.string().uuid(), transcript: z.string().optional() }))
    .mutation(async ({ input }) => {
      return generateRoundFeedback(input.id, input.transcript?.trim() || undefined);
    }),

  // Preview the briefing the interviewer for THIS round would receive.
  briefing: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const round = await loadRound(input.id);
      return buildPriorRoundsBriefing(round.candidateId, round.sortOrder);
    }),

  // Send the prep email (with the cross-round briefing) to this round's interviewer.
  sendPrep: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const round = await loadRound(input.id);
      if (!round.interviewerEmail) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Set an interviewer email on this round first.' });
      }
      const candidate = await db.query.candidates.findFirst({ where: eq(candidates.id, round.candidateId) });
      if (!candidate) throw new TRPCError({ code: 'NOT_FOUND', message: 'Candidate not found.' });
      const jd = candidate.jdId
        ? await db.query.jobDescriptions.findFirst({ where: eq(jobDescriptions.id, candidate.jdId) })
        : null;
      const briefing = await buildPriorRoundsBriefing(round.candidateId, round.sortOrder);
      await emailInterviewRoundPrep({
        to: round.interviewerEmail,
        interviewerName: round.interviewerName,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        jobTitle: jd?.jobTitle ?? undefined,
        roundName: round.roundName,
        questions: ((candidate as any).interviewQuestions ?? []) as any,
        briefing,
      });
      await db.update(candidateInterviews).set({ prepSentAt: new Date(), updatedAt: new Date() })
        .where(eq(candidateInterviews.id, round.id));
      return { ok: true, priorRounds: briefing.rounds.length, followUps: briefing.followUps.length };
    }),
});
