import { useCallback, useEffect, useRef, useState } from 'react';
import { socket, emitAction } from '../lib/resetRoomSocket.js';
import { resetSessionUrl } from '../lib/resetRoomRoute.js';
import './ResetRoomSession.css';

const SESSION_STATUS = {
  SETUP: 'setup',
  ENTRY: 'entry',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const EMOTION_STATUS = {
  AWAITING_ACK: 'awaiting_ack',
  AWAITING_FEEDBACK: 'awaiting_feedback',
  AWAITING_REASSURANCE: 'awaiting_reassurance',
  AWAITING_SUFFICIENCY: 'awaiting_sufficiency',
  AWAITING_AGREEMENT: 'awaiting_agreement',
  STILL_OPEN: 'still_open',
};

const SUFFICIENCY = { SATISFIED: 'satisfied', PARTIAL: 'partial', NOT_NEEDED: 'not_needed' };
const SUFFICIENCY_LABEL = {
  satisfied: 'Just right',
  partial: 'Almost there',
  not_needed: 'Not quite it',
};
const ROLES = { INITIATOR: 'initiator', RESPONDER: 'responder' };

function storageKey(sessionId) {
  return `lovissimi-reset-${sessionId}`;
}

function readStoredCreds(sessionId) {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredCreds(sessionId, creds) {
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(creds));
  } catch {
    /* storage unavailable, session just won't persist across reloads */
  }
}

