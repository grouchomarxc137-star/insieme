import { useState } from 'react';
import './DiscordSendPanel.css';

export default function DiscordSendPanel({ title, subtitle, options, sendLabel = 'Send to Discord', user, messageLabel, updateNickname = false }) {
  const [selected, setSelected] = useState(null);
  const [lastSent, setLastSent] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const selectedOption = options.find((o) => o.id === selected) || null;

  async function handleSend() {
    if (!selectedOption || sending) return;
    setSending(true);
    setError(null);
    try {
      const content = `**${user}**${messageLabel ? ` ${messageLabel}` : ''}: ${selectedOption.label}`;
      // Same key every time this person sends this type of update, so the
      // server can delete their previous one and only the latest shows.
      const key = messageLabel ? `${user}-${messageLabel}` : undefined;
      // Only this panel's own emoji goes along, and only when it's opted
      // into nickname sync — Emergency Mood posts a message but never
      // touches your server nickname.
      const body =
        updateNickname && selectedOption.emoji
          ? { content, key, user, emoji: selectedOption.emoji }
          : { content, key };
      const response = await fetch('/api/discord-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Discord relay rejected the message');
      setLastSent(selectedOption.label);
    } catch {
      setError("Couldn't send — try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="discord-panel">
      <div className="discord-panel-header">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="discord-options">
        {options.map((option) => (
          <div key={option.id} className="discord-option-wrap">
            <button
              type="button"
              className={`discord-option${option.id === selected ? ' is-selected' : ''}`}
              onClick={() => {
                setSelected(option.id);
                setError(null);
              }}
            >
              {option.label}
            </button>
            {option.description && <span className="discord-option-tooltip">{option.description}</span>}
          </div>
        ))}
      </div>
      <div className="discord-send-row">
        <button
          type="button"
          className="discord-send-btn"
          onClick={handleSend}
          disabled={!selectedOption || sending}
        >
          {sending ? 'Sending…' : sendLabel}
        </button>
        {error && <span className="discord-error">{error}</span>}
        {!error && lastSent && (
          <span className="discord-confirm">
            ✓ Sent "{lastSent}" to Discord{user ? ` as ${user}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
