import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api, } from '../api';
import { StatCard } from '../components/StatCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, } from 'recharts';
export function Cost() {
    const [tab, setTab] = useState('spending');
    return (<div>
      <h2 className="text-xl font-semibold mb-4">Cost — ClawBudget</h2>

      <div className="flex gap-1 mb-6 border-b border-claw-border">
        {[
            { id: 'spending', label: 'Spending' },
            { id: 'budgets', label: 'Budgets' },
            { id: 'router', label: 'Smart Router' },
            { id: 'surgery', label: 'Context Surgery' },
        ].map(({ id, label }) => (<button key={id} onClick={() => setTab(id)} className={`px-4 py-2 text-sm border-b-2 transition-colors ${tab === id
                ? 'border-claw-accent text-claw-accent'
                : 'border-transparent text-claw-muted hover:text-claw-text'}`}>
            {label}
          </button>))}
      </div>

      {tab === 'spending' && <SpendingChart />}
      {tab === 'budgets' && <BudgetTable />}
      {tab === 'router' && <RouterStatsView />}
      {tab === 'surgery' && <SurgeryView />}
    </div>);
}
function SpendingChart() {
    const { data, loading } = useApi(() => api.dailyCosts(30));
    if (loading)
        return <LoadingSpinner message="Loading spending data..."/>;
    if (!data || data.length === 0) {
        return <EmptyState message="No cost data recorded yet."/>;
    }
    const totalSpent = data.reduce((sum, d) => sum + d.cost_usd, 0);
    const totalCalls = data.reduce((sum, d) => sum + d.api_calls, 0);
    return (<div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total (30d)" value={`$${totalSpent.toFixed(2)}`} color="warning"/>
        <StatCard label="API Calls (30d)" value={totalCalls.toLocaleString()} color="accent"/>
        <StatCard label="Avg/Day" value={`$${(totalSpent / Math.max(data.length, 1)).toFixed(2)}`} color="muted"/>
      </div>

      <div className="card">
        <h3 className="text-sm font-medium text-claw-muted mb-4">Daily Spending (Last 30 Days)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e"/>
              <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(d) => d.slice(5)}/>
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v) => `$${v}`}/>
              <Tooltip contentStyle={{
            backgroundColor: '#12121a',
            border: '1px solid #1e1e2e',
            borderRadius: 8,
            color: '#e2e8f0',
            fontSize: 12,
        }} formatter={(value) => [`$${value.toFixed(4)}`, 'Cost']} labelFormatter={(label) => `Date: ${label}`}/>
              <Bar dataKey="cost_usd" fill="#6366f1" radius={[4, 4, 0, 0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>);
}
function BudgetTable() {
    const { data, loading } = useApi(() => api.budgets());
    if (loading)
        return <LoadingSpinner message="Loading budgets..."/>;
    if (!data || data.length === 0) {
        return <EmptyState message="No agents registered yet."/>;
    }
    return (<div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-claw-muted uppercase border-b border-claw-border">
            <th className="py-2 pr-4">Agent</th>
            <th className="py-2 pr-4">Daily Limit</th>
            <th className="py-2 pr-4">Spent Today</th>
            <th className="py-2 pr-4">Usage</th>
            <th className="py-2 pr-4">Calls</th>
          </tr>
        </thead>
        <tbody>
          {data.map((b) => (<tr key={b.agentId} className="table-row">
              <td className="py-2 pr-4 font-medium">{b.agentName}</td>
              <td className="py-2 pr-4 text-claw-muted">
                {b.budget ? `$${b.budget.maxPerDay.toFixed(2)}` : 'No limit'}
              </td>
              <td className="py-2 pr-4">${b.dailyCost.toFixed(4)}</td>
              <td className="py-2 pr-4">
                {b.budget ? (<div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-claw-bg rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${b.pctUsed > 90 ? 'bg-claw-danger' :
                    b.pctUsed > 70 ? 'bg-claw-warning' : 'bg-claw-accent'}`} style={{ width: `${Math.min(b.pctUsed, 100)}%` }}/>
                    </div>
                    <span className="text-xs text-claw-muted">{b.pctUsed.toFixed(1)}%</span>
                  </div>) : (<span className="text-claw-muted">—</span>)}
              </td>
              <td className="py-2 pr-4 text-claw-muted">{b.dailyCalls}</td>
            </tr>))}
        </tbody>
      </table>
    </div>);
}
function RouterStatsView() {
    const { data, loading } = useApi(() => api.routerStats());
    if (loading)
        return <LoadingSpinner message="Loading router stats..."/>;
    if (!data)
        return <EmptyState message="No routing data yet."/>;
    const pctRouted = data.total_requests > 0
        ? ((data.routed_requests / data.total_requests) * 100).toFixed(1)
        : '0';
    return (<div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Requests" value={data.total_requests.toLocaleString()} color="accent"/>
        <StatCard label="Smart-Routed" value={`${data.routed_requests} (${pctRouted}%)`} color="success"/>
        <StatCard label="Routed Cost" value={`$${data.routed_cost.toFixed(4)}`} color="success"/>
        <StatCard label="Direct Cost" value={`$${data.direct_cost.toFixed(4)}`} color="warning"/>
      </div>
      <div className="card">
        <h3 className="text-sm font-medium text-claw-muted mb-2">How Smart Router Works</h3>
        <p className="text-sm text-claw-muted">
          Smart Router classifies task complexity and routes simple tasks to cheaper models.
          When a request for Opus can be handled by Sonnet or Haiku, the router downgrades
          automatically — saving up to 90% per request without quality loss.
        </p>
      </div>
    </div>);
}
function SurgeryView() {
    const { data, loading } = useApi(() => api.surgeryCandidates());
    if (loading)
        return <LoadingSpinner message="Analyzing contexts..."/>;
    if (!data || data.length === 0) {
        return <EmptyState message="No bloated sessions detected. Context usage is healthy."/>;
    }
    return (<div>
      <p className="text-sm text-claw-muted mb-4">
        Sessions with over 100K tokens consumed — candidates for context surgery.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-claw-muted uppercase border-b border-claw-border">
              <th className="py-2 pr-4">Session</th>
              <th className="py-2 pr-4">Agent</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Tokens</th>
              <th className="py-2 pr-4">Cost</th>
              <th className="py-2 pr-4">API Calls</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (<tr key={c.session_id} className="table-row">
                <td className="py-2 pr-4 font-mono text-xs">{c.session_id.slice(0, 12)}</td>
                <td className="py-2 pr-4">{c.agent_name}</td>
                <td className="py-2 pr-4">
                  <span className={`badge ${c.status === 'active' ? 'badge-success' : 'badge-muted'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="py-2 pr-4 text-claw-warning">{c.total_tokens.toLocaleString()}</td>
                <td className="py-2 pr-4">${c.total_cost.toFixed(4)}</td>
                <td className="py-2 pr-4 text-claw-muted">{c.call_count}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>);
}
function EmptyState({ message }) {
    return (<div className="card text-center py-8 text-claw-muted text-sm">{message}</div>);
}
//# sourceMappingURL=Cost.js.map