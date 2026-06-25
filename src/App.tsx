import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Entities from './pages/Entities';
import Chat from './pages/Chat';
import Login from './pages/Login';
import AdminSettings from './pages/AdminSettings';
// Hiring Pipeline
import HiringDashboard from './pages/hiring/HiringDashboard';
import Requisitions from './pages/hiring/Requisitions';
import JobDescriptions from './pages/hiring/JobDescriptions';
import Candidates from './pages/hiring/Candidates';
import Insights from './pages/hiring/Insights';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/entities" element={<Entities />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        {/* Hiring Pipeline */}
        <Route path="/hiring" element={<HiringDashboard />} />
        <Route path="/hiring/requisitions" element={<Requisitions />} />
        <Route path="/hiring/jobs" element={<JobDescriptions />} />
        <Route path="/hiring/candidates" element={<Candidates />} />
        <Route path="/hiring/insights" element={<Insights />} />
      </Route>
    </Routes>
  );
}
