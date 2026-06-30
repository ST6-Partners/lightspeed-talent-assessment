import { useState } from 'react';
import SubTabs from '../../components/SubTabs';
import ComingSoon from '../../components/ComingSoon';
import EppProfiles from './EppProfiles';

const TABS = ['CCAT', 'EPP', 'Insights'];

export default function Assessments() {
  const [tab, setTab] = useState('EPP');
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Assessments</h1>
      <p className="text-gray-500 text-sm mb-5">Candidate assessment results by instrument</p>
      <SubTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'CCAT' && <ComingSoon title="CCAT" note="Cognitive aptitude (Criteria Corp) results — coming soon." />}
      {tab === 'EPP' && <EppProfiles />}
      {tab === 'Insights' && <ComingSoon title="Insights Discovery" note="Insights Discovery assessment (post-hire) — coming soon." />}
    </div>
  );
}
