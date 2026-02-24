import { useState, useRef, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { LoadingSpinner } from '../components/LoadingSpinner';
export function Memory() {
    const [tab, setTab] = useState('entities');
    return (<div>
      <h2 className="text-xl font-semibold mb-4">Memory — ClawMemory</h2>

      <div className="flex gap-1 mb-6 border-b border-claw-border">
        {[
            { id: 'entities', label: 'Entity List' },
            { id: 'graph', label: 'Knowledge Graph' },
            { id: 'recall', label: 'Recall Simulator' },
        ].map(({ id, label }) => (<button key={id} onClick={() => setTab(id)} className={`px-4 py-2 text-sm border-b-2 transition-colors ${tab === id
                ? 'border-claw-accent text-claw-accent'
                : 'border-transparent text-claw-muted hover:text-claw-text'}`}>
            {label}
          </button>))}
      </div>

      {tab === 'entities' && <EntityList />}
      {tab === 'graph' && <KnowledgeGraphView />}
      {tab === 'recall' && <RecallSimulator />}
    </div>);
}
function EntityList() {
    const [typeFilter, setTypeFilter] = useState('');
    const [workspaceFilter, setWorkspaceFilter] = useState('');
    const [search, setSearch] = useState('');
    const { data, loading, refetch } = useApi(() => api.memoryEntities({
        type: typeFilter || undefined,
        workspace: workspaceFilter || undefined,
        search: search || undefined,
    }), [typeFilter, workspaceFilter, search]);
    const entityTypes = ['person', 'tool', 'skill', 'concept', 'preference', 'decision', 'fact'];
    return (<div>
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input">
          <option value="">All Types</option>
          {entityTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>

        <input type="text" placeholder="Filter by workspace..." value={workspaceFilter} onChange={(e) => setWorkspaceFilter(e.target.value)} className="input w-40"/>

        <input type="text" placeholder="Search entities..." value={search} onChange={(e) => setSearch(e.target.value)} className="input flex-1 min-w-[200px]"/>
      </div>

      {loading ? (<LoadingSpinner message="Loading entities..."/>) : !data || data.length === 0 ? (<EmptyState message="No memory entities found."/>) : (<div className="space-y-2">
          {data.map((entity) => (<div key={entity.entityId} className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{entity.name}</span>
                    <span className="badge badge-info">{entity.entityType}</span>
                    <span className="badge badge-muted">{entity.workspace}</span>
                  </div>
                  <p className="text-xs text-claw-muted mt-1 line-clamp-2">{entity.content}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-claw-muted">
                    {Math.round(entity.confidence * 100)}% conf
                  </p>
                  <p className="text-xs text-claw-muted">{entity.tokenCost} tokens</p>
                  <p className="text-xs text-claw-muted">{entity.accessCount} accesses</p>
                </div>
              </div>
            </div>))}
        </div>)}
    </div>);
}
function KnowledgeGraphView() {
    const { data, loading } = useApi(() => api.memoryGraph());
    const canvasRef = useRef(null);
    const nodesRef = useRef([]);
    const animRef = useRef(0);
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data)
            return;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        const w = canvas.width;
        const h = canvas.height;
        const nodes = nodesRef.current;
        // Simple force simulation step
        for (const node of nodes) {
            // Center gravity
            node.vx += (w / 2 - node.x) * 0.001;
            node.vy += (h / 2 - node.y) * 0.001;
            // Repulsion from other nodes
            for (const other of nodes) {
                if (other.id === node.id)
                    continue;
                const dx = node.x - other.x;
                const dy = node.y - other.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                if (dist < 120) {
                    const force = (120 - dist) * 0.01;
                    node.vx += (dx / dist) * force;
                    node.vy += (dy / dist) * force;
                }
            }
        }
        // Edge attraction
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        for (const edge of data.edges) {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target)
                continue;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist - 80) * 0.003;
            source.vx += (dx / dist) * force;
            source.vy += (dy / dist) * force;
            target.vx -= (dx / dist) * force;
            target.vy -= (dy / dist) * force;
        }
        // Apply velocity with damping
        for (const node of nodes) {
            node.vx *= 0.9;
            node.vy *= 0.9;
            node.x += node.vx;
            node.y += node.vy;
            node.x = Math.max(30, Math.min(w - 30, node.x));
            node.y = Math.max(30, Math.min(h - 30, node.y));
        }
        // Clear and draw
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, w, h);
        // Draw edges
        ctx.strokeStyle = '#1e1e2e';
        ctx.lineWidth = 1;
        for (const edge of data.edges) {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target)
                continue;
            ctx.beginPath();
            ctx.moveTo(source.x, source.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
        }
        // Draw nodes
        const typeColors = {
            person: '#6366f1',
            tool: '#22c55e',
            skill: '#f59e0b',
            concept: '#8b5cf6',
            preference: '#ec4899',
            decision: '#14b8a6',
            fact: '#64748b',
        };
        for (const node of nodes) {
            ctx.fillStyle = typeColors[node.type] || '#6366f1';
            ctx.beginPath();
            ctx.arc(node.x, node.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(node.name.slice(0, 20), node.x, node.y - 10);
        }
        animRef.current = requestAnimationFrame(draw);
    }, [data]);
    useEffect(() => {
        if (!data || data.nodes.length === 0)
            return;
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        // Initialize node positions
        nodesRef.current = data.nodes.map((n, i) => ({
            ...n,
            x: canvas.width / 2 + (Math.random() - 0.5) * 300,
            y: canvas.height / 2 + (Math.random() - 0.5) * 300,
            vx: 0,
            vy: 0,
        }));
        animRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animRef.current);
    }, [data, draw]);
    if (loading)
        return <LoadingSpinner message="Loading knowledge graph..."/>;
    if (!data || data.nodes.length === 0) {
        return <EmptyState message="No entities in the knowledge graph yet."/>;
    }
    return (<div>
      <div className="flex items-center gap-3 mb-3 text-xs text-claw-muted">
        <span>{data.nodes.length} entities</span>
        <span>{data.edges.length} relations</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"/> person</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/> tool</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"/> skill</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block"/> concept</span>
      </div>
      <div className="card p-0 overflow-hidden">
        <canvas ref={canvasRef} width={900} height={500} className="w-full" style={{ aspectRatio: '9/5' }}/>
      </div>
    </div>);
}
// ─── Recall Simulator ──────────────────────────────────────────────
function RecallSimulator() {
    const { data: agents } = useApi(() => api.agents());
    const [agentId, setAgentId] = useState('');
    const [workspace, setWorkspace] = useState('default');
    const [tokenBudget, setTokenBudget] = useState('2000');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const runRecall = async () => {
        if (!agentId)
            return;
        setLoading(true);
        try {
            const res = await api.memoryRecall(agentId, workspace, parseInt(tokenBudget));
            setResult(res);
        }
        catch {
            setResult(null);
        }
        finally {
            setLoading(false);
        }
    };
    return (<div>
      <div className="card mb-4">
        <h3 className="text-sm font-medium mb-3">Simulate Token-Budgeted Recall</h3>
        <p className="text-xs text-claw-muted mb-4">
          Enter a query to see what ClawMemory would inject into context within the token budget.
        </p>

        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-claw-muted block mb-1">Agent</label>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="input">
              <option value="">Select agent...</option>
              {agents?.map((a) => (<option key={a.agentId} value={a.agentId}>{a.name}</option>))}
            </select>
          </div>

          <div>
            <label className="text-xs text-claw-muted block mb-1">Workspace</label>
            <input type="text" value={workspace} onChange={(e) => setWorkspace(e.target.value)} className="input w-32"/>
          </div>

          <div>
            <label className="text-xs text-claw-muted block mb-1">Token Budget</label>
            <input type="number" value={tokenBudget} onChange={(e) => setTokenBudget(e.target.value)} className="input w-24"/>
          </div>

          <button onClick={runRecall} disabled={!agentId || loading} className="btn btn-primary">
            {loading ? 'Running...' : 'Run Recall'}
          </button>
        </div>
      </div>

      {result && (<div>
          <div className="flex gap-4 mb-4 text-sm">
            <span className="text-claw-muted">
              Entities returned: <span className="text-claw-text">{result.entitiesReturned}</span>
            </span>
            <span className="text-claw-muted">
              Tokens used: <span className="text-claw-text">{result.totalTokens}</span> / {result.tokenBudget}
            </span>
          </div>

          <div className="space-y-2">
            {result.entities.map((entity) => (<div key={entity.entityId} className="card">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{entity.name}</span>
                  <span className="badge badge-info">{entity.entityType}</span>
                  <span className="text-xs text-claw-muted">
                    {Math.round(entity.confidence * 100)}% conf &middot; {entity.tokenCost} tokens
                  </span>
                </div>
                <p className="text-xs text-claw-muted">{entity.content}</p>
              </div>))}
          </div>
        </div>)}
    </div>);
}
function EmptyState({ message }) {
    return (<div className="card text-center py-8 text-claw-muted text-sm">{message}</div>);
}
//# sourceMappingURL=Memory.js.map