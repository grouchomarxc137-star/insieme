import { useEffect, useMemo, useRef, useState } from 'react';
import { useTickets } from '../hooks/useTickets.js';
import { useLiveNow } from '../hooks/useLiveNow.js';
import { TICKET_STATUS, TICKET_SCOPE, priorityTag, sortByPriority } from '../lib/tickets.js';
import { taskXpForPriority, TASK_FACTOR, TASK_FACTOR_GAIN } from '../lib/ticketTiers.js';
import { awardGrowth } from '../lib/growth.js';
import {
  dayKey,
  addDays,
  relativeDayLabel,
  formatDayLabel,
  formatClock,
  formatDuration,
  makeSlot,
  slotDay,
  slotMinutes,
  clampSlotMinutes,
  minutesNow,
  DAY_START_HOUR,
  DAY_END_HOUR,
  GRID_START_MIN,
  GRID_END_MIN,
  GRID_HEIGHT_PX,
  PX_PER_MIN,
  DURATION_OPTIONS,
} from '../lib/schedule.js';
import './CalendarPage.css';

// The Calendar page: the day's grid on the right, everything marked for that
// day but not yet placed on the left. Dragging a task from the rail onto the
// grid is the only way a task gets a time — there's deliberately no time
// picker, because the point of the page is seeing whether the day you're
// planning actually fits into the hours you have.
//
// Dragging is done with pointer events rather than HTML5 drag-and-drop: the
// latter simply doesn't fire on touch, and this app is used from phones as
// much as from a desk. The cost is that .cal-chip / .cal-block set
// `touch-action: none` so a drag isn't stolen by the page scroll.

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i);

// Side-by-side layout for blocks that overlap in time, the way a real
// calendar does it: group them into clusters of mutually-overlapping blocks,
// then hand each block the narrowest lane that's free when it starts. A block
// with no neighbours ends up alone in a one-lane cluster and spans the full
// width, so the common case costs nothing.
function layoutBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const laid = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  function flush() {
    const laneEnds = [];
    cluster.forEach((item) => {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.end);
      } else {
        laneEnds[lane] = item.end;
      }
      item.lane = lane;
    });
    cluster.forEach((item) => laid.push({ ...item, lanes: laneEnds.length }));
    cluster = [];
    clusterEnd = -Infinity;
  }

  sorted.forEach((item) => {
    if (cluster.length && item.start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  });
  if (cluster.length) flush();
  return laid;
}

