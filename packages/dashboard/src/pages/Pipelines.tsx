import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api, type PipelineSummary, type PipelineDetail } from '../api';
import { LoadingSpinner } from '../components/LoadingSpinner';

const STATUS_BADGES: Record<string, string> = {
  completed: 'badge-success',
  running: 'badge-info',
  pending: 'badge-muted',
  failed: 'badge-danger',
  cancelled: 'badge-warning',
};

export function Pipelines() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Pipelines — ClawPipe</h2>

      {selectedId ? (
        <PipelineDetailView
          pipelineId={selectedId}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <PipelineList onSelect={setSelectedId} />
      )}
    </div>
  );
}

function PipelineList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data, loading } = useApi<PipelineSummary[]>(() => api.pipelines());

  if (loading) return <LoadingSpinner message="Loading pipelines..." />;
  if (!data || data.length === 0) {
    return <EmptyState message="No pipelines have been executed yet." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-claw-muted uppercase border-b border-claw-border">
            <th className="py-2 pr-4">Pipeline</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Steps</th>
            <th className="py-2 pr-4">Cost</th>
            <th className="py-2 pr-4">Created</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.pipelineId} className="table-row">
              <td className="py-2 pr-4 font-medium">{p.name}</td>
              <td className="py-2 pr-4">
                <span className={`badge ${STATUS_BADGES[p.status] || 'badge-muted'}`}>
                  {p.status}
                </span>
              </td>
              <td className="py-2 pr-4">
                <span className="text-claw-accent">{p.completedSteps}</span>
                <span className="text-claw-muted">/{p.totalSteps}</span>
              </td>
              <td className="py-2 pr-4">${p.totalCostUsd.toFixed(4)}</td>
              <td className="py-2 pr-4 text-claw-muted">{formatTime(p.createdAt)}</td>
              <td className="py-2 pr-4">
                <button
                  onClick={() => onSelect(p.pipelineId)}
                  className="btn btn-ghost text-xs"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PipelineDetailView({
  pipelineId,
  onBack,
}: {
  pipelineId: string;
  onBack: () => void;
}) {
  const { data, loading } = useApi<PipelineDetail>(() => api.pipeline(pipelineId), [pipelineId]);

  if (loading) return <LoadingSpinner message="Loading pipeline..." />;
  if (!data) return <EmptyState message="Pipeline not found." />;

  const { pipeline, steps } = data;

  return (
    <div>
      <button onClick={onBack} className="btn btn-ghost text-xs mb-4">
        &larr; Back to list
      </button>

      <div className="card mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">{pipeline.name}</h3>
          <span className={`badge ${STATUS_BADGES[pipeline.status] || 'badge-muted'}`}>
            {pipeline.status}
          </span>
        </div>
        <div className="flex gap-4 text-sm text-claw-muted">
          <span>Steps: {pipeline.completedSteps}/{pipeline.totalSteps}</span>
          <span>Cost: ${pipeline.totalCostUsd.toFixed(4)}</span>
          {pipeline.startedAt && <span>Started: {formatTime(pipeline.startedAt)}</span>}
          {pipeline.completedAt && <span>Completed: {formatTime(pipeline.completedAt)}</span>}
        </div>
      </div>

      {/* Step-by-step progress */}
      <h4 className="text-sm font-medium text-claw-muted mb-3">Execution Steps</h4>
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={step.stepId} className="card flex items-start gap-3">
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-claw-bg text-xs font-mono shrink-0 mt-0.5">
              {step.stepNumber}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{step.name}</span>
                <span className={`badge ${STATUS_BADGES[step.status] || 'badge-muted'}`}>
                  {step.status}
                </span>
                {step.costUsd > 0 && (
                  <span className="text-xs text-claw-muted">${step.costUsd.toFixed(4)}</span>
                )}
              </div>
              {step.result != null && (
                <pre className="text-xs text-claw-muted mt-2 bg-claw-bg rounded p-2 overflow-x-auto max-h-40">
                  {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2) as string}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* YAML Definition */}
      {pipeline.definitionYaml && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-claw-muted mb-3">Pipeline Definition (YAML)</h4>
          <pre className="card text-xs overflow-x-auto max-h-64">{pipeline.definitionYaml}</pre>
        </div>
      )}
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
