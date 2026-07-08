import ScoreValues from './ScoreValues';

// The Scorecards page is the human, in-person candidate scorecard: a named
// reviewer scores the candidate on each company value (1–5), seeded from the
// candidate's EPP and adjusted with interview judgment. Multiple reviewers can
// each save their own dated pass, so this doubles as the interview scorecard.
// (The former "Interview" tab was an unused "coming soon" stub — interview
// evaluation is captured here, plus the automated Zoom-transcript feedback on
// the candidate record.)
export default function Scorecards() {
  return <ScoreValues />;
}
