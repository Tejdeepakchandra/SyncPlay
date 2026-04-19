export function ProfileFilterTabs({ tabs, activeKey, onChange, columnsClass = "grid-cols-3", className = "mb-4" }) {
  return (
    <div className={`grid ${columnsClass} gap-2 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`h-10 rounded-xl border text-sm transition-colors inline-flex items-center justify-center gap-1.5 ${
            activeKey === tab.key
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
          {tab.label}
          {typeof tab.count === "number" && ` (${tab.count})`}
        </button>
      ))}
    </div>
  );
}
