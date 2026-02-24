interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'accent' | 'danger' | 'warning' | 'success' | 'muted';
}

const COLOR_MAP = {
  accent: 'text-claw-accent',
  danger: 'text-claw-danger',
  warning: 'text-claw-warning',
  success: 'text-claw-success',
  muted: 'text-claw-muted',
};

export function StatCard({ label, value, sub, color = 'accent' }: StatCardProps) {
  return (
    <div className="card">
      <p className="text-xs text-claw-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${COLOR_MAP[color]}`}>{value}</p>
      {sub && <p className="text-xs text-claw-muted mt-1">{sub}</p>}
    </div>
  );
}
