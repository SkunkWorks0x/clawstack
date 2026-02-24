import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { LoadingSpinner } from '../components/LoadingSpinner';
export function Setup() {
    const { data, loading, refetch } = useApi(() => api.setupAgents());
    return (<div>
      <h2 className="text-xl font-semibold mb-4">Setup — ClawForge</h2>

      <div className="card mb-6">
        <h3 className="text-sm font-medium mb-2">Quick Actions</h3>
        <div className="flex gap-2">
          <button className="btn btn-primary text-xs" onClick={() => refetch()}>
            Refresh Status
          </button>
          <button className="btn btn-ghost text-xs" title="Run: npx clawforge audit">
            Run Security Audit
          </button>
          <button className="btn btn-ghost text-xs" title="Run: npx clawforge status">
            Check Status
          </button>
        </div>
        <p className="text-xs text-claw-muted mt-3">
          Use <code className="text-claw-accent">npx clawforge init</code> to register new agents,
          <code className="text-claw-accent ml-1">npx clawforge audit</code> to run security audits.
        </p>
      </div>

      <h3 className="text-sm font-medium text-claw-muted mb-3">Registered Agents</h3>

      {loading ? (<LoadingSpinner message="Loading agents..."/>) : !data || data.length === 0 ? (<EmptyState />) : (<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((agent) => (<div key={agent.agentId} className="card">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">{agent.name}</h4>
                <span className={`badge ${agent.activeSessions > 0 ? 'badge-success' : 'badge-muted'}`}>
                  {agent.activeSessions > 0 ? 'Active' : 'Idle'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="text-claw-muted">Platform</div>
                <div>{agent.platform}</div>

                <div className="text-claw-muted">Version</div>
                <div>{agent.version}</div>

                <div className="text-claw-muted">Docker Sandbox</div>
                <div>
                  {agent.dockerSandboxed ? (<span className="text-claw-success">Enabled</span>) : (<span className="text-claw-warning">Disabled</span>)}
                </div>

                <div className="text-claw-muted">Total Sessions</div>
                <div>{agent.totalSessions}</div>

                <div className="text-claw-muted">Active Sessions</div>
                <div className="text-claw-accent">{agent.activeSessions}</div>

                <div className="text-claw-muted">Registered</div>
                <div className="text-xs">
                  {new Date(agent.createdAt).toLocaleDateString()}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-claw-border">
                <p className="text-xs text-claw-muted font-mono truncate">
                  ID: {agent.agentId}
                </p>
              </div>
            </div>))}
        </div>)}
    </div>);
}
function EmptyState() {
    return (<div className="card text-center py-8">
      <p className="text-claw-muted text-sm mb-3">No agents registered yet.</p>
      <p className="text-xs text-claw-muted">
        Run <code className="text-claw-accent">npx clawforge init</code> to register your first agent.
      </p>
    </div>);
}
//# sourceMappingURL=Setup.js.map