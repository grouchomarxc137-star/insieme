import { useState } from 'react';
import { useLiveNow } from '../hooks/useLiveNow.js';
import { useMilestones } from '../hooks/useMilestones.js';
import { formatDate, getDurationParts, getNextMonthlyAnniversary } from '../lib/moments.js';
import './MomentsPage.css';

const ACCENTS = ['lavender', 'pink', 'mint', 'gold'];
const ICON_CHOICES = ['💬', '💍', '💋', '💛', '🏡', '✈️', '🎂', '⭐', '🌙', '🔥'];

// Stored dates are local datetime strings ("2026-01-29T18:00:00"), the same
// shape the old hard-coded array used. <input type="datetime-local"> wants
// exactly "YYYY-MM-DDTHH:mm".
function toInputValue(dateStr) {
  const match = String(dateStr || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (match) return `${match[1]}T${match[2]}`;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default function MomentsPage() {
  const now = useLiveNow();
  const { milestones, loading, error, createMilestone, updateMilestone, deleteMilestone } = useMilestones();

  // Pinned moments float to the front (the server sorts the same way, but
  // re-sort here too so a pin toggle reorders instantly, before the next poll).
  const ordered = [...milestones].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      a.sortOrder - b.sortOrder ||
      new Date(a.createdAt) - new Date(b.createdAt)
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>Moments</h1>
        <p>Your bond, visualized — live counters for the time you've shared together.</p>
      </div>

      {error && <p className="moment-error">{error}</p>}

      <AddMomentForm onCreate={createMilestone} />

      {loading && milestones.length === 0 ? (
        <p className="moment-detail">Loading…</p>
      ) : (
        <div className="moments-grid">
          {ordered.map((milestone, index) => (
            <MomentCard
              key={milestone.id}
              milestone={milestone}
              now={now}
              accent={ACCENTS[index % ACCENTS.length]}
              onUpdate={updateMilestone}
              onDelete={deleteMilestone}
            />
          ))}
          <FutureMomentCard accent={ACCENTS[ordered.length % ACCENTS.length]} />
        </div>
      )}
    </div>
  );
}

function MomentCard({ milestone, now, accent, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <MomentEditor
        accent={accent}
        initial={milestone}
        submitLabel="Save"
        onSave={async (patch) => {
          await onUpdate(milestone.id, patch);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
        onDelete={async () => {
          if (!window.confirm(`Remove "${milestone.label}"?`)) return;
          await onDelete(milestone.id);
        }}
      />
    );
  }

  const date = new Date(milestone.date);
  const since = getDurationParts(date, now);
  const nextAnniversary = getNextMonthlyAnniversary(date, now);
  const untilAnniversary = getDurationParts(now, nextAnniversary);

  return (
    <article className={`moment-card moment-card--${accent}${milestone.pinned ? ' moment-card--pinned' : ''}`}>
      <div className="moment-card-top">
        <span className="moment-icon">{milestone.icon}</span>
        <div className="moment-card-actions">
          <button
            type="button"
            className={`moment-pin-btn${milestone.pinned ? ' is-pinned' : ''}`}
            onClick={() => onUpdate(milestone.id, { pinned: !milestone.pinned })}
            aria-pressed={milestone.pinned}
            aria-label={milestone.pinned ? `Unpin "${milestone.label}"` : `Pin "${milestone.label}"`}
          >
            {milestone.pinned ? '📌 Pinned' : 'Pin'}
          </button>
          <button
            type="button"
            className="moment-edit-btn"
            onClick={() => setEditing(true)}
            aria-label={`Edit "${milestone.label}"`}
          >
            Edit
          </button>
        </div>
      </div>
      <h2 className="moment-title">{milestone.label}</h2>
      <p className="moment-counter">
        {since.months}mo {since.days}d {since.hours}h {since.minutes}m {since.seconds}s
      </p>
      <p className="moment-detail">Since {formatDate(date)}</p>
      <p className="moment-detail">
        Next monthly anniversary {formatDate(nextAnniversary)} — in {untilAnniversary.days}d{' '}
        {untilAnniversary.hours}h {untilAnniversary.minutes}m {untilAnniversary.seconds}s
      </p>
    </article>
  );
}

function FutureMomentCard({ accent }) {
  return (
    <article className={`moment-card moment-card--${accent} moment-card--future`}>
      <span className="moment-icon">⏰</span>
      <h2 className="moment-title">Since we got married?</h2>
      <p className="moment-counter pixel-font">Soon…</p>
      <p className="moment-detail">Mission status: work in progress.</p>
    </article>
  );
}

// One collapsed button that expands into a MomentEditor with no initial
// values — keeps the top of the page quiet until you actually want to add.
function AddMomentForm({ onCreate }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="moment-add-btn" onClick={() => setOpen(true)}>
        ＋ Add a moment
      </button>
    );
  }

  return (
    <MomentEditor
      submitLabel="Add moment"
      onSave={async (data) => {
        await onCreate(data);
        setOpen(false);
      }}
      onCancel={() => setOpen(false)}
    />
  );
}

// Shared by "add" and "edit" — same fields either way. `onDelete` is only
// passed in edit mode.
function MomentEditor({ accent = 'lavender', initial, onSave, onCancel, onDelete, submitLabel = 'Save' }) {
  const [label, setLabel] = useState(initial?.label || '');
  const [icon, setIcon] = useState(initial?.icon || '💛');
  const [dateValue, setDateValue] = useState(initial ? toInputValue(initial.date) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!label.trim()) {
      setError('Give the moment a name.');
      return;
    }
    if (!dateValue) {
      setError('Pick a date.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ label: label.trim(), icon: icon.trim() || '💛', date: dateValue });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className={`moment-card moment-card--${accent} moment-editor`} onSubmit={handleSubmit}>
      <label className="moment-field">
        Name
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Since we…" />
      </label>

      <label className="moment-field">
        Date &amp; time
        <input type="datetime-local" value={dateValue} onChange={(e) => setDateValue(e.target.value)} />
      </label>

      <div className="moment-field">
        <span>Icon</span>
        <div className="moment-icon-choices">
          {ICON_CHOICES.map((choice) => (
            <button
              type="button"
              key={choice}
              className={`moment-icon-choice${icon === choice ? ' is-selected' : ''}`}
              onClick={() => setIcon(choice)}
            >
              {choice}
            </button>
          ))}
          <input
            type="text"
            className="moment-icon-custom"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            aria-label="Custom icon"
            maxLength={4}
          />
        </div>
      </div>

      {error && <p className="moment-error">{error}</p>}

      <div className="moment-editor-actions">
        <button type="submit" className="moment-btn moment-btn--primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="moment-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        {onDelete && (
          <button type="button" className="moment-btn moment-btn--danger" onClick={onDelete} disabled={busy}>
            Remove
          </button>
        )}
      </div>
    </form>
  );
}
