import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api, type BehaviorEvent, type SkillTrustRow } from '../api';
import { LoadingSpinner } from '../components/LoadingSpinner';

type Tab = 'threats' | 'killswitch' | 'trust';

const THREAT_COLORS: Record<string, string> = {
  critical: 'badge-danger',
  high: 'badge-danger',
  medium: 'badge-warning',
  low: 'badge-muted',
};

const TRUST_COLORS: Record<string, string> = {
  certified: 'badge-success',
  verified: 'badge-info',
  community: 'badge-muted',
  untrusted: 'badge-warning',
  unknown: 'badge-danger',
};

export function Security() {
  const [tab, setTab] = useState<Tab>('threats');

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Security — ClawGuard</h2>

      <div className="flex gap-1 mb-6 border-b border-claw-border">
        {(['threats', 'killswitch', 'trust'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t
                ? 'border-claw-accent text-claw-accent'
                : 'border-transparent text-claw-muted hover:text-claw-text'
            }`}
          >
            {t === 'threats' && 'Threat Feed'}
            {t === 'killswitch' && 'Kill Switch Log'}
            {t === 'trust' && 'Skill Trust'}
          </button>
        ))}
      </div>

      {tab === 'threats' && <ThreatFeed />}
      {tab === 'killswitch' && <KillSwitchLog />}
      {tab === 'trust' && <SkillTrustTable />}
    </div>
  );
}

function ThreatFeed() {
  const { data, loading } = useApi<BehaviorEvent[]>(() => api.threats('low'));

  if (loading) return <LoadingSpinner message="Loading threats..." />;

  if (!data || data.length === 0) {
    return <EmptyState message="No threats detected. All clear." />;
  }

  return (
    <div className="space-y-2">
      {data.map((event) => (
        <div key={event.eventId} className="card flex items-start gap-3">
          <span className={`badge ${THREAT_COLORS[event.threatLevel] || 'badge-muted'} mt-0.5`}>
            {event.threatLevel.toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{event.eventType}</span>
              {event.blocked && <span className="badge badge-danger">BLOCKED</span>}
              {event.threatSignature && (
                <span className="text-xs text-claw-muted">{event.threatSignature}</span>
              )}
            </div>
            <p className="text-xs text-claw-muted mt-0.5">
              Session {event.sessionId.slice(0, 8)} &middot; {formatTime(event.timestamp)}
            </p>
            {Object.keys(event.details).length > 0 && (
              <pre className="text-xs text-claw-muted mt-1 bg-claw-bg rounded p-2 overflow-x-auto">
                {JSON.stringify(event.details, null, 2)}
              </pre>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function KillSwitchLog() {
  const { data, loading } = useApi<any[]>(() => api.blockedEvents());

  if (loading) return <LoadingSpinner message="Loading kill switch log..." />;

  if (!data || data.length === 0) {
    return <EmptyState message="No sessions terminated by kill switch." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-claw-muted uppercase border-b border-claw-border">
            <th className="py-2 pr-4">Time</th>
            <th className="py-2 pr-4">Agent</th>
            <th className="py-2 pr-4">Event Type</th>
            <th className="py-2 pr-4">Threat</th>
            <th className="py-2 pr-4">Signature</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row: any) => (
            <tr key={row.event_id} className="table-row">
              <td className="py-2 pr-4 text-claw-muted">{formatTime(row.timestamp)}</td>
              <td className="py-2 pr-4">{row.agent_name || row.agent_id?.slice(0, 8)}</td>
              <td className="py-2 pr-4">{row.event_type}</td>
              <td className="py-2 pr-4">
                <span className={`badge ${THREAT_COLORS[row.threat_level] || 'badge-muted'}`}>
                  {row.threat_level}
                </span>
              </td>
              <td className="py-2 pr-4 text-claw-muted">{row.threat_signature || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkillTrustTable() {
  const { data, loading } = useApi<SkillTrustRow[]>(() => api.skills());

  if (loading) return <LoadingSpinner message="Loading skill trust..." />;

  if (!data || data.length === 0) {
    return <EmptyState message="No skills registered yet." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-claw-muted uppercase border-b border-claw-border">
            <th className="py-2 pr-4">Skill</th>
            <th className="py-2 pr-4">Publisher</th>
            <th className="py-2 pr-4">Trust Level</th>
            <th className="py-2 pr-4">Threat History</th>
            <th className="py-2 pr-4">Last Audit</th>
          </tr>
        </thead>
        <tbody>
          {data.map((skill) => (
            <tr key={skill.skill_id} className="table-row">
              <td className="py-2 pr-4 font-medium">{skill.skill_name}</td>
              <td className="py-2 pr-4 text-claw-muted">{skill.publisher}</td>
              <td className="py-2 pr-4">
                <span className={`badge ${TRUST_COLORS[skill.trust_level] || 'badge-muted'}`}>
                  {skill.trust_level}
                </span>
              </td>
              <td className="py-2 pr-4">
                <span className={skill.threat_history > 0 ? 'text-claw-danger' : 'text-claw-muted'}>
                  {skill.threat_history}
                </span>
              </td>
              <td className="py-2 pr-4 text-claw-muted">
                {skill.last_audit_at ? formatTime(skill.last_audit_at) : 'Never'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="card text-center py-8 text-claw-muted text-sm">{message}</div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
