import { Database, MessageSquare, Bell, Shield, BarChart3, GitBranch, Bot, Settings } from 'lucide-react';

const components = [
  { icon: Bot, label: 'Claude Chat', desc: 'AI chat with permission-mirrored tools', color: 'bg-purple-100 text-purple-700' },
  { icon: MessageSquare, label: 'Feedback', desc: 'User feedback with AI review', color: 'bg-blue-100 text-blue-700' },
  { icon: BarChart3, label: 'Telemetry', desc: 'Usage analytics and compliance', color: 'bg-green-100 text-green-700' },
  { icon: GitBranch, label: 'Change Log', desc: 'Per-field audit trail', color: 'bg-orange-100 text-orange-700' },
  { icon: Bell, label: 'Notifications', desc: 'In-app alerts and broadcasts', color: 'bg-yellow-100 text-yellow-700' },
  { icon: Shield, label: 'Permissions', desc: 'Four-tier role model', color: 'bg-red-100 text-red-700' },
  { icon: Settings, label: 'Prompt Admin', desc: 'Versioned prompt management', color: 'bg-indigo-100 text-indigo-700' },
  { icon: Database, label: 'DB Views', desc: 'Schema browser and data viewer', color: 'bg-gray-100 text-gray-700' },
];

export default function Home() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Template App</h1>
        <p className="text-gray-500 mt-1">
          SP-002 starter scaffold for Type 2 applications. Clone, rename, and build.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {components.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
              <div className={`inline-flex p-2 rounded-lg ${c.color} mb-3`}>
                <Icon size={20} />
              </div>
              <h3 className="font-medium text-gray-900 text-sm">{c.label}</h3>
              <p className="text-xs text-gray-500 mt-1">{c.desc}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-2">Getting Started</h2>
        <div className="text-sm text-gray-600 space-y-2">
          <p>1. Replace <code className="bg-gray-100 px-1 rounded">sample_entities</code> with your domain table(s)</p>
          <p>2. Update the tRPC router in <code className="bg-gray-100 px-1 rounded">server/src/routers/</code></p>
          <p>3. Build your domain screens in <code className="bg-gray-100 px-1 rounded">src/pages/</code></p>
          <p>4. Add Claude tools for your domain in <code className="bg-gray-100 px-1 rounded">adapters/ai.ts</code></p>
          <p>5. Customize the permission tiers if needed</p>
        </div>
      </div>
    </div>
  );
}
