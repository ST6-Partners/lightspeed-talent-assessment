import fs from 'fs';
function patch(file, edits) {
  if (!fs.existsSync(file)) { console.error('  [MISS] ' + file); process.exitCode = 1; return; }
  let s = fs.readFileSync(file, 'utf8'); let changed = false;
  for (const [name, marker, anchor, repl] of edits) {
    if (s.includes(marker)) { console.log('  [skip] ' + name); continue; }
    if (!s.includes(anchor)) { console.error('  [FAIL] ' + name + ' ANCHOR NOT FOUND'); process.exitCode = 1; continue; }
    s = s.replace(anchor, repl); changed = true; console.log('  [ok]   ' + name);
  }
  if (changed) fs.writeFileSync(file, s);
}
patch('server/src/routers/feedbackAdmin.ts', [[
  'reopenMine mutation', 'reopenMine:',
  "        .where(eq(feedback.userId, ctx.user.id))\n        .orderBy(desc(feedback.createdAt))\n        .limit(50);\n    }),\n});",
  "        .where(eq(feedback.userId, ctx.user.id))\n        .orderBy(desc(feedback.createdAt))\n        .limit(50);\n    }),\n\n  reopenMine: protectedProcedure\n    .input(z.object({ id: z.string().uuid() }))\n    .mutation(async ({ ctx, input }) => {\n      const existing = await ctx.db.query.feedback.findFirst({ where: eq(feedback.id, input.id) });\n      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });\n      if (existing.userId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your submission' });\n      if (!['resolved', 'wont_fix', 'approved'].includes(existing.status)) {\n        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only a resolved item can be reopened' });\n      }\n      const [updated] = await ctx.db.update(feedback).set({\n        status: 'open', resolvedAt: null, resolvedBy: null, resolvedByType: 'human', updatedAt: new Date(),\n      }).where(eq(feedback.id, input.id)).returning();\n      return updated;\n    }),\n});",
]]);
patch('src/components/FeedbackDrawer.tsx', [
  ['import AgentDiagnosisPanel', "import AgentDiagnosisPanel",
    "import FeedbackAIReviewPanel, { AIReviewResult } from './FeedbackAIReviewPanel';",
    "import FeedbackAIReviewPanel, { AIReviewResult } from './FeedbackAIReviewPanel';\nimport AgentDiagnosisPanel from './admin/AgentDiagnosisPanel';"],
  ['reopenMine hook', "reopenMineMutation",
    "  const { data: myFeedback } = trpc.feedbackAdmin.mySubmissions.useQuery(undefined, {\n    enabled: open && activeTab === 'submissions',\n  });",
    "  const { data: myFeedback, refetch: refetchMine } = trpc.feedbackAdmin.mySubmissions.useQuery(undefined, {\n    enabled: open && activeTab === 'submissions',\n  });\n  const reopenMineMutation = trpc.feedbackAdmin.reopenMine.useMutation({ onSuccess: () => refetchMine() });"],
  ['My Submissions diagnosis + reopen', "This isn't resolved",
    "                    <div className=\"text-xs text-gray-400 mt-2\">{new Date(fb.createdAt).toLocaleDateString()}</div>\n                  </div>\n                ))",
    "                    <div className=\"text-xs text-gray-400 mt-2\">{new Date(fb.createdAt).toLocaleDateString()}</div>\n                    {(fb.agentDiagnosis || fb.adminNotes) && ['pm_review','approved','resolved'].includes(fb.status) && (\n                      <div className=\"mt-2\"><AgentDiagnosisPanel adminNotes={fb.adminNotes} agentDiagnosis={fb.agentDiagnosis} agentStatus={fb.agentStatus} agentPrUrl={fb.agentPrUrl} /></div>\n                    )}\n                    {['resolved','wont_fix','approved'].includes(fb.status) && (\n                      <button onClick={() => reopenMineMutation.mutate({ id: fb.id })} disabled={reopenMineMutation.isLoading} className=\"mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50\">This isn't resolved \u2014 reopen</button>\n                    )}\n                  </div>\n                ))"],
]);
console.log('\nSubmitter-loop patch complete.');
