import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { Plus, Archive, Pencil } from 'lucide-react';

export default function Entities() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: entities, refetch } = trpc.entity.list.useQuery();
  const createMutation = trpc.entity.create.useMutation({ onSuccess: () => { refetch(); setShowCreate(false); setName(''); setDescription(''); } });
  const archiveMutation = trpc.entity.archive.useMutation({ onSuccess: () => refetch() });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="entity-header">Entities</h1>
          <p className="text-gray-500 text-sm mt-1">Sample domain entities — adopter replaces with their domain</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} />
          Create Entity
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Entity name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <div className="flex gap-2">
              <button
                onClick={() => createMutation.mutate({ name, description })}
                disabled={!name || createMutation.isLoading}
                className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {createMutation.isLoading ? 'Creating...' : 'Create'}
              </button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-600 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200" data-testid="entity-table">
        {!entities || entities.length === 0 ? (
          <div className="p-8 text-center text-gray-500" data-testid="empty-state">
            No entities yet. Create one to get started.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((entity: any) => (
                <tr key={entity.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{entity.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{entity.entityType}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                      {entity.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(entity.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => archiveMutation.mutate({ id: entity.id })}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Archive"
                    >
                      <Archive size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