export default function ResetRoomSession({ sessionId }) {
  const [state, setState] = useState(null);
  const [role, setRole] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [presence, setPresence] = useState({ initiatorConnected: false, responderConnected: false });
  const [typingRole, setTypingRole] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [notFound, setNotFound] = useState(false);
  const typingTimeoutRef = useRef(null);
  const roleRef = useRef(null);

  const join = useCallback(
    async (chosenRole, name, tokenOverride) => {
      const stored = readStoredCreds(sessionId);
      const token = tokenOverride || stored?.token || null;
      setJoinError(null);
      try {
        const res = await emitAction('session:join', {
          sessionId,
          role: chosenRole || stored?.role || null,
          token,
          name,
        });
        writeStoredCreds(sessionId, { role: res.role, token: res.token });
        roleRef.current = res.role;
        setRole(res.role);
        // A Discord-triggered link carries the token in the URL — drop it
        // once we're in, so it doesn't linger in the address bar/history.
        if (window.location.search.includes('token=')) {
          const url = new URL(window.location.href);
          url.searchParams.delete('token');
          window.history.replaceState({}, '', url);
        }
      } catch (err) {
        setJoinError(err.message);
      }
    },
    [sessionId]
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reset-sessions/${sessionId}`).then((res) => {
      if (cancelled) return;
      if (res.status === 404) setNotFound(true);
    });

    const urlToken = new URLSearchParams(window.location.search).get('token');

    function onConnect() {
      setConnected(true);
      const stored = readStoredCreds(sessionId);
      if (stored?.token || roleRef.current) {
        join(roleRef.current);
      } else if (urlToken) {
        join(null, undefined, urlToken);
      }
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onState(payload) {
      setState(payload);
    }
    function onPresence(payload) {
      setPresence(payload);
    }
    function onTyping({ role: fromRole, isTyping }) {
      setTypingRole(isTyping ? fromRole : null);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTyping) typingTimeoutRef.current = setTimeout(() => setTypingRole(null), 4000);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('session:state', onState);
    socket.on('presence:update', onPresence);
    socket.on('presence:typing', onTyping);

    socket.connect();
    const stored = readStoredCreds(sessionId);
    if (stored?.role) {
      roleRef.current = stored.role;
      setRole(stored.role);
    }
    if (socket.connected) onConnect();

    return () => {
      cancelled = true;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('session:state', onState);
      socket.off('presence:update', onPresence);
      socket.off('presence:typing', onTyping);
      socket.disconnect();
    };
  }, [sessionId, join]);

  const emitTyping = useCallback(
    (isTyping) => {
      if (!connected || !roleRef.current) return;
      socket.emit('presence:typing', { isTyping });
    },
    [connected]
  );

  if (notFound) {
    return (
      <FullScreenCard>
        <h2>This session doesn't exist</h2>
        <p>The link might be old or mistyped — double-check it with your partner.</p>
      </FullScreenCard>
    );
  }

  if (!role) {
    return <RoleClaim sessionId={sessionId} onClaim={join} error={joinError} connected={connected} />;
  }

  if (!state) {
    return (
      <FullScreenCard>
        <p>Loading…</p>
      </FullScreenCard>
    );
  }

  const otherRole = role === ROLES.INITIATOR ? ROLES.RESPONDER : ROLES.INITIATOR;
  const otherConnected = otherRole === ROLES.INITIATOR ? presence.initiatorConnected : presence.responderConnected;
  const otherTyping = typingRole === otherRole;
  const otherName = otherRole === ROLES.INITIATOR ? state.session.initiatorName : state.session.responderName;
  const isActive = [SESSION_STATUS.SETUP, SESSION_STATUS.ENTRY, SESSION_STATUS.PROCESSING].includes(
    state.session.status
  );

  return (
    <div className="reset-session-shell">
      <div className="reset-session-inner">
        {state.session.status !== SESSION_STATUS.COMPLETED && state.session.status !== SESSION_STATUS.CANCELLED && (
          <ConnectionBanner connected={connected} otherConnected={otherConnected} otherName={otherName} />
        )}
        {state.session.status === SESSION_STATUS.PROCESSING && (
          <ProgressBar current={state.progress.current} total={state.progress.total} />
        )}

        {state.session.status === SESSION_STATUS.CANCELLED && (
          <FullScreenCard>
            <h2>This session was cancelled</h2>
            <p>{otherName} or you called it off. Start a new one whenever you're both ready.</p>
          </FullScreenCard>
        )}

        {state.session.status === SESSION_STATUS.SETUP && (
          <FullScreenCard>
            <h2>Waiting for {otherName} to join</h2>
            <p>Send them this link — their spot is saved.</p>
            <ShareLink sessionId={sessionId} />
          </FullScreenCard>
        )}

        {state.session.status === SESSION_STATUS.ENTRY && (
          <EntryPhase role={role} state={state} emitTyping={emitTyping} otherTyping={otherTyping} otherName={otherName} />
        )}

        {state.session.status === SESSION_STATUS.PROCESSING && (
          <EmotionFlow role={role} state={state} emitTyping={emitTyping} otherTyping={otherTyping} otherName={otherName} />
        )}

        {state.session.status === SESSION_STATUS.COMPLETED && <Summary state={state} />}

        {isActive && (
          <div className="reset-session-actions">
            <CopyLinkButton sessionId={sessionId} />
            <CancelSession />
          </div>
        )}
      </div>
    </div>
  );
}

function FullScreenCard({ children }) {
  return (
    <div className="reset-session-shell">
      <div className="reset-session-inner">
        <div className="reset-card reset-card--centered">{children}</div>
      </div>
    </div>
  );
}

function RoleClaim({ sessionId, onClaim, error, connected }) {
  const [claimed, setClaimed] = useState({ initiatorClaimed: false, responderClaimed: false });
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reset-sessions/${sessionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setClaimed({
            initiatorClaimed: data.session.initiatorClaimed,
            responderClaimed: data.session.responderClaimed,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  function pick(role) {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setPicking(true);
    onClaim(role, name);
  }

  return (
    <div className="reset-session-shell">
      <div className="reset-session-inner">
        <div className="reset-card reset-card--centered">
          <h2>Before we start</h2>
          <p className="reset-subtle">What should we call you here?</p>
          <input
            type="text"
            className="reset-text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Principe, Principessa, or anything you like"
            maxLength={40}
          />
          {nameError && <p className="reset-error">Please enter a name first.</p>}
          <p className="reset-subtle" style={{ marginTop: 14 }}>
            And which role are you playing right now? Locked in for this session — no switching.
          </p>
          <div className="reset-role-buttons">
            <button
              type="button"
              className="reset-btn reset-btn--primary"
              disabled={claimed.initiatorClaimed || picking || !connected}
              onClick={() => pick('initiator')}
            >
              {claimed.initiatorClaimed ? 'Already taken' : 'I have feelings to share'}
              <span className="reset-btn-tiny">the one talking</span>
            </button>
            <button
              type="button"
              className="reset-btn reset-btn--secondary"
              disabled={claimed.responderClaimed || picking || !connected}
              onClick={() => pick('responder')}
            >
              {claimed.responderClaimed ? 'Already taken' : "I'm listening"}
              <span className="reset-btn-tiny">the one listening</span>
            </button>
          </div>
          {!connected && <p className="reset-subtle reset-tiny">Connecting…</p>}
          {error && <p className="reset-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function ConnectionBanner({ connected, otherConnected, otherName }) {
  if (!connected) {
    return <div className="reset-banner reset-banner--warn">Connection trouble — reconnecting…</div>;
  }
  if (!otherConnected) {
    return (
      <div className="reset-banner reset-banner--info">
        {otherName} got disconnected — nothing is lost, they can rejoin right where you left off.
      </div>
    );
  }
  return null;
}

function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="reset-progress">
      <div className="reset-progress-track">
        <div className="reset-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="reset-progress-label">
        Feeling {current} of {total}
      </span>
    </div>
  );
}

function ShareLink({ sessionId }) {
  const [copied, setCopied] = useState(false);
  const url = resetSessionUrl(sessionId);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable, they can still select+copy the input */
    }
  }

  return (
    <div className="reset-share-link">
      <input readOnly className="reset-text-input" value={url} onFocus={(e) => e.target.select()} />
      <button type="button" className="reset-btn reset-btn--secondary" onClick={copy}>
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  );
}

function CopyLinkButton({ sessionId }) {
  const [copied, setCopied] = useState(false);
  const url = resetSessionUrl(sessionId);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button type="button" className="reset-btn reset-btn--ghost reset-btn--tiny" onClick={copy}>
      {copied ? 'Link copied!' : 'Copy session link'}
    </button>
  );
}

function CancelSession() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function confirmCancel() {
    setBusy(true);
    setError(null);
    try {
      await emitAction('session:cancel', {});
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="reset-btn reset-btn--ghost reset-btn--tiny" onClick={() => setConfirming(true)}>
        Cancel session
      </button>

      {confirming && (
        <div className="reset-modal-overlay" role="dialog" aria-modal="true">
          <div className="reset-card reset-card--centered reset-modal-card">
            <h2>End this session?</h2>
            <p className="reset-subtle">
              Nothing said so far will be lost, but the session closes for both of you and can't be
              picked back up.
            </p>
            {error && <p className="reset-error">{error}</p>}
            <div className="reset-button-row">
              <button type="button" className="reset-btn reset-btn--ghost" onClick={() => setConfirming(false)} disabled={busy}>
                Never mind
              </button>
              <button type="button" className="reset-btn reset-btn--primary" onClick={confirmCancel} disabled={busy}>
                Yes, cancel it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TypingHint({ show, label }) {
  if (!show) return null;
  return <p className="reset-typing-hint">{label} is typing…</p>;
}

function WaitingBanner({ message, otherTyping, otherName }) {
  return (
    <div className="reset-card reset-card--centered">
      <p className="reset-subtle">{message}</p>
      <TypingHint show={otherTyping} label={otherName} />
    </div>
  );
}

function EntryPhase({ role, state, emitTyping, otherTyping, otherName }) {
  const [text, setText] = useState('');
  const [context, setContext] = useState('');
  const [intensity, setIntensity] = useState(5);
  const [showForm, setShowForm] = useState(state.emotions.length === 0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const emotions = state.emotions;

  if (role !== ROLES.INITIATOR) {
    return (
      <div className="reset-card reset-card--centered">
        <h2>While we wait</h2>
        <p className="reset-subtle">
          {otherName} is gathering their feelings
          {emotions.length > 0 ? ` (${emotions.length} so far)` : ''}. Your only job right now is to
          get ready to listen.
        </p>
        <TypingHint show={otherTyping} label={otherName} />
      </div>
    );
  }

  async function submitEmotion(e) {
    e.preventDefault();
    if (!text.trim()) {
      setError('Give this feeling a name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await emitAction('emotion:add', { text, context, intensity });
      setText('');
      setContext('');
      setIntensity(5);
      emitTyping(false);
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function lockEntry() {
    setBusy(true);
    setError(null);
    try {
      await emitAction('entry:lock', {});
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="reset-card">
      <h2>What's sitting on your chest?</h2>
      <p className="reset-subtle">One feeling at a time. Small words are fine.</p>

      {emotions.length > 0 && (
        <ul className="reset-emotion-list">
          {emotions.map((em) => (
            <li key={em.id}>{em.text}</li>
          ))}
        </ul>
      )}

      {showForm ? (
        <form onSubmit={submitEmotion} className="reset-stacked-form">
          <label>
            The feeling
            <input
              type="text"
              className="reset-text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => emitTyping(true)}
              onBlur={() => emitTyping(false)}
              placeholder="anxious, unseen, hurt, grateful…"
              autoFocus
            />
          </label>
          <label>
            The story behind it (optional)
            <textarea
              className="reset-textarea"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              onFocus={() => emitTyping(true)}
              onBlur={() => emitTyping(false)}
              placeholder="what happened, or what set it off"
              rows={3}
            />
          </label>
          <label>
            How loud is it? {intensity}/10
            <input
              type="range"
              min="1"
              max="10"
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
            />
          </label>
          <button type="submit" className="reset-btn reset-btn--primary" disabled={busy}>
            Add this feeling
          </button>
          {error && <p className="reset-error">{error}</p>}
        </form>
      ) : (
        <div className="reset-stacked-form">
          <p>Anything else in there?</p>
          <div className="reset-button-row">
            <button type="button" className="reset-btn reset-btn--primary" onClick={() => setShowForm(true)}>
              Yep, one more
            </button>
            <button type="button" className="reset-btn reset-btn--secondary" onClick={lockEntry} disabled={busy}>
              That's everything — let's begin
            </button>
          </div>
          {error && <p className="reset-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

function EmotionCard({ emotion }) {
  return (
    <div className="reset-emotion-card">
      <div className="reset-emotion-card-head">
        <span className="reset-emotion-icon">💭</span>
        <h3>{emotion.text}</h3>
      </div>
      {emotion.context && <p className="reset-subtle">{emotion.context}</p>}
      {emotion.intensity != null && <div className="reset-intensity-tag">Intensity {emotion.intensity}/10</div>}
    </div>
  );
}

function AckStep({ emotion, emitTyping }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const attempt = emotion.acknowledgments.length + 1;

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) {
      setError('A few words is all it takes.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await emitAction('ack:submit', { emotionId: emotion.id, text });
      emitTyping(false);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="reset-card">
      <h2>{attempt > 1 ? `Round ${attempt} — you've got this` : 'Your turn to listen'}</h2>
      <p className="reset-subtle">
        Say back what you heard, in your own words. No fixing yet — just show them you get it.
      </p>
      {emotion.acknowledgments.length > 0 && (
        <div className="reset-gap-note-box">
          <span className="reset-gap-icon">💛</span>
          <div>
            <strong>What didn't quite land last time:</strong>
            <p>{emotion.acknowledgments[emotion.acknowledgments.length - 1].gap_note}</p>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="reset-stacked-form">
        <textarea
          className="reset-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => emitTyping(true)}
          onBlur={() => emitTyping(false)}
          placeholder="So what I'm hearing is…"
          rows={4}
          autoFocus
        />
        <button type="submit" className="reset-btn reset-btn--primary" disabled={busy}>
          Send it over
        </button>
        {error && <p className="reset-error">{error}</p>}
      </form>
    </div>
  );
}

function FeedbackStep({ emotion, emitTyping }) {
  const [gapNote, setGapNote] = useState('');
  const [showGapForm, setShowGapForm] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const latestAck = emotion.acknowledgments[emotion.acknowledgments.length - 1];

  async function respond(accepted) {
    if (!accepted && !gapNote.trim()) {
      setShowGapForm(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await emitAction('ack:feedback', { emotionId: emotion.id, accepted, gapNote });
      emitTyping(false);
      setGapNote('');
      setShowGapForm(false);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="reset-card">
      <h2>Did that land?</h2>
      <div className="reset-quote-box">{latestAck?.text}</div>
      {!showGapForm ? (
        <div className="reset-button-row">
          <button type="button" className="reset-btn reset-btn--primary" onClick={() => respond(true)} disabled={busy}>
            Yes — I feel heard
          </button>
          <button type="button" className="reset-btn reset-btn--secondary" onClick={() => setShowGapForm(true)} disabled={busy}>
            Not quite…
          </button>
        </div>
      ) : (
        <div className="reset-stacked-form">
          <label>
            What was missing? (be gentle, be honest)
            <textarea
              className="reset-textarea"
              value={gapNote}
              onChange={(e) => setGapNote(e.target.value)}
              onFocus={() => emitTyping(true)}
              onBlur={() => emitTyping(false)}
              placeholder="I wanted you to notice that…"
              rows={3}
              autoFocus
            />
          </label>
          <div className="reset-button-row">
            <button type="button" className="reset-btn reset-btn--primary" onClick={() => respond(false)} disabled={busy}>
              Send it gently
            </button>
            <button type="button" className="reset-btn reset-btn--ghost" onClick={() => setShowGapForm(false)} disabled={busy}>
              Never mind
            </button>
          </div>
        </div>
      )}
      {error && <p className="reset-error">{error}</p>}
    </div>
  );
}

function ReassuranceStep({ emotion, role, emitTyping }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const attempt = emotion.reassuranceAttemptsUsed + 1;
  const lastGap = emotion.reassurances[emotion.reassurances.length - 1]?.gap_note;

  if (emotion.reassuranceMaxReached) {
    return (
      <div className="reset-card">
        <h2>This one's a stubborn knot</h2>
        <p className="reset-subtle">
          Three tries is plenty for today — some feelings need to circle a while before they land.
          Either of you can leave it open and move on. That's not giving up, it's pacing yourselves.
        </p>
        <button
          type="button"
          className="reset-btn reset-btn--primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await emitAction('emotion:markStillOpen', { emotionId: emotion.id });
            } catch (err) {
              setError(err.message);
              setBusy(false);
            }
          }}
        >
          Leave it open and move on
        </button>
        {error && <p className="reset-error">{error}</p>}
      </div>
    );
  }

  if (role !== 'responder') return null;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await emitAction('reassurance:submit', { emotionId: emotion.id, text });
      emitTyping(false);
      setText('');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    setError(null);
    try {
      await emitAction('reassurance:submit', { emotionId: emotion.id, skipped: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="reset-card">
      <h2>{attempt > 1 ? `Another go — round ${attempt}` : 'Anything you want to promise?'}</h2>
      <p className="reset-subtle">Offer something small and real — or say the listening was the gift.</p>
      {lastGap && (
        <div className="reset-gap-note-box">
          <span className="reset-gap-icon">💛</span>
          <div>
            <strong>What was still missing:</strong>
            <p>{lastGap}</p>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="reset-stacked-form">
        <textarea
          className="reset-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => emitTyping(true)}
          onBlur={() => emitTyping(false)}
          placeholder="e.g. I'll check in tomorrow before your meeting"
          rows={4}
        />
        <div className="reset-button-row">
          <button type="submit" className="reset-btn reset-btn--primary" disabled={busy}>
            Offer it
          </button>
          <button type="button" className="reset-btn reset-btn--ghost" onClick={skip} disabled={busy}>
            The listening was enough
          </button>
        </div>
        {error && <p className="reset-error">{error}</p>}
      </form>
    </div>
  );
}

const SUFFICIENCY_OPTIONS = [
  { value: SUFFICIENCY.SATISFIED, label: "That's the stuff" },
  { value: SUFFICIENCY.PARTIAL, label: 'Almost there' },
  { value: SUFFICIENCY.NOT_NEEDED, label: 'Not what I needed' },
];

function SufficiencyStep({ emotion, emitTyping }) {
  const [gapNote, setGapNote] = useState('');
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const latest = emotion.reassurances[emotion.reassurances.length - 1];

  async function rate(sufficiency) {
    if (sufficiency !== SUFFICIENCY.SATISFIED && !gapNote.trim()) {
      setPending(sufficiency);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await emitAction('sufficiency:submit', { emotionId: emotion.id, sufficiency, gapNote });
      emitTyping(false);
      setGapNote('');
      setPending(null);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="reset-card">
      <h2>Was that what you needed?</h2>
      <div className="reset-quote-box">{latest?.text}</div>
      {!pending ? (
        <div className="reset-button-row reset-button-row--wrap">
          {SUFFICIENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="reset-btn reset-btn--secondary"
              onClick={() => rate(opt.value)}
              disabled={busy}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="reset-stacked-form">
          <label>
            What's still missing? (they want to get this right)
            <textarea
              className="reset-textarea"
              value={gapNote}
              onChange={(e) => setGapNote(e.target.value)}
              onFocus={() => emitTyping(true)}
              onBlur={() => emitTyping(false)}
              placeholder="It would help if…"
              rows={3}
              autoFocus
            />
          </label>
          <div className="reset-button-row">
            <button type="button" className="reset-btn reset-btn--primary" onClick={() => rate(pending)} disabled={busy}>
              Send it gently
            </button>
            <button type="button" className="reset-btn reset-btn--ghost" onClick={() => setPending(null)} disabled={busy}>
              Never mind
            </button>
          </div>
        </div>
      )}
      {error && <p className="reset-error">{error}</p>}
    </div>
  );
}

function AgreementStep({ emotion, emitTyping }) {
  const latest = emotion.reassurances[emotion.reassurances.length - 1];
  const [text, setText] = useState(latest?.text || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (!text.trim()) {
      setError('Add the commitment text, or skip.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await emitAction('agreement:save', { emotionId: emotion.id, text });
      emitTyping(false);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    setError(null);
    try {
      await emitAction('agreement:skip', { emotionId: emotion.id });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="reset-card reset-card--centered">
      <span className="reset-hearts">💛</span>
      <h2>It landed! Pinky promise time?</h2>
      <p className="reset-subtle">
        Want to keep this promise somewhere you can both look back at? Tweak the words if you like.
      </p>
      <form onSubmit={save} className="reset-stacked-form">
        <textarea
          className="reset-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => emitTyping(true)}
          onBlur={() => emitTyping(false)}
          rows={3}
        />
        <div className="reset-button-row">
          <button type="submit" className="reset-btn reset-btn--primary" disabled={busy}>
            Save the promise
          </button>
          <button type="button" className="reset-btn reset-btn--ghost" onClick={skip} disabled={busy}>
            No need to write it down
          </button>
        </div>
        {error && <p className="reset-error">{error}</p>}
      </form>
    </div>
  );
}

function EmotionFlow({ role, state, emitTyping, otherTyping, otherName }) {
  const emotion = state.emotions.find((e) => e.isCurrent);
  if (!emotion) {
    return (
      <div className="reset-card reset-card--centered">
        <p className="reset-subtle">Loading the next feeling…</p>
      </div>
    );
  }

  let step = null;

  switch (emotion.status) {
    case EMOTION_STATUS.AWAITING_ACK:
      step =
        role === ROLES.RESPONDER ? (
          <AckStep emotion={emotion} emitTyping={emitTyping} />
        ) : (
          <WaitingBanner message={`${otherName} is finding the right words…`} otherTyping={otherTyping} otherName={otherName} />
        );
      break;

    case EMOTION_STATUS.AWAITING_FEEDBACK:
      step =
        role === ROLES.INITIATOR ? (
          <FeedbackStep emotion={emotion} emitTyping={emitTyping} />
        ) : (
          <WaitingBanner message={`Your words are with ${otherName} now.`} otherTyping={otherTyping} otherName={otherName} />
        );
      break;

    case EMOTION_STATUS.AWAITING_REASSURANCE:
      if (emotion.reassuranceMaxReached) {
        step = <ReassuranceStep emotion={emotion} role={role} emitTyping={emitTyping} />;
      } else {
        step =
          role === ROLES.RESPONDER ? (
            <ReassuranceStep emotion={emotion} role={role} emitTyping={emitTyping} />
          ) : (
            <WaitingBanner message={`${otherName} is thinking about what comes next…`} otherTyping={otherTyping} otherName={otherName} />
          );
      }
      break;

    case EMOTION_STATUS.AWAITING_SUFFICIENCY:
      step =
        role === ROLES.INITIATOR ? (
          <SufficiencyStep emotion={emotion} emitTyping={emitTyping} />
        ) : (
          <WaitingBanner message={`${otherName} is sitting with your promise for a moment…`} otherTyping={otherTyping} otherName={otherName} />
        );
      break;

    case EMOTION_STATUS.AWAITING_AGREEMENT:
      step = <AgreementStep emotion={emotion} emitTyping={emitTyping} />;
      break;

    default:
      step = null;
  }

  return (
    <div>
      <EmotionCard emotion={emotion} />
      {step}
    </div>
  );
}

function Summary({ state }) {
  return (
    <div>
      <div className="reset-card reset-card--centered">
        <span className="reset-hearts">💛</span>
        <h1>You did the thing</h1>
        <p className="reset-subtle">
          {state.session.initiatorName} &amp; {state.session.responderName} — here's everything you
          worked through together. Be a little proud.
        </p>
      </div>
      {state.emotions.map((emotion, i) => {
        const finalAck = emotion.acknowledgments.find((a) => a.accepted) || emotion.acknowledgments.at(-1);
        const finalReassurance = emotion.reassurances.at(-1);
        return (
          <div className="reset-card reset-summary-item" key={emotion.id}>
            <div className="reset-summary-header">
              <h3>
                {i + 1}. {emotion.text}
              </h3>
              <span className={`reset-status-pill${emotion.status === EMOTION_STATUS.STILL_OPEN ? ' reset-status-pill--open' : ''}`}>
                {emotion.status === EMOTION_STATUS.STILL_OPEN ? 'Still open' : 'Settled'}
              </span>
            </div>
            {emotion.context && <p className="reset-subtle">{emotion.context}</p>}
            {finalAck && (
              <div className="reset-summary-block">
                <strong>Acknowledgment</strong>
                <p>{finalAck.text}</p>
              </div>
            )}
            {finalReassurance && !finalReassurance.skipped && (
              <div className="reset-summary-block">
                <strong>Reassurance</strong>
                <p>{finalReassurance.text}</p>
                {finalReassurance.sufficiency && (
                  <span className="reset-tiny reset-subtle">{SUFFICIENCY_LABEL[finalReassurance.sufficiency]}</span>
                )}
              </div>
            )}
            {emotion.agreement && (
              <div className="reset-summary-block reset-summary-block--agreement">
                <strong>Agreement</strong>
                <p>{emotion.agreement.text}</p>
                <span className="reset-tiny reset-subtle">Saved {new Date(emotion.agreement.created_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
