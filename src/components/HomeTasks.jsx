import { useState } from 'react';
import {
  TICKET_STATUS,
  TICKET_SCOPE,
  TASK_CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
} from '../lib/tickets.js';
import {
  taskXpForPriority,
  countPersonalSolvedToday,
  tierFor,
  nextTier,
  TASK_FACTOR,
  TASK_FACTOR_GAIN,
} from '../lib/ticketTiers.js';
import { awardGrowth, unawardGrowth } from '../lib/growth.js';
import '../pages/TicketsPage.css';
import './HomeTasks.css';

// Our own to-do list, living right under the greeting on the Home page. It's
// backed by personal-scope tickets (same store as the Tickets page's
// love-tickets, just scope: 'personal'), so a task is one private ticket with
// no reply/confirm handshake — added here, closed here, in one tap.

function formatDate(iso) {
  if (!iso) return 'recently';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'recently';
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

function sortByUpdated(list) {
  return [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

// Just the "P2" tag for the collapsed row — the full "P2 - high priority"
// string is too wide for the summary on a phone.
function priorityTag(priority) {
  return String(priority || '').trim().slice(0, 2).toUpperCase() || 'P3';
}

export default function HomeTasks({ user, tickets, loading, error, createTicket, updateTicket, deleteTicket }) {
  const mine = tickets.filter((t) => t.scope === TICKET_SCOPE.PERSONAL && t.createdBy === user);
  const open = sortByUpdated(mine.filter((t) => t.status !== TICKET_STATUS.HANDLED));
  const done = sortByUpdated(mine.filter((t) => t.status === TICKET_STATUS.HANDLED));
  const solvedToday = countPersonalSolvedToday(tickets, user);

  return (
    <section className="home-tasks" aria-label="Our tasks">
      <div className="home-tasks-header">
        <div>
          <h2>Le nostre task</h2>
          <p>Tasks we set for ourselves — private, no Discord, one tap to close.</p>
        </div>
        <SolvedTodayPill count={solvedToday} />
      </div>

      {error && <p className="tickets-error">{error}</p>}

      <AddTaskForm user={user} onCreate={createTicket} />

      {loading ? (
        <p className="tickets-note">Loading…</p>
      ) : (
        <>
          <TaskGroup title="To do" count={open.length} emptyMessage="Nothing on the list. Add one above.">
            {open.map((ticket) => (
              <TaskCard key={ticket.id} ticket={ticket} user={user} onUpdate={updateTicket} onDelete={deleteTicket} />
            ))}
          </TaskGroup>

          <TaskGroup title="Done" count={done.length} emptyMessage="Nothing done yet." collapsed>
            {done.map((ticket) => (
              <TaskCard key={ticket.id} ticket={ticket} user={user} onUpdate={updateTicket} onDelete={deleteTicket} solved />
            ))}
          </TaskGroup>
        </>
      )}
    </section>
  );
}

// Keeps the old daily "solved for yourself" tier streak from the Tickets
// page — it belongs with the tasks now that they live here.
function SolvedTodayPill({ count }) {
  const tier = tierFor(count);
  const next = nextTier(count);
  return (
    <div className="home-tasks-streak">
      <span className="home-tasks-streak-count">{count}</span>
      <span className="home-tasks-streak-label">
        done today{tier.emoji ? ` · ${tier.emoji} ${tier.label}` : ''}
      </span>
      {next && (
        <span className="home-tasks-streak-next">
          {next.min - count} to {next.label.toLowerCase()}
        </span>
      )}
    </div>
  );
}

function TaskGroup({ title, count, emptyMessage, collapsed, children }) {
  const hasItems = Array.isArray(children) && children.length > 0;
  const body = hasItems ? (
    <div className="tickets-list">{children}</div>
  ) : (
    <p className="tickets-empty">{emptyMessage}</p>
  );

  if (collapsed) {
    return (
      <details className="tickets-section home-tasks-group">
        <summary className="tickets-section-header home-tasks-group-summary">
          <div>
            <h2>{title}</h2>
          </div>
          <span className="tickets-count-pill">{count}</span>
        </summary>
        {body}
      </details>
    );
  }

  return (
    <div className="tickets-section">
      <div className="tickets-section-header">
        <div>
          <h2>{title}</h2>
        </div>
        <span className="tickets-count-pill">{count}</span>
      </div>
      {body}
    </div>
  );
}

function TaskCard({ ticket, user, onUpdate, onDelete, solved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const xp = taskXpForPriority(ticket.priority);

  // XP is credited on solve and reversed on reopen with the same numbers, so
  // toggling a task back and forth nets zero (see growthModel.applyAward).
  // scope: 'personal' routes it to this person's own pot, like the old
  // personal daily tasks did.
  const award = { xp, factor: TASK_FACTOR, factorGain: TASK_FACTOR_GAIN, scope: 'personal', user };

  async function run(action, effect) {
    setBusy(true);
    setError(null);
    try {
      await onUpdate(ticket.id, { actor: user, action });
      effect().catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this task?')) return;
    try {
      await onDelete(ticket.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <details className="ticket-card ticket-card--collapsible ticket-card--personal">
      <summary className="ticket-summary home-tasks-summary">
        <span className="ticket-summary-title">{ticket.title}</span>
        <span className="ticket-summary-right">
          <span className="tickets-chip">{ticket.category}</span>
          <span className="tickets-status-pill">{priorityTag(ticket.priority)}</span>
          <span className="ticket-summary-chevron" aria-hidden="true">
            ▾
          </span>
        </span>
      </summary>
      <div className="ticket-details-content">
        {ticket.message && ticket.message !== ticket.title && (
          <div className="ticket-body">
            <strong>Notes</strong>
            <p>{ticket.message}</p>
          </div>
        )}

        <div className="ticket-chip-row">
          <span className="tickets-chip">{ticket.priority}</span>
          <span className="tickets-chip">♥ {xp} XP{solved ? ' · earned' : ''}</span>
        </div>

        {solved && <p className="tickets-hint">Done {formatDate(ticket.confirmedAt)}.</p>}
        {error && <p className="tickets-error">{error}</p>}

        <div className="ticket-actions">
          {solved ? (
            <button
              type="button"
              className="tickets-btn tickets-btn--ghost"
              onClick={() => run('reopen_personal_ticket', () => unawardGrowth(award))}
              disabled={busy}
            >
              Reopen
            </button>
          ) : (
            <button
              type="button"
              className="tickets-btn tickets-btn--personal"
              onClick={() => run('solve_personal_ticket', () => awardGrowth(award))}
              disabled={busy}
            >
              Mark done ✅
            </button>
          )}
          <button type="button" className="tickets-btn tickets-btn--ghost" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}

const INITIAL_FORM = {
  title: '',
  category: TASK_CATEGORY_OPTIONS[0],
  priority: PRIORITY_OPTIONS[2],
  message: '',
};

function AddTaskForm({ user, onCreate }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.title.trim()) {
      setError('Give the task a title.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        ...form,
        title: form.title.trim(),
        // The store needs a non-empty message; fall back to the title so a
        // quick "just a name" task still saves.
        message: form.message.trim() || form.title.trim(),
        need: '',
        replyStyle: '',
        createdBy: user,
        scope: TICKET_SCOPE.PERSONAL,
      });
      setForm(INITIAL_FORM);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="tickets-create-section">
      <button
        type="button"
        className="tickets-open-btn tickets-open-btn--personal"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span>＋ Add a task</span>
        <span className={`tickets-open-btn-chevron${open ? ' is-open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>
      <div className={`tickets-form-collapse${open ? ' is-open' : ''}`}>
        <div className="tickets-form-collapse-inner">
          <form className="tickets-form tickets-form--personal" onSubmit={handleSubmit}>
            <label>
              Task
              <input
                type="text"
                className="tickets-input"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="What needs doing?"
              />
            </label>

            <div className="tickets-form-row">
              <label>
                Category
                <select
                  className="tickets-select"
                  value={form.category}
                  onChange={(e) => setField('category', e.target.value)}
                >
                  {TASK_CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  className="tickets-select"
                  value={form.priority}
                  onChange={(e) => setField('priority', e.target.value)}
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Notes <span className="tickets-hint">optional</span>
              <textarea
                className="tickets-textarea"
                value={form.message}
                onChange={(e) => setField('message', e.target.value)}
                placeholder="Any detail you'll want later."
                rows={2}
              />
            </label>

            {error && <p className="tickets-error">{error}</p>}

            <button
              type="submit"
              className="tickets-submit-btn tickets-submit-btn--personal"
              disabled={submitting}
            >
              {submitting ? 'Adding…' : 'Add task 📝'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
