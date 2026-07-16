import { useState } from 'react';
import './ResetRoomPage.css';

export default function ResetRoomPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function startSession() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/reset-sessions', { method: 'POST' });
      if (!response.ok) throw new Error('Could not start a session.');
      const data = await response.json();
      window.location.href = `/reset/s/${data.id}`;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Reset Room</h1>
        <p>A guided space for working through conflict together, step by step.</p>
      </div>

      <div className="reset-intro-card">
        <h2>Say what's sitting with you, one feeling at a time</h2>
        <p>
          One of you shares what's bothering them, the other listens and reassures — no fixing, no
          debating, just working through it together until it actually lands. You'll each get your
          own link to join from, and nothing you say here goes anywhere else until you're both done.
        </p>
        <button type="button" className="reset-start-btn" onClick={startSession} disabled={loading}>
          {loading ? 'Starting…' : 'Start a Reset Room session'}
        </button>
        {error && <p className="reset-error">{error}</p>}
        <p className="reset-note">
          You can also trigger this from Discord with <code>/triggered</code> once it's set up — either
          way, you'll both get a link to join, and messages elsewhere pause until the session wraps up.
        </p>
      </div>
    </div>
  );
}
