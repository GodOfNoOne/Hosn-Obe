/** Placeholder until there is something to configure. */
export function Settings({ onBack }: { onBack: () => void }) {
  return (
    <div className="panel">
      <h2 className="panel-title">Settings</h2>
      <p className="hint hint--left">Nothing to change yet — coming soon.</p>
      <div className="row row--spaced">
        <button className="secondary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
