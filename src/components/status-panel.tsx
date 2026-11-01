export function StatusPanel({ title, children, error = false }: {
  title: string; children: React.ReactNode; error?: boolean;
}) {
  return <div className={`status-panel ${error ? "status-error" : ""}`} role={error ? "alert" : "status"}>
    <span className="status-marker" aria-hidden="true" />
    <div><h3>{title}</h3><div className="muted">{children}</div></div>
  </div>;
}
