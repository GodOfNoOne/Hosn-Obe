import { useState } from "react";

import { loadServerUrl, saveServerUrl } from "./session.js";
import { DEFAULT_SERVER_URL } from "./socket.js";

/** Accepts an http(s) address and returns its origin, or `null` if it isn't one. */
function parseServerUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function Settings({ onBack }: { onBack: () => void }) {
  const [server, setServer] = useState(loadServerUrl() ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    let next: string | null = null;
    if (server.trim()) {
      next = parseServerUrl(server);
      if (!next) {
        setError("Enter a full address, e.g. https://example.trycloudflare.com");
        return;
      }
    }
    saveServerUrl(next);
    // The socket is created once at startup, so reload to connect to the new address.
    window.location.reload();
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Settings</h2>
      <label className="field">
        <span>Server address</span>
        <input
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          value={server}
          placeholder={DEFAULT_SERVER_URL}
          onChange={(e) => {
            setServer(e.target.value);
            setError(null);
          }}
        />
      </label>
      <p className="hint hint--left">Leave empty to use the default ({DEFAULT_SERVER_URL}).</p>
      <div className="row">
        <button onClick={save}>Save &amp; reconnect</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row row--spaced">
        <button className="secondary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
