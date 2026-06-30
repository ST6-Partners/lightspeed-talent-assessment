import { useState } from 'react';
import SubTabs from '../../components/SubTabs';
import ComingSoon from '../../components/ComingSoon';
import ScoreValues from './ScoreValues';

const TABS = ['Interview', 'Values Scoring'];

export default function Scorecards() {
  const [tab, setTab] = useState('Values Scoring');
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Scorecards</h1>
      <p className="text-gray-500 text-sm mb-5">Structured candidate evaluations</p>
      <SubTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'Interview' && <ComingSoon title="Interview Scorecard" note="Structured interview scoring — coming soon." />}
      {tab === 'Values Scoring' && <ScoreValues />}
    </div>
  );
}
