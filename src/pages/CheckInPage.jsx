import { useState } from 'react';
import { useCheckin } from '../hooks/useCheckin.js';
import { questionsForType, typeLabel } from '../lib/checkin.js';
import RelationshipHeatmap from '../components/RelationshipHeatmap.jsx';
import './CheckInPage.css';

const TYPES = ['daily', 'weekly'];

export default function CheckInPage({ user }) {
  const [activeType, setActiveType] = useState('daily');
  const otherName = user === 'Principe' ? 'Principessa' : 'Principe';
  const { checkin, loading, submitting, error, submit } = useCheckin(activeType);

  const hasSubmitted = Boolean(checkin?.submittedAt?.[user]);
  const isComplete = checkin?.status === 'complete';

  return (
    <div className="page">
      <div className="page-header">
        <h1>Check-in</h1>
        <p>Your recurring strategy meeting — a regular moment to align on how you're both doing.</p>
      </div>

      <div className="checkin-type-row">
        {TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={`checkin-type-btn${type === activeType ? ' is-active' : ''}`}
            onClick={() => setActiveType(type)}
          >
            {typeLabel(type)}
          </button>
        ))}
      </div>

      {loading && <p className="checkin-note">Loading…</p>}

      {!loading && checkin && (
        <>
          <div className="checkin-status-card">
            <span className="checkin-period-label">{checkin.periodLabel}</span>
            {isComplete ? (
              <span className="checkin-badge checkin-badge--complete">✓ Both submitted</span>
            ) : hasSubmitted ? (
              <span className="checkin-badge">🔒 Submitted — waiting for {otherName}</span>
            ) : (
              <span className="checkin-badge checkin-badge--open">Not submitted yet</span>
            )}
          </div>

          {isComplete ? (
            <ComparisonView type={activeType} responses={checkin.responses} />
          ) : hasSubmitted ? (
            <p className="checkin-note">
              Your answers for {checkin.periodLabel} are locked in. They'll stay hidden until {otherName} submits
              too — then you'll both see everything at once, a PDF gets sent to Discord
              {activeType === 'daily' ? ', and the tree gets its XP' : ''}.
            </p>
          ) : (
            <CheckinForm
              type={activeType}
              user={user}
              submitting={submitting}
              error={error}
              onSubmit={(responses) => submit(user, responses)}
            />
          )}

          {/* Always on, whatever today's check-in state is — it's the running
              record of the month, not part of the form. */}
          {activeType === 'daily' && <RelationshipHeatmap user={user} checkinStatus={checkin.status} />}
        </>
      )}
    </div>
  );
}

function emptyAnswers(type) {
  const answers = {};
  for (const question of questionsForType(type)) {
    if (question.type !== 'heading') answers[question.id] = { choice: '', detail: '' };
  }
  return answers;
}

function isAnswered(question, answer) {
  if (question.type === 'textarea') return Boolean(answer?.detail?.trim());
  return Boolean(answer?.choice);
}

function CheckinForm({ type, submitting, error, onSubmit }) {
  const [answers, setAnswers] = useState(() => emptyAnswers(type));
  const [validationError, setValidationError] = useState(null);
  const questions = questionsForType(type);

  function setChoice(questionId, choice) {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], choice } }));
  }

  function setDetail(questionId, detail) {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], detail } }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const missing = questions.find((q) => q.type !== 'heading' && q.required && !isAnswered(q, answers[q.id]));
    if (missing) {
      setValidationError('Please answer all required questions before submitting.');
      return;
    }
    setValidationError(null);
    await onSubmit(answers);
  }

  return (
    <form className="checkin-form" onSubmit={handleSubmit}>
      {questions.map((question) =>
        question.type === 'heading' ? (
          <div key={question.label} className="checkin-heading">
            <h2>{question.label}</h2>
            {question.description && <p>{question.description}</p>}
          </div>
        ) : (
          <QuestionInput
            key={question.id}
            question={question}
            answer={answers[question.id]}
            onChoice={(choice) => setChoice(question.id, choice)}
            onDetail={(detail) => setDetail(question.id, detail)}
          />
        )
      )}

      {(validationError || error) && <p className="checkin-error">{validationError || error}</p>}

      <button type="submit" className="checkin-submit-btn" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit private check-in'}
      </button>
    </form>
  );
}

function QuestionInput({ question, answer, onChoice, onDetail }) {
  return (
    <div className="checkin-question">
      <label className="checkin-question-label">
        {question.label}
        {question.required && <span className="checkin-required">*</span>}
      </label>
      {question.hint && <p className="checkin-hint">{question.hint}</p>}

      {(question.type === 'scale' || question.type === 'choice_text') && (
        <div className="checkin-pill-row">
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              className={`checkin-pill${answer?.choice === option ? ' is-selected' : ''}`}
              onClick={() => onChoice(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {(question.type === 'choice_text' || question.type === 'textarea') && (
        <textarea
          className="checkin-textarea"
          placeholder={question.type === 'textarea' ? 'Your answer' : 'Add context if there is something to explain (optional)'}
          value={answer?.detail || ''}
          onChange={(event) => onDetail(event.target.value)}
        />
      )}
    </div>
  );
}

function responseText(response) {
  if (!response) return 'No answer';
  const choice = (response.choice || '').trim();
  const detail = (response.detail || '').trim();
  const parts = [choice, detail].filter(Boolean);
  return parts.length ? parts.join(' — ') : 'No answer';
}

function ComparisonView({ type, responses }) {
  const questions = questionsForType(type);
  return (
    <div className="checkin-comparison">
      {questions.map((question) =>
        question.type === 'heading' ? (
          <div key={question.label} className="checkin-heading">
            <h2>{question.label}</h2>
            {question.description && <p>{question.description}</p>}
          </div>
        ) : (
          <div key={question.id} className="comparison-item">
            <p className="comparison-label">{question.label}</p>
            <div className="comparison-grid">
              <div className="comparison-panel comparison-panel--principe">
                <span>Principe</span>
                <p>{responseText(responses?.Principe?.[question.id])}</p>
              </div>
              <div className="comparison-panel comparison-panel--principessa">
                <span>Principessa</span>
                <p>{responseText(responses?.Principessa?.[question.id])}</p>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
