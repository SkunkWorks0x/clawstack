import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: GridIcon },
  { to: '/security', label: 'Security', icon: ShieldIcon },
  { to: '/cost', label: 'Cost', icon: DollarIcon },
  { to: '/memory', label: 'Memory', icon: BrainIcon },
  { to: '/pipelines', label: 'Pipelines', icon: PipeIcon },
  { to: '/setup', label: 'Setup', icon: WrenchIcon },
];

export function Sidebar() {
  return (
    <aside className="w-56 h-screen bg-claw-surface border-r border-claw-border flex flex-col shrink-0">
      <div className="p-4 border-b border-claw-border">
        <h1 className="text-lg font-bold text-claw-text tracking-tight">
          <span className="text-claw-accent">Claw</span>Stack
        </h1>
        <p className="text-xs text-claw-muted mt-0.5">Agent Operating System</p>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'text-claw-accent bg-claw-accent/10 border-r-2 border-claw-accent'
                  : 'text-claw-muted hover:text-claw-text hover:bg-claw-bg/50'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-claw-border">
        <p className="text-xs text-claw-muted">v0.1.0</p>
      </div>
    </aside>
  );
}

// ─── Inline SVG Icons ─────────────────────────────────────────────

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function DollarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  );
}

function PipeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="4,7 4,4 20,4 20,7" />
      <line x1="12" y1="4" x2="12" y2="9" />
      <rect x="4" y="9" width="16" height="6" rx="1" />
      <line x1="12" y1="15" x2="12" y2="20" />
      <polyline points="4,17 4,20 20,20 20,17" />
    </svg>
  );
}

function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