function inside(rect, x, y) {
  return Boolean(rect) && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export default function CalendarPage({ user }) {
  const { tickets, loading, error, updateTicket } = useTickets(user);
  // A minute is plenty for a "now" line and the today/tomorrow labels —
  // the default 1s tick would re-render the whole grid sixty times a minute
  // for a line that moves less than a pixel.
  const now = useLiveNow(60000);
  const today = dayKey(now);
  const [day, setDay] = useState(today);
  const [drag, setDrag] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const gridRef = useRef(null);
  const railRef = useRef(null);
  // Pointer handlers live on window for the duration of a drag, so they read
  // the live drag through a ref instead of closing over a stale copy.
  const dragRef = useRef(null);
  dragRef.current = drag;

  const mine = useMemo(
    () =>
      tickets.filter(
        (t) => t.scope === TICKET_SCOPE.PERSONAL && t.createdBy === user && t.status !== TICKET_STATUS.HANDLED
      ),
    [tickets, user]
  );

  const railTasks = sortByPriority(mine.filter((t) => t.plannedDay === day && !t.scheduledAt));
  const scheduled = mine.filter((t) => slotDay(t.scheduledAt) === day);
  // Everything still open that isn't spoken for on any day — the pool you
  // pull from when the rail is emptier than the day actually is.
  const unplanned = sortByPriority(mine.filter((t) => !t.plannedDay && !t.scheduledAt));

  const railMinutes = railTasks.reduce((sum, t) => sum + t.durationMin, 0);
  const bookedMinutes = scheduled.reduce((sum, t) => sum + t.durationMin, 0);

  const blocks = layoutBlocks(
    scheduled.map((task) => {
      const start = slotMinutes(task.scheduledAt);
      return { task, start, end: start + task.durationMin };
    })
  );

  async function run(id, patch, after) {
    setBusyId(id);
    setActionError(null);
    try {
      await updateTicket(id, { actor: user, ...patch });
      if (after) after().catch(() => {});
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function beginDrag(event, task, origin) {
    // Let the controls inside a card do their own job — a duration select or
    // a delete button shouldn't pick the card up.
    if (event.target.closest('button, select, input, a')) return;
    if (event.button !== undefined && event.button > 0) return;
    event.preventDefault();
    // Grabbing a placed block mid-way down shouldn't teleport it so its top
    // is under your finger; a chip from the rail has no meaningful top yet,
    // so it just lands where you point.
    const grabOffset =
      origin === 'grid' ? event.clientY - event.currentTarget.getBoundingClientRect().top : 0;
    setDrag({
      id: task.id,
      title: task.title,
      priority: task.priority,
      durationMin: task.durationMin,
      origin,
      grabOffset,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      minutes: null,
      moved: false,
    });
  }

  useEffect(() => {
    if (!drag) return undefined;

    function minutesAt(clientY, grabOffset) {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return clampSlotMinutes(GRID_START_MIN + (clientY - rect.top - grabOffset) / PX_PER_MIN);
    }

    function handleMove(event) {
      const current = dragRef.current;
      if (!current) return;
      const overGrid = inside(gridRef.current?.getBoundingClientRect(), event.clientX, event.clientY);
      setDrag({
        ...current,
        x: event.clientX,
        y: event.clientY,
        minutes: overGrid ? minutesAt(event.clientY, current.grabOffset) : null,
        moved:
          current.moved ||
          Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 5,
      });
    }

    function handleUp(event) {
      const current = dragRef.current;
      setDrag(null);
      // A tap that never moved is just a tap — the card's own buttons handle
      // those, and re-saving an unchanged slot would only churn the list.
      if (!current || !current.moved) return;
      if (inside(gridRef.current?.getBoundingClientRect(), event.clientX, event.clientY)) {
        const minutes = minutesAt(event.clientY, current.grabOffset);
        if (minutes === null) return;
        run(current.id, {
          action: 'schedule_task',
          scheduledAt: makeSlot(day, minutes),
          durationMin: current.durationMin,
        });
      } else if (
        current.origin === 'grid' &&
        inside(railRef.current?.getBoundingClientRect(), event.clientX, event.clientY)
      ) {
        // Dragged back off the grid: it stays on the day's list, it just
        // doesn't have a time any more.
        run(current.id, { action: 'schedule_task', scheduledAt: null });
      }
    }

    function handleCancel() {
      setDrag(null);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
    // Registered once per drag: the handlers read live values off dragRef,
    // so re-binding them on every pointermove would be pure churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(drag), day]);

  const nowMinutes = minutesNow(now);
  const showNowLine = day === today && nowMinutes >= GRID_START_MIN && nowMinutes <= GRID_END_MIN;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Calendar</h1>
        <p>Drag what you marked for the day onto the hours you actually have.</p>
      </div>

      {error && <p className="tickets-error">{error}</p>}
      {actionError && <p className="tickets-error">{actionError}</p>}

      <div className="cal-layout">
        <aside className="cal-rail" ref={railRef}>
          <div className="cal-rail-header">
            <h2>{day === today ? 'For today' : `For ${relativeDayLabel(day, today).toLowerCase()}`}</h2>
            <span className="cal-total">{railMinutes ? formatDuration(railMinutes) : '—'}</span>
          </div>
          <p className="cal-rail-hint">
            {railTasks.length ? 'Drag onto the grid to give it a time.' : 'Nothing left to place.'}
          </p>

          {loading ? (
            <p className="tickets-note">Loading…</p>
          ) : railTasks.length ? (
            <div className="cal-chip-list">
              {railTasks.map((task) => (
                <RailChip
                  key={task.id}
                  task={task}
                  busy={busyId === task.id}
                  dragging={drag?.id === task.id && drag.moved}
                  onGrab={(event) => beginDrag(event, task, 'rail')}
                  onDuration={(minutes) => run(task.id, { action: 'set_duration', durationMin: minutes })}
                  onRemove={() => run(task.id, { action: 'plan_for_day', day: null })}
                />
              ))}
            </div>
          ) : (
            <p className="tickets-empty">Mark tasks for the day from Home, or pull one in below.</p>
          )}

          <details className="cal-pool">
            <summary>
              Other open tasks <span className="tickets-count-pill">{unplanned.length}</span>
            </summary>
            {unplanned.length ? (
              <div className="cal-pool-list">
                {unplanned.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="cal-pool-row"
                    disabled={busyId === task.id}
                    onClick={() => run(task.id, { action: 'plan_for_day', day })}
                  >
                    <span className="cal-pool-title">{task.title}</span>
                    <span className="cal-pool-add">＋</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="tickets-empty">Everything open is already on a day.</p>
            )}
          </details>
        </aside>

        <section className="cal-board">
          <div className="cal-board-header">
            <div className="cal-nav">
              <button type="button" className="cal-nav-btn" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
                ‹
              </button>
              <button type="button" className="cal-nav-today" onClick={() => setDay(today)} disabled={day === today}>
                Today
              </button>
              <button type="button" className="cal-nav-btn" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">
                ›
              </button>
            </div>
            <div className="cal-board-title">
              <h2>{relativeDayLabel(day, today)}</h2>
              <p>{formatDayLabel(day)}</p>
            </div>
            <span className="cal-total cal-total--booked">
              {bookedMinutes ? `${formatDuration(bookedMinutes)} booked` : 'Nothing booked'}
            </span>
          </div>

          <div className="cal-grid" ref={gridRef} style={{ height: `${GRID_HEIGHT_PX}px` }}>
            {HOURS.map((hour) => (
              <div key={hour} className="cal-hour" style={{ top: `${(hour * 60 - GRID_START_MIN) * PX_PER_MIN}px` }}>
                <span className="cal-hour-label">{formatClock(hour * 60)}</span>
              </div>
            ))}

            {showNowLine && (
              <div className="cal-now" style={{ top: `${(nowMinutes - GRID_START_MIN) * PX_PER_MIN}px` }} aria-hidden="true" />
            )}

            {drag?.moved && drag.minutes !== null && (
              <div
                className="cal-ghost-slot"
                style={{
                  top: `${(drag.minutes - GRID_START_MIN) * PX_PER_MIN}px`,
                  height: `${Math.max(20, drag.durationMin * PX_PER_MIN - 3)}px`,
                }}
              >
                {formatClock(drag.minutes)}
              </div>
            )}

            {blocks.map(({ task, start, lane, lanes }) => (
              <Block
                key={task.id}
                task={task}
                start={start}
                lane={lane}
                lanes={lanes}
                busy={busyId === task.id}
                dragging={drag?.id === task.id && drag.moved}
                onGrab={(event) => beginDrag(event, task, 'grid')}
                onUnschedule={() => run(task.id, { action: 'schedule_task', scheduledAt: null })}
                onDone={() =>
                  run(task.id, { action: 'solve_personal_ticket' }, () =>
                    awardGrowth({
                      xp: taskXpForPriority(task.priority),
                      factor: TASK_FACTOR,
                      factorGain: TASK_FACTOR_GAIN,
                      scope: 'personal',
                      user,
                    })
                  )
                }
              />
            ))}
          </div>
        </section>
      </div>

      {drag?.moved && (
        <div className="cal-drag-ghost" style={{ left: `${drag.x}px`, top: `${drag.y}px` }} aria-hidden="true">
          <span className="cal-chip-tag">{priorityTag(drag.priority)}</span>
          {drag.title}
        </div>
      )}
    </div>
  );
}

function RailChip({ task, busy, dragging, onGrab, onDuration, onRemove }) {
  return (
    <article
      className={`cal-chip${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
      onPointerDown={onGrab}
    >
      <div className="cal-chip-top">
        <span className="cal-chip-tag">{priorityTag(task.priority)}</span>
        <span className="cal-chip-title">{task.title}</span>
        <button type="button" className="cal-chip-remove" onClick={onRemove} aria-label={`Take "${task.title}" off the day`}>
          ×
        </button>
      </div>
      <div className="cal-chip-bottom">
        <span className="cal-chip-cat">{task.category}</span>
        <select
          className="cal-duration"
          value={task.durationMin}
          onChange={(event) => onDuration(Number(event.target.value))}
          aria-label={`Time estimate for "${task.title}"`}
        >
          {DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatDuration(minutes)}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function Block({ task, start, lane, lanes, busy, dragging, onGrab, onUnschedule, onDone }) {
  const height = Math.max(20, task.durationMin * PX_PER_MIN - 3);
  // Below about three quarters of an hour there's no room for the meta row
  // without it colliding with the title; the block keeps just its name.
  const short = task.durationMin < 45;

  return (
    <article
      className={`cal-block${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}${short ? ' is-short' : ''}`}
      style={{
        top: `${(start - GRID_START_MIN) * PX_PER_MIN}px`,
        height: `${height}px`,
        left: `calc(var(--cal-gutter) + (100% - var(--cal-gutter) - 6px) * ${lane / lanes})`,
        width: `calc((100% - var(--cal-gutter) - 6px) / ${lanes} - 3px)`,
      }}
      onPointerDown={onGrab}
    >
      <div className="cal-block-head">
        <span className="cal-block-title">{task.title}</span>
        <span className="cal-block-actions">
          <button type="button" className="cal-block-btn" onClick={onDone} aria-label={`Mark "${task.title}" done`}>
            ✓
          </button>
          <button
            type="button"
            className="cal-block-btn"
            onClick={onUnschedule}
            aria-label={`Take "${task.title}" off the grid`}
          >
            ×
          </button>
        </span>
      </div>
      {!short && (
        <span className="cal-block-meta">
          {formatClock(start)}–{formatClock(start + task.durationMin)} · {formatDuration(task.durationMin)}
        </span>
      )}
    </article>
  );
}
