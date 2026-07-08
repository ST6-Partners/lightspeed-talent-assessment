import { useState } from 'react';
import SubTabs from '../../components/SubTabs';
import EppProfiles from './EppProfiles';
import CcatResults from './CcatResults';
import InsightsResults from './InsightsResults';

const TABS = ['CCAT', 'EPP', 'Insights'];

export default function Assessments() {
  const [tab, setTab] = useState('EPP');
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Assessments</h1>
      <p className="text-gray-500 text-sm mb-5">Candidate assessment results by instrument</p>
      <SubTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'CCAT' && <CcatResults />}
      {tab === 'EPP' && <EppProfiles />}
      {tab === 'Insights' && <InsightsResults />}
    </div>
  );
}
