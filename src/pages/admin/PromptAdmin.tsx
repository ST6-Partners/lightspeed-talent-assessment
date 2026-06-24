import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import { Plus, FileText } from 'lucide-react';

interface PromptTemplate {
  id: string;
  key: string;
  content: string;
  version: number;
  createdAt: Date;
}

export default function PromptAdmin() {
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [content, setContent] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newContent, setNewContent] = useState('');

  const { data: prompts = [], isLoading } = trpc.prompts.list.useQuery();

  const updateMutation = trpc.prompts.update.useMutation({
    onSuccess: () => {
      // Query invalidation handled by tRPC
    },
  });

  const createMutation = trpc.prompts.create.useMutation({
    onSuccess: () => {
      setNewKey('');
      setNewContent('');
      setShowAddForm(false);
    },
  });

  // Group prompts by key and get latest version
  const groupedByKey: Record<string, PromptTemplate[]> = {};
  prompts.forEach((prompt: PromptTemplate) => {
    if (!groupedByKey[prompt.key]) {
      groupedByKey[prompt.key] = [];
    }
    groupedByKey[prompt.key].push(prompt);
  });

  // Sort versions by descending
  Object.keys(groupedByKey).forEach((key) => {
    groupedByKey[key].sort((a, b) => b.version - a.version);
  });

  const currentPrompt = selectedKey ? groupedByKey[selectedKey]?.[0] : null;
  const allVersions = selectedKey ? groupedByKey[selectedKey] || [] : [];

  const handleSelectKey = (key: string) => {
    setSelectedKey(key);
    const latest = groupedByKey[key][0];
    setContent(latest.content);
  };

  const handleSaveNewVersion = () => {
    if (selectedKey && currentPrompt && content && content !== currentPrompt.content) {
      updateMutation.mutate({
        id: currentPrompt.id,
        content,
      });
    }
  };

  const handleAddTemplate = () => {
    if (newKey.trim() && newContent.trim()) {
      createMutation.mutate({
        key: newKey,
        content: newContent,
      });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-full">
      {/* Left Sidebar: Prompt Keys */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col h-full">
          <div className="p-3 border-b border-gray-200">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors inline-flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              Add Template
            </button>
          </div>

          {/* Add Template Form */}
          {showAddForm && (
            <div className="p-3 border-b border-gray-200 space-y-2 bg-gray-50">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Template key"
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Template content"
                rows={3}
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddTemplate}
                  disabled={!newKey.trim() || !newContent.trim() || createMutation.isLoading}
                  className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-medium rounded transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 px-2 py-1 bg-gray-300 hover:bg-gray-400 text-gray-900 text-xs font-medium rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Prompt List */}
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
            ) : Object.keys(groupedByKey).length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">No prompts found.</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {Object.keys(groupedByKey)
                  .sort()
                  .map((key) => (
                    <button
                      key={key}
                      onClick={() => handleSelectKey(key)}
                      className={`w-full text-left px-3 py-3 text-sm hover:bg-gray-50 transition-colors border-l-4 ${
                        selectedKey === key
                          ? 'bg-blue-50 border-l-blue-500 font-medium text-blue-900'
                          : 'border-l-gray-300 text-gray-700'
                      }`}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <FileText size={14} className="flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs">{key}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            v{groupedByKey[key][0].version}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel: Editor */}
      <div className="lg:col-span-3">
        {currentPrompt ? (
          <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4 h-full flex flex-col">
            {/* Header */}
            <div>
              <h2 className="text-lg font-bold text-gray-900 font-mono">{selectedKey}</h2>
              <div className="flex gap-3 text-xs text-gray-500 mt-2">
                <span>Version: {currentPrompt.version}</span>
                <span>Created: {new Date(currentPrompt.createdAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Content Editor */}
            <div className="flex-1 flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="flex-1 p-3 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Action Button */}
            <button
              onClick={handleSaveNewVersion}
              disabled={content === currentPrompt.content || updateMutation.isLoading}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-md transition-colors"
            >
              {updateMutation.isLoading ? 'Saving...' : 'Save New Version'}
            </button>

            {/* Version History */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Version History</h3>
              <div className="border border-gray-200 rounded-md overflow-y-auto max-h-48">
                {allVersions.length === 0 ? (
                  <div className="p-3 text-center text-gray-500 text-xs">No versions.</div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {allVersions.map((v, idx) => (
                      <div key={idx} className="p-3 hover:bg-gray-50">
                        <p className="text-xs font-medium text-gray-900">Version {v.version}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(v.createdAt).toLocaleString()}
                        </p>
                        {idx > 0 && (
                          <p className="text-xs text-gray-600 mt-2 font-mono max-h-20 overflow-hidden line-clamp-3">
                            {v.content}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500 h-full flex items-center justify-center">
            <div>
              <FileText size={40} className="mx-auto text-gray-400 mb-2" />
              <p>Select a prompt to edit</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
