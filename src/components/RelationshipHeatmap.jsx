import { useCallback, useEffect, useState } from 'react';
import { RATING_COLORS, RATING_LABELS } from '../lib/checkin.js';
import {
  buildMonthGrid,
  dateKeyOf,
  isFutureMonth,
  monthKeyOf,
  monthLabel,
  shiftMonth,
  WEEKDAY_INITIALS,
} from '../lib/heatmap.js';
import { formatDate } from '../lib/moments.js';
import './RelationshipHeatmap.css';

const RATINGS = [1, 2, 3, 4, 5];

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// A day can only be filled in by hand once it's past and its check-in never
// completed — a finished check-in was a locked, honest answer, and today still
// belongs to the check-in itself.
function isEditable(dateKey, todayKey, dayRatings, user) {
  if (dateKey >= todayKey) return false;
  return dayRatings?.[user]?.source !== 'checkin';
}

export default function RelationshipHeatmap({ user, checkinStatus }) {
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(new Date()));
  const [days, setDays] = useState({});
  const [loading, setLoading] = useState(true);
  const [openDateKey, setOpenDateKey] = useState(null);
  const [error, setError] = useState(null);

  const todayKey = dateKeyOf(new Date());
  const otherName = user === 'Principe' ? 'Principessa' : 'Principe';

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/checkins/daily/heatmap/${monthKey}`);
      if (!response.ok) throw new Error('Could not load the heatmap.');
      const data = await response.json();
      setDays(data.days || {});
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  // checkinStatus is a dependency so today's square fills in as soon as the
  // day's check-in completes, without waiting for a reload.
  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh, checkinStatus]);

  function goToMonth(delta) {
    setOpenDateKey(null);
    setMonthKey((current) => shiftMonth(current, delta));
  }

  async function saveRating(dateKey, rating) {
    const previous = days;
    // Optimistic: the grid is the thing being manipulated, so it should move
    // under your finger rather than after a round trip.
    setDays((current) => ({
      ...current,
      [dateKey]: { ...current[dateKey], [user]: { rating, source: 'manual' } },
    }));
    setError(null);

    try {
      const response = await fetch(`/api/checkins/daily/rating/${dateKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant: user, rating }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Could not save that rating.');
      }
    } catch (err) {
      setDays(previous);
      setError(err.message);
    }
  }

  async function clearRating(dateKey) {
    const previous = days;
    setDays((current) => {
      const nextDay = { ...current[dateKey] };
      delete nextDay[user];
      const next = { ...current };
      if (Object.keys(nextDay).length) next[dateKey] = nextDay;
      else delete next[dateKey];
      return next;
    });
    setError(null);

    try {
      const response = await fetch(`/api/checkins/daily/rating/${dateKey}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant: user }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Could not clear that rating.');
      }
    } catch (err) {
      setDays(previous);
      setError(err.message);
    }
  }

  const canGoForward = !isFutureMonth(shiftMonth(monthKey, 1));

  return (
    <section className="heatmap-card">
      <div className="heatmap-header">
        <button type="button" className="heatmap-nav" onClick={() => goToMonth(-1)} aria-label="Previous month">
          ‹
        </button>
        <h2 className="heatmap-month">{monthLabel(monthKey)}</h2>
        <button
          type="button"
          className="heatmap-nav"
          onClick={() => goToMonth(1)}
          disabled={!canGoForward}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="heatmap-weekdays">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <span key={`${initial}-${index}`}>{initial}</span>
        ))}
      </div>

      <div className={`heatmap-grid${loading ? ' is-loading' : ''}`}>
        {buildMonthGrid(monthKey).flat().map((cell, index) => {
          if (!cell) return <span key={`pad-${index}`} className="heatmap-cell heatmap-cell--pad" />;
          return (
            <DayCell
              key={cell.dateKey}
              cell={cell}
              ratings={days[cell.dateKey]}
              isToday={cell.dateKey === todayKey}
              editable={isEditable(cell.dateKey, todayKey, days[cell.dateKey], user)}
              isOpen={openDateKey === cell.dateKey}
              onOpen={() => setOpenDateKey(openDateKey === cell.dateKey ? null : cell.dateKey)}
            />
          );
        })}
      </div>

      {openDateKey && (
        <DayEditor
          dateKey={openDateKey}
          ratings={days[openDateKey]}
          user={user}
          otherName={otherName}
          onPick={(rating) => saveRating(openDateKey, rating)}
          onClear={() => clearRating(openDateKey)}
          onClose={() => setOpenDateKey(null)}
        />
      )}

      {error && <p className="heatmap-error">{error}</p>}

      <div className="heatmap-legend">
        {RATINGS.map((rating) => (
          <span key={rating} className="heatmap-legend-item">
            <span className="heatmap-swatch" style={{ background: RATING_COLORS[rating] }} />
            {rating} {RATING_LABELS[rating]}
          </span>
        ))}
      </div>

      <p className="heatmap-note">
        A day fills in once you've both submitted its check-in. Tap an earlier day to fill in your own half by
        hand if you missed it.
      </p>
    </section>
  );
}

function DayCell({ cell, ratings, isToday, editable, isOpen, onOpen }) {
  const principe = ratings?.Principe?.rating;
  const principessa = ratings?.Principessa?.rating;
  const isEmpty = !principe && !principessa;

  // The diagonal split is a gradient rather than an SVG: two hard colour stops
  // meeting corner to corner, with a hairline of transparency between them.
  const style = {
    '--rating-a': principe ? RATING_COLORS[principe] : 'transparent',
    '--rating-b': principessa ? RATING_COLORS[principessa] : 'transparent',
  };

  const title = [
    formatDate(parseDateKey(cell.dateKey)),
    `Principe ${principe ? `${principe} ${RATING_LABELS[principe]}` : '—'}`,
    `Principessa ${principessa ? `${principessa} ${RATING_LABELS[principessa]}` : '—'}`,
  ].join(' · ');

  const className = [
    'heatmap-cell',
    isEmpty ? 'heatmap-cell--empty' : '',
    isToday ? 'is-today' : '',
    editable ? 'is-editable' : '',
    isOpen ? 'is-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!editable) {
    return (
      <span className={className} style={style} title={title}>
        <span className="heatmap-day-number">{cell.day}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      title={title}
      aria-label={`Set your rating for ${formatDate(parseDateKey(cell.dateKey))}`}
      onClick={onOpen}
    >
      <span className="heatmap-day-number">{cell.day}</span>
    </button>
  );
}

function DayEditor({ dateKey, ratings, user, otherName, onPick, onClear, onClose }) {
  const mine = ratings?.[user]?.rating;
  const theirs = ratings?.[otherName]?.rating;

  return (
    <div className="heatmap-editor">
      <div className="heatmap-editor-head">
        <span className="heatmap-editor-date">{formatDate(parseDateKey(dateKey))}</span>
        <button type="button" className="heatmap-editor-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <p className="heatmap-editor-label">Your rating</p>
      <div className="heatmap-editor-pills">
        {RATINGS.map((rating) => (
          <button
            key={rating}
            type="button"
            className={`heatmap-editor-pill${mine === rating ? ' is-selected' : ''}`}
            style={{ background: RATING_COLORS[rating] }}
            onClick={() => onPick(rating)}
          >
            {rating}
            <span>{RATING_LABELS[rating]}</span>
          </button>
        ))}
      </div>

      <p className="heatmap-editor-other">
        {otherName}: {theirs ? `${theirs} — ${RATING_LABELS[theirs]}` : 'not set yet'}
      </p>

      {mine && (
        <button type="button" className="heatmap-editor-clear" onClick={onClear}>
          Clear my rating
        </button>
      )}
    </div>
  );
}
