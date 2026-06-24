import { useState, useEffect, useRef, useMemo } from 'react';
import { trpc } from '../../lib/trpc';
import { Search } from 'lucide-react';

type ViewMode = 'schema' | 'data' | 'erd';

export default function DatabaseViews() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('schema');
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Load table list
  const { data: tables = [], isLoading } = trpc.system.dbSchema.useQuery();

  // Load table detail when selected
  const { data: tableDetail } = trpc.system.tableDetail.useQuery(
    { tableName: selectedTable! },
    { enabled: !!selectedTable }
  );

  // Load table data when viewing data tab
  const { data: tableData, isLoading: dataLoading } = trpc.system.tableData.useQuery(
    {
      tableName: selectedTable!,
      page,
      limit: 50,
      ...(sortCol ? { sort: sortCol, dir: sortDir } : {}),
      ...(search ? { search } : {}),
    },
    { enabled: !!selectedTable && view === 'data' }
  );

  // Load ERD (nodes + edges graph data)
  const { data: erdData, isLoading: erdLoading } = trpc.system.dbErd.useQuery(
    undefined,
    { enabled: view === 'erd' }
  );

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const selectTable = (name: string) => {
    setSelectedTable(name);
    if (view === 'erd') setView('schema');
    setPage(1);
    setSortCol(null);
    setSortDir('asc');
    setSearch('');
    setSearchInput('');
  };

  const totalRows = tables.reduce((sum: number, t: any) => sum + (t.row_count || 0), 0);

  if (isLoading) {
    return <div className="text-center text-sm text-gray-400 py-8">Loading schema...</div>;
  }

  return (
    <div className="flex h-full gap-4">
      {/* Sidebar — table list */}
      <div className="w-64 bg-white rounded-lg border border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <h3 className="text-xs font-semibold text-gray-900">Tables</h3>
          <p className="text-xs text-gray-500 mt-1">
            {tables.length} tables · {totalRows.toLocaleString()} rows
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tables.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-500">No tables</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {tables.map((t: any) => (
                <button
                  key={t.table_name}
                  onClick={() => selectTable(t.table_name)}
                  className={`w-full text-left px-3 py-2.5 text-xs hover:bg-gray-50 transition-colors border-l-4 ${
                    selectedTable === t.table_name
                      ? 'bg-blue-50 border-l-blue-500 font-medium'
                      : 'border-l-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono">{t.table_name}</span>
                    <span className="text-gray-500 flex-shrink-0">{(t.row_count || 0).toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 bg-white rounded-lg border border-gray-200 flex flex-col">
        {/* View toggle bar */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">
            {view === 'erd' ? 'Entity Relationship Diagram' : selectedTable || 'Database Explorer'}
          </h3>
          <div className="flex gap-1">
            {(['schema', 'data', 'erd'] as const).map(v => (
              <button
                key={v}
                onClick={() => {
                  setView(v);
                  if (v === 'erd') setSelectedTable(null);
                }}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  view === v
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {v === 'schema' ? 'Schema' : v === 'data' ? 'Data' : 'ERD'}
              </button>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {view === 'erd' ? (
            <ErdView erdData={erdData} loading={erdLoading} onSelectTable={selectTable} />
          ) : !selectedTable ? (
            <div className="flex-1 flex items-center justify-center text-center">
              <div>
                <div className="text-3xl mb-2">🗄️</div>
                <p className="text-sm text-gray-600">Select a table from the sidebar</p>
              </div>
            </div>
          ) : view === 'schema' ? (
            // Schema view
            <div className="flex-1 overflow-auto p-4">
              {tableDetail && tableDetail.columns ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-3 py-2 font-semibold text-gray-700">Column</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-700">Type</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-700">PK</th>
                      <th className="text-center px-3 py-2 font-semibold text-gray-700">Nullable</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-700">Default</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-700">FK → Table</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tableDetail.columns.map((c: any) => (
                      <tr key={c.column_name} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <span className={c.is_primary_key ? 'font-semibold text-blue-600' : ''}>
                            {c.is_primary_key && '🔑 '}{c.column_name}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">
                          {c.data_type}{c.character_maximum_length ? `(${c.character_maximum_length})` : ''}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {c.is_primary_key ? '✓' : ''}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600">
                          {c.is_nullable}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500 truncate max-w-xs">
                          {c.column_default || '—'}
                        </td>
                        <td className="px-3 py-2 text-purple-600 text-xs">
                          {c.foreign_key ? (
                            <button
                              onClick={() => selectTable(c.foreign_key.table)}
                              className="underline hover:text-purple-700"
                            >
                              {c.foreign_key.table}.{c.foreign_key.column}
                            </button>
                          ) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center text-gray-500 text-sm">Loading schema...</div>
              )}
            </div>
          ) : (
            // Data view
            <div className="flex-1 flex flex-col overflow-hidden p-4">
              {/* Search bar */}
              <form onSubmit={handleSearch} className="flex gap-2 mb-3">
                <div className="flex-1 max-w-md relative">
                  <Search size={16} className="absolute left-2 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="Search across text columns..."
                    className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
                >
                  Search
                </button>
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setSearchInput('');
                      setPage(1);
                    }}
                    className="px-3 py-1.5 bg-gray-300 hover:bg-gray-400 text-gray-900 text-sm font-medium rounded transition-colors"
                  >
                    Clear
                  </button>
                )}
              </form>

              {/* Table */}
              {dataLoading ? (
                <div className="text-center text-gray-500 text-sm py-8">Loading data...</div>
              ) : tableData && tableData.rows && tableData.rows.length > 0 ? (
                <>
                  <div className="flex-1 overflow-auto border border-gray-200 rounded mb-3">
                    <table className="w-full text-sm border-collapse">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                        <tr>
                          {Object.keys(tableData.rows[0]).map(col => (
                            <th
                              key={col}
                              onClick={() => handleSort(col)}
                              className="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                            >
                              {col}
                              {sortCol === col && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.rows.map((row: any, i: number) => (
                          <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                            {Object.values(row).map((val: any, j: number) => (
                              <td key={j} className="px-3 py-2 text-gray-900 whitespace-nowrap max-w-xs truncate">
                                {val === null ? (
                                  <span className="text-gray-400 italic">null</span>
                                ) : typeof val === 'boolean' ? (
                                  val ? '✓' : '✗'
                                ) : typeof val === 'object' ? (
                                  <span className="font-mono text-xs text-gray-500">
                                    {JSON.stringify(val).substring(0, 200)}
                                  </span>
                                ) : (
                                  String(val)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>
                      {tableData.total?.toLocaleString()} rows · Page {tableData.page} of {tableData.pages}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                        className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        ← Prev
                      </button>
                      <button
                        disabled={page >= (tableData.pages || 1)}
                        onClick={() => setPage(p => p + 1)}
                        className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center text-gray-500 text-sm py-8">
                  {search ? 'No matching rows' : 'Table is empty'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ERD View — interactive SVG with pan/zoom/drag/hover ────────

interface ErdNode {
  name: string;
  columns: Array<{ name: string; type: string; nullable: boolean; pk: boolean }>;
  row_count: number;
}

interface ErdEdge {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
}

interface ErdData {
  nodes: ErdNode[];
  edges: ErdEdge[];
}

interface EdgePath extends ErdEdge {
  path: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

const COL_WIDTH = 280;
const ROW_H = 18;
const HDR_H = 36;
const TABLE_PAD = 12;
const GAP_X = 40;
const GAP_Y = 30;

function ErdView({
  erdData,
  loading,
  onSelectTable,
}: {
  erdData?: ErdData;
  loading: boolean;
  onSelectTable: (name: string) => void;
}) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<EdgePath | null>(null);
  const [visibleTables, setVisibleTables] = useState<Set<string> | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [tableOffsets, setTableOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const [draggingTable, setDraggingTable] = useState<{ name: string; origDx: number; origDy: number } | null>(null);
  const [tableDragStart, setTableDragStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const didDragRef = useRef(false);

  // Initialize visible tables when data loads
  useEffect(() => {
    if (erdData && !visibleTables) {
      setVisibleTables(new Set(erdData.nodes.map(n => n.name)));
    }
  }, [erdData, visibleTables]);

  // Connected tables (tables that have FK relationships)
  const connectedTables = useMemo(() => {
    if (!erdData) return new Set<string>();
    const s = new Set<string>();
    erdData.edges.forEach(e => { s.add(e.from_table); s.add(e.to_table); });
    return s;
  }, [erdData]);

  const toggleTable = (name: string) => {
    setVisibleTables(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const setAllVisible = () => erdData && setVisibleTables(new Set(erdData.nodes.map(n => n.name)));
  const setNoneVisible = () => setVisibleTables(new Set());
  const setConnectedOnly = () => setVisibleTables(new Set(connectedTables));

  // Layout: grid-based placement, most-connected tables first
  const layout = useMemo(() => {
    if (!erdData || !visibleTables) return null;
    const nodes = erdData.nodes.filter(n => visibleTables.has(n.name));
    const edges = erdData.edges.filter(e => visibleTables.has(e.from_table) && visibleTables.has(e.to_table));

    // Build adjacency
    const connected: Record<string, Set<string>> = {};
    edges.forEach(e => {
      if (!connected[e.from_table]) connected[e.from_table] = new Set();
      if (!connected[e.to_table]) connected[e.to_table] = new Set();
      connected[e.from_table].add(e.to_table);
      connected[e.to_table].add(e.from_table);
    });

    // Sort: most-connected first, then alphabetical
    const sorted = [...nodes].sort((a, b) => {
      const ac = connected[a.name]?.size || 0;
      const bc = connected[b.name]?.size || 0;
      if (bc !== ac) return bc - ac;
      return a.name.localeCompare(b.name);
    });

    // Place in grid
    const placedMap: Record<string, { x: number; y: number; w: number; h: number }> = {};
    const positions: Array<ErdNode & { x: number; y: number; w: number; h: number }> = [];
    const cols = Math.ceil(Math.sqrt(sorted.length * 1.5));
    let col = 0;
    let rowMaxH = 0;
    let y = GAP_Y;

    sorted.forEach(node => {
      const showCols = Math.min(node.columns.length, 12);
      const h = HDR_H + showCols * ROW_H + TABLE_PAD;
      const x = GAP_X + col * (COL_WIDTH + GAP_X);

      positions.push({ ...node, x, y, w: COL_WIDTH, h });
      placedMap[node.name] = { x, y, w: COL_WIDTH, h };

      rowMaxH = Math.max(rowMaxH, h);
      col++;
      if (col >= cols) {
        col = 0;
        y += rowMaxH + GAP_Y;
        rowMaxH = 0;
      }
    });

    const maxX = positions.length > 0 ? Math.max(...positions.map(p => p.x + p.w)) + GAP_X : 800;
    const maxY = positions.length > 0 ? Math.max(...positions.map(p => p.y + p.h)) + GAP_Y : 600;

    return { positions, edges, placedMap, width: maxX, height: maxY };
  }, [erdData, visibleTables]);

  // Recompute edge paths when tables are dragged (separate useMemo for perf)
  const edgePaths: EdgePath[] = useMemo(() => {
    if (!layout || !erdData) return [];
    return layout.edges.map(e => {
      const baseFrom = layout.placedMap[e.from_table];
      const baseTo = layout.placedMap[e.to_table];
      if (!baseFrom || !baseTo) return null;
      const oFrom = tableOffsets[e.from_table] || { dx: 0, dy: 0 };
      const oTo = tableOffsets[e.to_table] || { dx: 0, dy: 0 };
      const from = { x: baseFrom.x + oFrom.dx, y: baseFrom.y + oFrom.dy, w: baseFrom.w, h: baseFrom.h };
      const to = { x: baseTo.x + oTo.dx, y: baseTo.y + oTo.dy, w: baseTo.w, h: baseTo.h };

      const fromNode = erdData.nodes.find(n => n.name === e.from_table);
      const toNode = erdData.nodes.find(n => n.name === e.to_table);
      const fromColIdx = fromNode ? fromNode.columns.findIndex(c => c.name === e.from_column) : 0;
      const toColIdx = toNode ? toNode.columns.findIndex(c => c.name === e.to_column) : 0;

      const fromY = from.y + HDR_H + Math.min(fromColIdx, 11) * ROW_H + ROW_H / 2;
      const toY = to.y + HDR_H + Math.min(toColIdx, 11) * ROW_H + ROW_H / 2;

      let fromX: number, toX: number;
      if (from.x + from.w < to.x) { fromX = from.x + from.w; toX = to.x; }
      else if (to.x + to.w < from.x) { fromX = from.x; toX = to.x + to.w; }
      else { fromX = from.x + from.w; toX = to.x + to.w; }

      const midX = (fromX + toX) / 2;
      const path = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
      return { ...e, path, fromX, fromY, toX, toY };
    }).filter(Boolean) as EdgePath[];
  }, [layout, tableOffsets, erdData]);

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !draggingTable) {
      setDragging(true);
      didDragRef.current = false;
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingTable) {
      const dx = (e.clientX - tableDragStart.x) / zoom;
      const dy = (e.clientY - tableDragStart.y) / zoom;
      setTableOffsets(prev => ({
        ...prev,
        [draggingTable.name]: {
          dx: draggingTable.origDx + dx,
          dy: draggingTable.origDy + dy,
        },
      }));
      didDragRef.current = true;
    } else if (dragging) {
      didDragRef.current = true;
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };
  const handleMouseUp = () => {
    setDragging(false);
    setDraggingTable(null);
  };
  const handleTableClick = (e: React.MouseEvent, tableName: string) => {
    if (didDragRef.current) return;
    e.stopPropagation();
    onSelectTable(tableName);
  };
  const handleTableDragStart = (e: React.MouseEvent, tblName: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    didDragRef.current = false;
    const existing = tableOffsets[tblName] || { dx: 0, dy: 0 };
    setDraggingTable({ name: tblName, origDx: existing.dx, origDy: existing.dy });
    setTableDragStart({ x: e.clientX, y: e.clientY });
  };
  const handleWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(3, Math.max(0.2, z * delta)));
  };

  // Highlight helpers
  const isEdgeHighlighted = (edge: EdgePath) => {
    if (hoveredEdge && edge.from_table === hoveredEdge.from_table && edge.from_column === hoveredEdge.from_column) return true;
    if (hoveredTable && (edge.from_table === hoveredTable || edge.to_table === hoveredTable)) return true;
    return false;
  };

  const isTableHighlighted = (name: string) => {
    if (hoveredTable === name) return true;
    if (hoveredTable && erdData?.edges.some(e =>
      (e.from_table === hoveredTable && e.to_table === name) ||
      (e.to_table === hoveredTable && e.from_table === name)
    )) return true;
    return false;
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading ERD...</div>;
  }

  if (!erdData || !layout) {
    return <div className="flex-1 flex items-center justify-center text-sm text-gray-400">No schema data</div>;
  }

  const filteredList = erdData.nodes.filter(n =>
    !filterSearch || n.name.toLowerCase().includes(filterSearch.toLowerCase())
  );

  return (
    <div className="flex-1 flex overflow-hidden" style={{ position: 'relative' }}>
      {/* Filter panel */}
      <div
        style={{
          width: filterOpen ? 210 : 0,
          overflow: 'hidden',
          transition: 'width 0.2s',
          borderRight: filterOpen ? '1px solid #e5e7eb' : 'none',
          background: '#fafbfc',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div className="p-2 border-b border-gray-200">
          <div className="text-xs font-bold text-gray-700 mb-1.5">Show Tables</div>
          <div className="flex gap-1 mb-1.5 flex-wrap">
            {[
              { label: 'All', fn: setAllVisible, active: visibleTables?.size === erdData.nodes.length },
              { label: 'Connected', fn: setConnectedOnly, active: visibleTables?.size === connectedTables.size },
              { label: 'None', fn: setNoneVisible, active: visibleTables?.size === 0 },
            ].map(btn => (
              <button
                key={btn.label}
                onClick={btn.fn}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition-colors ${
                  btn.active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            placeholder="Filter tables..."
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1 overflow-auto py-1">
          {filteredList.map(n => (
            <label
              key={n.name}
              className="flex items-center gap-1.5 px-2.5 py-0.5 text-xs cursor-pointer"
              style={{ color: visibleTables?.has(n.name) ? '#374151' : '#9ca3af' }}
            >
              <input
                type="checkbox"
                checked={visibleTables?.has(n.name) || false}
                onChange={() => toggleTable(n.name)}
                className="accent-blue-600"
                style={{ margin: 0 }}
              />
              <span className="truncate">{n.name}</span>
              {connectedTables.has(n.name) && (
                <span className="text-[9px] text-gray-400 ml-auto">🔗</span>
              )}
            </label>
          ))}
        </div>
        <div className="px-2.5 py-1.5 border-t border-gray-200 text-[11px] text-gray-400">
          {visibleTables?.size || 0} of {erdData.nodes.length} shown
        </div>
      </div>

      {/* SVG area */}
      <div className="flex-1 relative" style={{ minWidth: 0 }}>
        {/* Zoom controls */}
        <div className="absolute top-2.5 right-2.5 z-10 flex gap-1 items-center">
          <button
            onClick={() => setFilterOpen(f => !f)}
            className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${
              filterOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            ☰
          </button>
          <button
            onClick={() => setZoom(z => Math.min(3, z * 1.2))}
            className="px-3 py-1 text-xs font-medium bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            +
          </button>
          <button
            onClick={() => setZoom(z => Math.max(0.2, z * 0.8))}
            className="px-3 py-1 text-xs font-medium bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            −
          </button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setTableOffsets({}); }}
            className="px-3 py-1 text-xs font-medium bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            Reset
          </button>
          <span className="text-[11px] text-gray-400 ml-1">{Math.round(zoom * 100)}%</span>
          <span className="text-[10px] text-gray-300 ml-1.5">Ctrl+scroll to zoom</span>
        </div>

        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ cursor: dragging ? 'grabbing' : 'grab', background: '#fafbfc' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Edges (Bezier curves) */}
            {edgePaths.map((edge, i) => (
              <g key={i}>
                <path
                  d={edge.path}
                  fill="none"
                  stroke={isEdgeHighlighted(edge) ? '#2563eb' : '#d1d5db'}
                  strokeWidth={isEdgeHighlighted(edge) ? 2 : 1}
                  strokeDasharray={isEdgeHighlighted(edge) ? 'none' : '4,3'}
                  style={{ transition: 'stroke 0.15s, stroke-width 0.15s' }}
                  onMouseEnter={() => setHoveredEdge(edge)}
                  onMouseLeave={() => setHoveredEdge(null)}
                />
                <circle
                  cx={edge.toX} cy={edge.toY} r={3}
                  fill={isEdgeHighlighted(edge) ? '#2563eb' : '#d1d5db'}
                />
              </g>
            ))}

            {/* Table nodes */}
            {layout.positions.map(tbl => {
              const highlighted = isTableHighlighted(tbl.name);
              const showCols = tbl.columns.slice(0, 12);
              const truncated = tbl.columns.length > 12;
              const off = tableOffsets[tbl.name] || { dx: 0, dy: 0 };
              const tx = tbl.x + off.dx;
              const ty = tbl.y + off.dy;
              const isDraggingThis = draggingTable?.name === tbl.name;

              return (
                <g
                  key={tbl.name}
                  onMouseEnter={() => setHoveredTable(tbl.name)}
                  onMouseLeave={() => setHoveredTable(null)}
                  onMouseDown={(e) => handleTableDragStart(e, tbl.name)}
                  style={{ cursor: isDraggingThis ? 'grabbing' : 'grab' }}
                >
                  {/* Shadow */}
                  <rect x={tx + 2} y={ty + 2} width={tbl.w} height={tbl.h} rx={6}
                    fill="rgba(0,0,0,0.06)" />
                  {/* Card background */}
                  <rect x={tx} y={ty} width={tbl.w} height={tbl.h} rx={6}
                    fill="#fff"
                    stroke={highlighted ? '#2563eb' : isDraggingThis ? '#60a5fa' : '#e5e7eb'}
                    strokeWidth={highlighted || isDraggingThis ? 2 : 1}
                    style={{ transition: isDraggingThis ? 'none' : 'stroke 0.15s' }}
                  />
                  {/* Header bar */}
                  <rect x={tx} y={ty} width={tbl.w} height={HDR_H} rx={6}
                    fill={highlighted ? '#2563eb' : '#1a1a2e'}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleTableClick(e, tbl.name)}
                  />
                  <rect x={tx} y={ty + HDR_H - 6} width={tbl.w} height={6}
                    fill={highlighted ? '#2563eb' : '#1a1a2e'}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleTableClick(e, tbl.name)}
                  />
                  {/* Table name */}
                  <text x={tx + 10} y={ty + 14} dominantBaseline="hanging"
                    fill="#fff" fontSize={13} fontWeight={700} fontFamily="system-ui, sans-serif"
                    style={{ cursor: 'pointer', pointerEvents: 'none' }}
                  >
                    {tbl.name}
                  </text>
                  {/* Row count badge */}
                  <text x={tx + tbl.w - 10} y={ty + 14} dominantBaseline="hanging"
                    fill="rgba(255,255,255,0.6)" fontSize={10} fontFamily="system-ui, sans-serif" textAnchor="end"
                    style={{ pointerEvents: 'none' }}
                  >
                    {tbl.row_count.toLocaleString()}
                  </text>

                  {/* Columns */}
                  {showCols.map((col, ci) => {
                    const cy = ty + HDR_H + ci * ROW_H;
                    const hasFk = erdData.edges.some(e => e.from_table === tbl.name && e.from_column === col.name);
                    return (
                      <g key={col.name}>
                        {ci % 2 === 1 && (
                          <rect x={tx + 1} y={cy} width={tbl.w - 2} height={ROW_H} fill="#f9fafb" />
                        )}
                        <text x={tx + 10} y={cy + 4} dominantBaseline="hanging"
                          fontSize={11} fontFamily="system-ui, sans-serif"
                          fill={col.pk ? '#2563eb' : hasFk ? '#7c3aed' : '#374151'}
                          fontWeight={col.pk ? 700 : 400}
                          style={{ pointerEvents: 'none' }}
                        >
                          {col.pk ? '🔑 ' : hasFk ? '🔗 ' : '  '}{col.name}
                        </text>
                        <text x={tx + tbl.w - 10} y={cy + 4} dominantBaseline="hanging"
                          fontSize={10} fontFamily="monospace" fill="#9ca3af" textAnchor="end"
                          style={{ pointerEvents: 'none' }}
                        >
                          {col.type}
                        </text>
                      </g>
                    );
                  })}
                  {truncated && (
                    <text x={tx + tbl.w / 2} y={ty + HDR_H + 12 * ROW_H + 2} dominantBaseline="hanging"
                      fontSize={10} fill="#9ca3af" textAnchor="middle" fontFamily="system-ui, sans-serif"
                      style={{ pointerEvents: 'none' }}
                    >
                      +{tbl.columns.length - 12} more columns
                    </text>
                  )}
                </g>
              );
            })}

            {/* Edge label on hover */}
            {hoveredEdge && (() => {
              const midX = (hoveredEdge.fromX + hoveredEdge.toX) / 2;
              const midY = (hoveredEdge.fromY + hoveredEdge.toY) / 2;
              const label = `${hoveredEdge.from_table}.${hoveredEdge.from_column} → ${hoveredEdge.to_table}.${hoveredEdge.to_column}`;
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={midX - 4} y={midY - 14}
                    width={Math.min(label.length * 6.2 + 12, 400)} height={18} rx={3}
                    fill="#1a1a2e" opacity={0.9}
                  />
                  <text x={midX} y={midY - 3} fontSize={10} fill="#fff" fontFamily="monospace">
                    {label}
                  </text>
                </g>
              );
            })()}
          </g>
        </svg>
      </div>
    </div>
  );
}
