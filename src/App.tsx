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
import Values from './pages/hiring/Values';
import Departments from './pages/hiring/Departments';
import TaskLibrary from './pages/hiring/TaskLibrary';
import Assignments from './pages/hiring/Assignments';
import ScoreValues from './pages/hiring/ScoreValues';
import Sessions from './pages/hiring/Sessions';
import Responses from './pages/hiring/Responses';
import CandidateSession from './pages/assessment/CandidateSession';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/assessment/:token" element={<CandidateSession />} />
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
        <Route path="/hiring/departments" element={<Departments />} />
        <Route path="/hiring/tasks" element={<TaskLibrary />} />
        <Route path="/hiring/assignments" element={<Assignments />} />
        <Route path="/hiring/sessions" element={<Sessions />} />
        <Route path="/hiring/responses" element={<Responses />} />
        <Route path="/hiring/values" element={<Values />} />
        <Route path="/hiring/score-values" element={<ScoreValues />} />
        <Route path="/hiring/insights" element={<Insights />} />
      </Route>
    </Routes>
  );
}
