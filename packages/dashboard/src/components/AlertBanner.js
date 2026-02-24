import { useState, useEffect } from 'react';
import { subscribeToEvents } from '../api';
export function AlertBanner() {
    const [alerts, setAlerts] = useState([]);
    useEffect(() => {
        const unsub = subscribeToEvents((event) => {
            if (event.type === 'connected')
                return;
            let alert = null;
            if (event.channel === 'behavior.blocked') {
                alert = {
                    id: `${Date.now()}`,
                    type: 'threat',
                    message: `Threat blocked: ${event.payload?.threatSignature || event.payload?.eventType || 'unknown'} on session ${event.sessionId?.slice(0, 8)}`,
                    timestamp: event.timestamp,
                };
            }
            else if (event.channel === 'cost.limit_exceeded') {
                alert = {
                    id: `${Date.now()}`,
                    type: 'budget',
                    message: `Budget exceeded for agent ${event.agentId?.slice(0, 8)}: ${event.payload?.limitType || 'daily'} limit`,
                    timestamp: event.timestamp,
                };
            }
            else if (event.channel === 'pipeline.failed') {
                alert = {
                    id: `${Date.now()}`,
                    type: 'pipeline',
                    message: `Pipeline failed: ${event.payload?.name || event.payload?.pipelineId?.slice(0, 8)}`,
                    timestamp: event.timestamp,
                };
            }
            if (alert) {
                setAlerts(prev => [alert, ...prev].slice(0, 5));
            }
        });
        return unsub;
    }, []);
    if (alerts.length === 0)
        return null;
    const latestAlert = alerts[0];
    const bgColor = {
        threat: 'bg-red-500/10 border-red-500/30 text-red-400',
        budget: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        pipeline: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    }[latestAlert.type];
    return (<div className={`border-b px-4 py-2 flex items-center justify-between text-sm ${bgColor}`}>
      <div className="flex items-center gap-2">
        <span className="font-medium">
          {latestAlert.type === 'threat' && 'SECURITY'}
          {latestAlert.type === 'budget' && 'BUDGET'}
          {latestAlert.type === 'pipeline' && 'PIPELINE'}
        </span>
        <span>{latestAlert.message}</span>
      </div>
      <button onClick={() => setAlerts([])} className="text-xs opacity-60 hover:opacity-100">
        Dismiss
      </button>
    </div>);
}
//# sourceMappingURL=AlertBanner.js.map