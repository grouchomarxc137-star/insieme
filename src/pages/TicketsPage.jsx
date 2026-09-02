import { useState } from 'react';
import { useTickets } from '../hooks/useTickets.js';
import {
  TICKET_STATUS,
  OPEN_STATUSES,
  TICKET_SCOPE,
  CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
  REPLY_STYLE_OPTIONS,
  CUSTOM_REPLY_STYLE,
  otherAccount,
  ticketHasReplyStyle,
  isPersonalTicket,
} from '../lib/tickets.js';
import { countSharedSolvedToday, tierFor, nextTier } from '../lib/ticketTiers.js';
import './TicketsPage.css';

function formatDate(iso) {
  if (!iso) return 'Unknown date';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sortByUpdated(list) {
  return [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export default function TicketsPage({ user }) {
  const otherName = otherAccount(user);
  const { tickets, loading, error, createTicket, updateTicket, deleteTicket } = useTickets(user);

  // Personal-scope tickets are our own to-do list now — they live on the
  // Home page (see HomeTasks). This page is only the shared love-ticket
  // workflow between the two of us.
  const shared = tickets.filter((t) => !isPersonalTicket(t));

  const incoming = shared.filter((t) => t.createdBy === otherName);
  const sent = shared.filter((t) => t.createdBy === user);

  const openTickets = sortByUpdated(incoming.filter((t) => OPEN_STATUSES.includes(t.status)));
  const waitingOnThemTickets = sortByUpdated(incoming.filter((t) => t.status === TICKET_STATUS.AWAITING));
  const readyToCloseTickets = sortByUpdated(incoming.filter((t) => t.status === TICKET_STATUS.VALIDATED));
  const handledTickets = sortByUpdated(incoming.filter((t) => t.status === TICKET_STATUS.HANDLED));

  const awaitingYourConfirmationTickets = sortByUpdated(sent.filter((t) => t.status === TICKET_STATUS.AWAITING));
  const sentTickets = sortByUpdated(sent.filter((t) => t.status !== TICKET_STATUS.AWAITING));

  return (
    <div className="page">
      <div className="page-header">
        <h1>Tickets</h1>
        <p>A safe place to raise energy discrepancies and track them until they're resolved.</p>
      </div>

      {!loading && <TicketsCounters tickets={tickets} user={user} otherName={otherName} />}

      {error && <p className="tickets-error">{error}</p>}
      {loading ? (
        <p className="tickets-note">Loading…</p>
      ) : (
        <>
          <section className="tickets-scope-section tickets-scope-section--shared">
            <div className="tickets-scope-header">
              <h2 className="tickets-scope-title">🎫 Shared tickets</h2>
              <p className="tickets-scope-subtitle">Between you and {otherName} — posts to Discord.</p>
            </div>

            <CreateTicketSection user={user} otherName={otherName} onCreate={createTicket} />

            <TicketSection
              title="For you"
              subtitle={`Tickets from ${otherName} that need your reply.`}
              count={openTickets.length}
              emptyMessage={`New tickets from ${otherName} will appear here.`}
            >
              {openTickets.map((ticket) => (
                <OpenTicketCard key={ticket.id} ticket={ticket} user={user} onUpdate={updateTicket} onDelete={deleteTicket} />
              ))}
            </TicketSection>

            <TicketSection
              title="Awaiting your confirmation"
              subtitle={`${otherName} replied to your ticket — confirm it actually solved it.`}
              count={awaitingYourConfirmationTickets.length}
              emptyMessage="Nothing waiting for your confirmation."
            >
              {awaitingYourConfirmationTickets.map((ticket) => (
                <ValidateTicketCard key={ticket.id} ticket={ticket} user={user} onUpdate={updateTicket} onDelete={deleteTicket} />
              ))}
            </TicketSection>

            <TicketSection
              title="Ready to close"
              subtitle={`${otherName} confirmed your reply solved it — close it out.`}
              count={readyToCloseTickets.length}
              emptyMessage="Nothing ready to close."
            >
              {readyToCloseTickets.map((ticket) => (
                <CloseTicketCard key={ticket.id} ticket={ticket} user={user} onUpdate={updateTicket} onDelete={deleteTicket} />
              ))}
            </TicketSection>

            <TicketSection
              title="Waiting for confirmation"
              subtitle={`You replied — it's on ${otherName} to confirm it's solved.`}
              count={waitingOnThemTickets.length}
              emptyMessage="Nothing waiting on their confirmation."
            >
              {waitingOnThemTickets.map((ticket) => (
                <WaitingOnThemCard key={ticket.id} ticket={ticket} otherName={otherName} onDelete={deleteTicket} />
              ))}
            </TicketSection>

            <TicketSection title="Handled" subtitle="Closed tickets, folded away." count={handledTickets.length} emptyMessage="No handled tickets yet.">
              {handledTickets.map((ticket) => (
                <HandledTicketCard key={ticket.id} ticket={ticket} onDelete={deleteTicket} />
              ))}
            </TicketSection>

            <TicketSection
              title="Sent by you"
              subtitle={`Track the status of what you've sent to ${otherName}.`}
              count={sentTickets.length}
              emptyMessage="Tickets you send will show up here."
            >
              {sentTickets.map((ticket) => (
                <SentTicketCard key={ticket.id} ticket={ticket} />
              ))}
            </TicketSection>
          </section>
        </>
      )}
    </div>
  );
}

// "Solved today" tally for the shared workflow — a ticket counts once its
// creator validates the other person's reply. The matching "solved for
// yourself" streak moved to the Home tasks block with the personal tickets;
// see src/lib/ticketTiers.js for the counting/tier rules.
function TicketsCounters({ tickets, user, otherName }) {
  const sharedCount = countSharedSolvedToday(tickets, user);
  return (
    <div className="tickets-counters tickets-counters--single">
      <TicketCounterCard label={`Solved with ${otherName} today`} count={sharedCount} accent="shared" />
    </div>
  );
}

function TicketCounterCard({ label, count, accent }) {
  const tier = tierFor(count);
  const next = nextTier(count);
  const progress = next ? Math.round(((count - tier.min) / (next.min - tier.min)) * 100) : 100;
  return (
    <div className={`tickets-counter-card tickets-counter-card--${accent}`}>
      <p className="tickets-counter-label">{label}</p>
      <div className="tickets-counter-count">{count}</div>
      {tier.label !== 'Start solving' && (
        <div className="tickets-counter-badge">
          {tier.emoji} {tier.label}
        </div>
      )}
      <div className="tickets-counter-bar">
        <div className="tickets-counter-bar-fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="tickets-counter-next">{next ? `${next.min - count} to ${next.label.toLowerCase()}` : 'Top tier reached'}</p>
    </div>
  );
}

function TicketSection({ title, subtitle, count, emptyMessage, children }) {
  const hasItems = Array.isArray(children) && children.length > 0;
  return (
    <div className="tickets-section">
      <div className="tickets-section-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="tickets-count-pill">{count}</span>
      </div>
      {hasItems ? <div className="tickets-list">{children}</div> : <p className="tickets-empty">{emptyMessage}</p>}
    </div>
  );
}

const INITIAL_FORM_STATE = {
  title: '',
  category: '',
  priority: PRIORITY_OPTIONS[0],
  replyStyle: '',
  customReplyStyle: '',
  message: '',
  need: '',
};

// The create form starts collapsed behind a button — better visibility of
// what's underneath (the ticket lists) and one clear ergonomic entry point
// to open it, instead of a form that's always sprawled open at the top.
function CreateTicketSection({ user, otherName, onCreate }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="tickets-create-section">
      <button
        type="button"
        className="tickets-open-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span>💛 Open a ticket</span>
        <span className={`tickets-open-btn-chevron${open ? ' is-open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>
      <div className={`tickets-form-collapse${open ? ' is-open' : ''}`}>
        <div className="tickets-form-collapse-inner">
          <TicketForm user={user} otherName={otherName} onCreate={onCreate} />
        </div>
      </div>
    </div>
  );
}

function TicketForm({ user, otherName, onCreate }) {
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const isTask = form.category === 'Task';

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      setError('Give it a title and describe what happened.');
      return;
    }
    if (!form.category) {
      setError('Choose a category.');
      return;
    }
    if (!form.replyStyle) {
      setError('Choose a preferred reply style (or None).');
      return;
    }
    if (form.replyStyle === CUSTOM_REPLY_STYLE && !form.customReplyStyle.trim()) {
      setError('Type your preferred reply style.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const replyStyle = form.replyStyle === CUSTOM_REPLY_STYLE ? form.customReplyStyle.trim() : form.replyStyle;
      const { customReplyStyle, ...rest } = form;
      const ticket = await onCreate({ ...rest, replyStyle, createdBy: user, scope: TICKET_SCOPE.SHARED });
      setForm(INITIAL_FORM_STATE);
      setSuccess(`Ticket #${ticket.id} sent to ${otherName}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="tickets-form" onSubmit={handleSubmit}>
      <h2>Ticket details</h2>
      <p className="tickets-form-intro">
        Explain what happened, how you feel, and what kind of response or support you need.
      </p>

      <label>
        Ticket title
        <input
          type="text"
          className="tickets-input"
          value={form.title}
          onChange={(e) => setField('title', e.target.value)}
          placeholder="A short summary"
        />
      </label>

      <div className="tickets-form-row">
        <label>
          Category
          <select className="tickets-select" value={form.category} onChange={(e) => setField('category', e.target.value)}>
            <option value="" disabled>
              Select a category
            </option>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select className="tickets-select" value={form.priority} onChange={(e) => setField('priority', e.target.value)}>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Preferred reply style
        <select className="tickets-select" value={form.replyStyle} onChange={(e) => setField('replyStyle', e.target.value)}>
          <option value="" disabled>
            Select a reply style
          </option>
          {REPLY_STYLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={CUSTOM_REPLY_STYLE}>{CUSTOM_REPLY_STYLE}</option>
        </select>
      </label>

      {form.replyStyle === CUSTOM_REPLY_STYLE && (
        <label>
          Your own reply style
          <input
            type="text"
            className="tickets-input"
            value={form.customReplyStyle}
            onChange={(e) => setField('customReplyStyle', e.target.value)}
            placeholder="e.g. Straightforward but gentle"
          />
        </label>
      )}

      <label>
        What happened?
        <textarea
          className="tickets-textarea"
          value={form.message}
          onChange={(e) => setField('message', e.target.value)}
          placeholder={
            isTask ? "Describe the task — what needs to get done." : 'Dump the feeling here. No need to organize it perfectly.'
          }
          rows={3}
        />
      </label>

      <label>
        What do you need from {otherName}?
        <textarea
          className="tickets-textarea"
          value={form.need}
          onChange={(e) => setField('need', e.target.value)}
          placeholder={
            isTask
              ? 'What does done look like, and by when?'
              : 'Advice, reassurance, apology, attention, comfort, explanation…'
          }
          rows={2}
        />
      </label>

      {error && <p className="tickets-error">{error}</p>}
      {success && <p className="tickets-success">{success}</p>}

      <button type="submit" className="tickets-submit-btn" disabled={submitting}>
        {submitting ? 'Sending…' : isTask ? 'Submit ticket' : 'Submit love ticket 💛'}
      </button>
    </form>
  );
}

function TicketMeta({ ticket }) {
  return (
    <div className="ticket-meta">
      #{ticket.id} · {ticket.category} · {ticket.priority} · {formatDate(ticket.createdAt)}
    </div>
  );
}

// Minimized appearance shared by every ticket card: just the title and the
// status, as a native <details> summary so the browser handles the
// expand/collapse state for us (and keeps it stable across re-renders since
// the ticket's key doesn't change).
function TicketSummary({ ticket, status }) {
  return (
    <summary className="ticket-summary">
      <span className="ticket-summary-title">{ticket.title}</span>
      <span className="ticket-summary-right">
        <span className="tickets-status-pill">{status || ticket.status}</span>
        <span className="ticket-summary-chevron" aria-hidden="true">
          ▾
        </span>
      </span>
    </summary>
  );
}

function TicketBody({ ticket }) {
  return (
    <>
      {ticketHasReplyStyle(ticket) && (
        <div className="ticket-chip-row">
          <span className="tickets-chip">💌 {ticket.replyStyle}</span>
        </div>
      )}
      <div className="ticket-body">
        <strong>What happened:</strong>
        <p>{ticket.message}</p>
      </div>
      <div className="ticket-body">
        <strong>What they need:</strong>
        <p>{ticket.need || 'Not specified'}</p>
      </div>
    </>
  );
}

function OpenTicketCard({ ticket, user, onUpdate, onDelete }) {
  const [reply, setReply] = useState(ticket.reply || '');
  const [status, setStatus] = useState(ticket.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleStatusChange(nextStatus) {
    setStatus(nextStatus);
    try {
      await onUpdate(ticket.id, { actor: user, action: 'update_status', status: nextStatus });
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveReply() {
    if (!reply.trim()) {
      setError('Write a reply before saving.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onUpdate(ticket.id, { actor: user, action: 'reply_ticket', reply });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this love ticket?')) return;
    try {
      await onDelete(ticket.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <details className="ticket-card ticket-card--collapsible">
      <TicketSummary ticket={ticket} status={status} />
      <div className="ticket-details-content">
        <TicketMeta ticket={ticket} />

        <label className="ticket-reply-label">
          Status
          <select
            className="tickets-select tickets-status-select"
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            {OPEN_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <TicketBody ticket={ticket} />

        <label className="ticket-reply-label">
          Your reply
          <textarea
            className="tickets-textarea"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write something soft, honest, funny, or reassuring…"
            rows={3}
          />
          <span className="tickets-hint">Saving locks it in and asks them to confirm it's solved.</span>
        </label>

        {error && <p className="tickets-error">{error}</p>}

        <div className="ticket-actions">
          <button type="button" className="tickets-btn tickets-btn--primary" onClick={saveReply} disabled={busy}>
            Save reply
          </button>
          <button type="button" className="tickets-btn tickets-btn--ghost" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}

// Shown to the ticket's creator once the other person has replied — the
// creator is the only one who can confirm it actually solved the issue.
function ValidateTicketCard({ ticket, user, onUpdate, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function validate() {
    setBusy(true);
    setError(null);
    try {
      await onUpdate(ticket.id, { actor: user, action: 'validate_ticket' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!window.confirm("Send this back — the reply didn't fully solve it?")) return;
    setBusy(true);
    setError(null);
    try {
      await onUpdate(ticket.id, { actor: user, action: 'reopen_ticket' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this love ticket?')) return;
    try {
      await onDelete(ticket.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <details className="ticket-card ticket-card--collapsible">
      <TicketSummary ticket={ticket} />
      <div className="ticket-details-content">
        <TicketMeta ticket={ticket} />

        <TicketBody ticket={ticket} />

        <div className="ticket-locked-reply">
          <strong>Their reply</strong>
          <p>{ticket.reply || 'No reply text saved.'}</p>
        </div>
        <p className="tickets-hint">Replied {formatDate(ticket.repliedAt)}. Did this actually solve it?</p>

        {error && <p className="tickets-error">{error}</p>}

        <div className="ticket-actions">
          <button type="button" className="tickets-btn tickets-btn--primary" onClick={validate} disabled={busy}>
            Confirm solved 🌟
          </button>
          <button type="button" className="tickets-btn tickets-btn--ghost" onClick={reopen} disabled={busy}>
            Needs more work 🔁
          </button>
          <button type="button" className="tickets-btn tickets-btn--ghost" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}

// Shown to the replier once the creator has validated the reply — closing is
// the replier's final step, separate from the creator's validation.
function CloseTicketCard({ ticket, user, onUpdate, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function close() {
    if (!window.confirm('Close this ticket?')) return;
    setBusy(true);
    setError(null);
    try {
      await onUpdate(ticket.id, { actor: user, action: 'close_ticket' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this love ticket?')) return;
    try {
      await onDelete(ticket.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <details className="ticket-card ticket-card--collapsible">
      <TicketSummary ticket={ticket} />
      <div className="ticket-details-content">
        <TicketMeta ticket={ticket} />

        <TicketBody ticket={ticket} />

        <div className="ticket-locked-reply">
          <strong>Your locked reply</strong>
          <p>{ticket.reply || 'No reply text saved.'}</p>
        </div>
        <p className="tickets-hint">Confirmed solved {formatDate(ticket.validatedAt)}. Close it out.</p>

        {error && <p className="tickets-error">{error}</p>}

        <div className="ticket-actions">
          <button type="button" className="tickets-btn tickets-btn--primary" onClick={close} disabled={busy}>
            Close ticket ✅
          </button>
          <button type="button" className="tickets-btn tickets-btn--ghost" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}

// Read-only: I already replied, now it's on the ticket's creator to confirm
// it's solved (or send it back).
function WaitingOnThemCard({ ticket, otherName, onDelete }) {
  const [error, setError] = useState(null);

  async function handleDelete() {
    if (!window.confirm('Delete this love ticket?')) return;
    try {
      await onDelete(ticket.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <details className="ticket-card ticket-card--collapsible">
      <TicketSummary ticket={ticket} />
      <div className="ticket-details-content">
        <TicketMeta ticket={ticket} />

        <div className="ticket-locked-reply">
          <strong>Your locked reply</strong>
          <p>{ticket.reply || 'No reply text saved.'}</p>
        </div>
        <p className="tickets-hint">Replied {formatDate(ticket.repliedAt)}. Waiting on {otherName} to confirm it's solved.</p>

        {error && <p className="tickets-error">{error}</p>}

        <div className="ticket-actions">
          <button type="button" className="tickets-btn tickets-btn--ghost" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}

function HandledTicketCard({ ticket, onDelete }) {
  const [error, setError] = useState(null);

  async function handleDelete() {
    if (!window.confirm('Delete this love ticket?')) return;
    try {
      await onDelete(ticket.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <details className="ticket-card ticket-card--collapsible ticket-card--handled">
      <TicketSummary ticket={ticket} />
      <div className="ticket-details-content">
        <TicketMeta ticket={ticket} />

        <TicketBody ticket={ticket} />
        <div className="ticket-locked-reply">
          <strong>Reply</strong>
          <p>{ticket.reply || 'No reply text saved.'}</p>
        </div>
        <p className="tickets-hint">Closed {formatDate(ticket.confirmedAt)}.</p>
        {error && <p className="tickets-error">{error}</p>}
        <div className="ticket-actions">
          <button type="button" className="tickets-btn tickets-btn--ghost" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>
    </details>
  );
}

function SentTicketCard({ ticket }) {
  return (
    <details className="ticket-card ticket-card--collapsible ticket-card--sent">
      <TicketSummary ticket={ticket} />
      <div className="ticket-details-content">
        <TicketMeta ticket={ticket} />
        {ticket.reply ? (
          <div className="ticket-locked-reply">
            <strong>Their reply</strong>
            <p>{ticket.reply}</p>
          </div>
        ) : (
          <p className="tickets-hint">No reply yet.</p>
        )}
      </div>
    </details>
  );
}
