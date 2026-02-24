import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { StatCard } from '../components/StatCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
export function Overview() {
    const { data, loading, error } = useApi(() => api.overview());
    if (loading)
        return <LoadingSpinner message="Loading dashboard..."/>;
    if (error)
        return <ErrorState message={error}/>;
    if (!data)
        return null;
    return (<div>
      <h2 className="text-xl font-semibold mb-6">Overview</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Agents Registered" value={data.totalAgents} color="accent"/>
        <StatCard label="Active Sessions" value={data.activeSessions} color="success"/>
        <StatCard label="Threats Blocked Today" value={data.threatsBlockedToday} color={data.threatsBlockedToday > 0 ? 'danger' : 'success'}/>
        <StatCard label="Active Pipelines" value={data.activePipelines} color="accent"/>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Spent Today" value={`$${data.moneySpentToday.toFixed(2)}`} color="warning"/>
        <StatCard label="Saved by Smart Router" value={`$${data.moneySavedByRouter.toFixed(2)}`} sub="Estimated savings from model downgrading" color="success"/>
        <StatCard label="Memory Entities" value={data.memoryEntities} sub="Across all agents and workspaces" color="accent"/>
      </div>

      <div className="mt-8 card">
        <h3 className="text-sm font-medium text-claw-muted mb-3">Quick Links</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { label: 'View Threat Feed', href: '/security' },
            { label: 'Spending Chart', href: '/cost' },
            { label: 'Knowledge Graph', href: '/memory' },
            { label: 'Pipeline Status', href: '/pipelines' },
            { label: 'Agent Setup', href: '/setup' },
            { label: 'Budget Limits', href: '/cost' },
        ].map((link) => (<a key={link.label} href={link.href} className="text-sm text-claw-accent hover:text-claw-accent-bright transition-colors">
              {link.label}
            </a>))}
        </div>
      </div>
    </div>);
}
function ErrorState({ message }) {
    return (<div className="flex items-center justify-center py-12">
      <div className="card text-center max-w-md">
        <p className="text-claw-danger font-medium mb-2">Failed to load dashboard</p>
        <p className="text-sm text-claw-muted">{message}</p>
        <p className="text-xs text-claw-muted mt-3">
          Make sure the API server is running on port 3001
        </p>
      </div>
    </div>);
}
//# sourceMappingURL=Overview.js.map