/** Main menu: online play, an offline practice table against bots, settings. */
export function Home({
  onOnline,
  onPractice,
  onSettings,
  notice,
}: {
  onOnline: () => void;
  onPractice: () => void;
  onSettings: () => void;
  notice: string | null;
}) {
  return (
    <div className="home">
      <div className="hero">
        <div className="hero-suits" aria-hidden="true">
          <span>♠</span>
          <span className="red">♥</span>
          <span>♣</span>
          <span className="red">♦</span>
        </div>
        <p className="hero-welcome">Welcome to</p>
        <h1 className="hero-title">Hosn Obe</h1>
      </div>

      {notice && <p className="notice">{notice}</p>}

      <nav className="menu">
        <button className="menu-btn" onClick={onOnline}>
          <span className="menu-btn-title">Play online</span>
          <span className="menu-btn-sub">Create or join a room with friends</span>
        </button>
        <button className="menu-btn menu-btn--alt" onClick={onPractice}>
          <span className="menu-btn-title">Practice</span>
          <span className="menu-btn-sub">Play against bots — works offline</span>
        </button>
        <button className="menu-btn menu-btn--plain" onClick={onSettings}>
          <span className="menu-btn-title">Settings</span>
        </button>
      </nav>
    </div>
  );
}
