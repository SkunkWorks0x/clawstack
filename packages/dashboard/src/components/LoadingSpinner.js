export function LoadingSpinner({ message }) {
    return (<div className="flex items-center justify-center py-12 text-claw-muted">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-claw-border border-t-claw-accent rounded-full animate-spin"/>
        {message && <p className="text-sm">{message}</p>}
      </div>
    </div>);
}
//# sourceMappingURL=LoadingSpinner.js.map