// ============================================================
// DOCUMENT INDEX ROUTER — module design docs, served by the app
// Lists the latest version of each design doc. The HTML files are
// hosted in /public/docs and served at /docs/<file>, so links work
// with no external setup. Admin-only.
// ============================================================

import { router, protectedProcedure } from '../trpc.js';
import { requireAdmin } from '../services/permissions.js';

interface DocItem { name: string; description: string; url: string }
interface DocGroup { group: string; items: DocItem[] }

const GROUPS: DocGroup[] = [
  {
    group: 'Overviews & Plans',
    items: [
      { name: '2x — Plain-English Overview', description: 'At-a-glance summary of the hiring system in plain language.', url: '/docs/2x-plain-english-overview.html' },
      { name: '2x — Design & Build Plan', description: 'The full design and build plan for the 2x assessment system.', url: '/docs/2x-design-and-build-plan.html' },
    ],
  },
  {
    group: 'Design',
    items: [
      { name: 'Style & Navigation Guide', description: 'The visual style and navigation patterns the app follows.', url: '/docs/style-nav-guide.html' },
      { name: 'Email & Messaging — Design Spec v2', description: 'Sending/receiving candidate email, in-app inbox, Greenhouse sync.', url: '/docs/email-messaging-design-spec-v2.html' },
      { name: 'Requisition & JD Forms — Mockup', description: 'Interactive mockup of the requisition and job-description screens.', url: '/docs/requisition-jd-forms-mockup.html' },
    ],
  },
  {
    group: 'Working Drafts',
    items: [
      { name: '10x Design v2', description: 'The 10x reimagining of hiring vs. the Lightspeed 2x plan.', url: '/docs/10x-design-v2.html' },
      { name: '10x Design v2 — Plain English', description: 'Plain-language version of the 10x design.', url: '/docs/10x-design-v2-plain-english.html' },
      { name: '2x — Finalized Flowchart', description: 'The finalized end-to-end flow of the 2x hiring funnel.', url: '/docs/2x-finalized-flowchart.html' },
      { name: '2x — Integrated Flowchart', description: 'How the pieces connect across tools.', url: '/docs/2x-integrated-flowchart.html' },
      { name: 'PA2 — TA Outbound Workflow v6', description: 'The outbound candidate-communications workflow built in PA2.', url: '/docs/pa2-ta-outbound-workflow-v6.html' },
    ],
  },
];

export const docIndexRouter = router({
  list: protectedProcedure.use(requireAdmin).query(() => ({ groups: GROUPS })),
});
