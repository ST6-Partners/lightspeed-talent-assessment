import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import WorkSample from './pages/WorkSample';
import Chat from './pages/Chat';
import AdminSettings from './pages/AdminSettings';
// Hiring Pipeline
import HiringDashboard from './pages/hiring/HiringDashboard';
import Requisitions from './pages/hiring/Requisitions';
import JobDescriptions from './pages/hiring/JobDescriptions';
import Candidates from './pages/hiring/Candidates';
import Values from './pages/hiring/Values';
import Insights from './pages/hiring/Insights';
import Assessments from './pages/hiring/Assessments';
import Scorecards from './pages/hiring/Scorecards';
import Employees from './pages/hiring/Employees';
import Departments from './pages/hiring/Departments';
import Titles from './pages/hiring/Titles';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/work-sample/:token" element={<WorkSample />} />
      <Route element={<Layout />}>
        {/* Landing → hiring overview */}
        <Route path="/" element={<HiringDashboard />} />
        {/* Utility (reached via header icons) */}
        <Route path="/chat" element={<Chat />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        {/* Dashboard */}
        <Route path="/hiring" element={<HiringDashboard />} />
        <Route path="/hiring/metrics" element={<Insights />} />
        {/* Talent Acquisition */}
        <Route path="/hiring/requisitions" element={<Requisitions />} />
        <Route path="/hiring/candidates" element={<Candidates />} />
        <Route path="/hiring/assessments" element={<Assessments />} />
        <Route path="/hiring/scorecards" element={<Scorecards />} />
        {/* Core Data */}
        <Route path="/hiring/employees" element={<Employees />} />
        <Route path="/hiring/departments" element={<Departments />} />
        <Route path="/hiring/titles" element={<Titles />} />
        <Route path="/hiring/values" element={<Values />} />
        <Route path="/hiring/jobs" element={<JobDescriptions />} />
      </Route>
    </Routes>
  );
}
