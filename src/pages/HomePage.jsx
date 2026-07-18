import { useState } from 'react';
import { useTaskList } from '../hooks/useTaskList.js';
import { usePeekTasks } from '../hooks/usePeekTasks.js';
import {
  awardGrowth,
  unawardGrowth,
  awardMonthlyLockBonus,
  useGrowth,
  levelProgress,
  stageForLevel,
  currentMultiplier,
  MAX_LEVEL,
} from '../lib/growth.js';
import { dailyReward, monthlyReward } from '../lib/tasksModel.js';
import NidoScene from '../components/NidoScene.jsx';
import './HomePage.css';

// How much each completed task nudges its matching Plant factor, on top of
// the task's own XP reward. Monthly goals move Bees more since they're rarer.
const FACTOR_GAIN = {
  water: 6,
  sun: 6,
  bees: 12,
};

// Cleared to empty so both of you start adding your own — nothing seeded.
const DEFAULT_PERSONAL = [];
const DEFAULT_RELATIONSHIP = [];
const DEFAULT_MONTHLY_SHARED = [];
const DEFAULT_MONTHLY_PERSONAL = [];

const NEW_TASK_DUE = { monthlyShared: 'This month', monthlyPersonal: 'This month' };

const MAX_TASKS = 3;
const MAX_MONTHLY_SHARED = 1;
const MAX_MONTHLY_PERSONAL = 2;

export default function HomePage({ user }) {
  const otherName = user === 'Principe' ? 'Principessa' : 'Principe';

  // These keys are now rows in the server's task_lists table (they kept the
  // old localStorage names so the one-time migration could match them up).
  // Renaming one starts that list from a clean slate on next load.
  const personal = useTaskList(`lovissimi-personal-${user}`, DEFAULT_PERSONAL, {
    rewardForIndex: dailyReward,
  });
  const relationship = useTaskList('lovissimi-relationship-tasks', DEFAULT_RELATIONSHIP, {
    rewardForIndex: dailyReward,
  });
  const monthlyShared = useTaskList('lovissimi-monthly-shared', DEFAULT_MONTHLY_SHARED, {
    rewardForIndex: monthlyReward,
  });
  const monthlyPersonal = useTaskList(`lovissimi-monthly-personal-${user}`, DEFAULT_MONTHLY_PERSONAL, {
    rewardForIndex: monthlyReward,
  });

  const [peekingPersonal, setPeekingPersonal] = useState(false);
  const otherPersonalSnapshot = usePeekTasks(`lovissimi-personal-${otherName}`, peekingPersonal);

  const [peekingMonthly, setPeekingMonthly] = useState(false);
  const otherMonthlySnapshot = usePeekTasks(`lovissimi-monthly-personal-${otherName}`, peekingMonthly);

  const todayEarned = personal.earned + relationship.earned;

  const growth = useGrowth();
  const { level } = levelProgress(growth.totalXp);
  const stage = stageForLevel(level);
  const multiplier = currentMultiplier(growth);

  // Locking in a goal is worth a little XP on its own, before it's done —
  // but only the first lock per list per calendar month counts, so
  // unlocking and relocking the same goals can't be used to farm it. The
  // once-per-month check lives on the server, against the shared state.
  function handleLockMonthly(list, logId) {
    if (list.tasks.length > 0) {
      awardMonthlyLockBonus(logId, list.tasks.length).catch(() => {});
    }
    list.lock();
  }

  return (
    <div className="page">
      <section className="nido-hero" aria-label="Greeting">
        <NidoScene />
        <div className="nido-hero-inner">
          <p className="nido-eyebrow">Il vostro nido</p>
          <h1>Buongiorno, {user}</h1>
          <p className="nido-sub">Today's focus, and where you're headed this month.</p>
          <div className="nido-badges">
            <span className="nido-badge">{stage.icon} {stage.label} · Lv. {level} / {MAX_LEVEL}</span>
            <span className="nido-badge">⚡ Growth {multiplier}×</span>
            <span className="nido-badge">✨ Today {todayEarned} XP</span>
          </div>
        </div>
      </section>

      <div className="daily-grid">
        <div className="task-card task-card--lavender">
          <div className="task-card-header">
            <h2>Personal</h2>
            <span className="task-card-subtitle">For you</span>
            <button type="button" className="peek-toggle" onClick={() => setPeekingPersonal((prev) => !prev)}>
              {peekingPersonal ? '← Back to yours' : `👀 Peek at ${otherName}`}
            </button>
          </div>
          {peekingPersonal ? (
            <PeekView
              otherName={otherName}
              snapshot={otherPersonalSnapshot}
              rewardForIndex={dailyReward}
              emptyMessage={`${otherName} hasn't set up personal tasks yet.`}
              pendingMessage={`${otherName} is still setting up today's tasks.`}
            />
          ) : (
            <TaskListBody list={personal} factor="water" addPlaceholder="Add a personal task" periodNoun="day" />
          )}
        </div>

        <div className="task-card task-card--pink">
          <div className="task-card-header">
            <h2>Relationship</h2>
            <span className="task-card-subtitle">For us</span>
          </div>
          <TaskListBody
            list={relationship}
            factor="sun"
            addPlaceholder="Add a relationship task"
            maxTasks={MAX_TASKS}
            periodNoun="day"
          />
        </div>
      </div>

      <div className="monthly-card">
        <div className="monthly-header">
          <h2>This month</h2>
        </div>

        <div className="monthly-section">
          <h3 className="monthly-section-title">Our goal</h3>
          <TaskListBody
            list={monthlyShared}
            factor="bees"
            showDue
            addPlaceholder="Add your shared goal"
            newTaskDefaults={NEW_TASK_DUE.monthlyShared}
            maxTasks={MAX_MONTHLY_SHARED}
            onLock={() => handleLockMonthly(monthlyShared, 'monthly-lock-shared')}
            periodNoun="month"
          />
        </div>

        <div className="monthly-section">
          <div className="monthly-section-header">
            <h3 className="monthly-section-title">Your goals</h3>
            <button type="button" className="peek-toggle" onClick={() => setPeekingMonthly((prev) => !prev)}>
              {peekingMonthly ? '← Back to yours' : `👀 Peek at ${otherName}`}
            </button>
          </div>
          {peekingMonthly ? (
            <PeekView
              otherName={otherName}
              snapshot={otherMonthlySnapshot}
              showDue
              rewardForIndex={monthlyReward}
              emptyMessage={`${otherName} hasn't set up personal goals yet.`}
              pendingMessage={`${otherName} is still setting up this month's goals.`}
            />
          ) : (
            <TaskListBody
              list={monthlyPersonal}
              factor="bees"
              showDue
              addPlaceholder="Add a personal goal"
              newTaskDefaults={NEW_TASK_DUE.monthlyPersonal}
              maxTasks={MAX_MONTHLY_PERSONAL}
              onLock={() => handleLockMonthly(monthlyPersonal, `monthly-lock-personal-${user}`)}
              periodNoun="month"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TaskListBody({ list, factor, showDue, addPlaceholder, newTaskDefaults, maxTasks = MAX_TASKS, onLock, periodNoun = 'day' }) {
  const atCap = list.tasks.length >= maxTasks;
  const missedCount = list.tasks.filter((task) => task.missed).length;

  function handleToggle(task, index) {
    // Awards on the not-done -> done transition and reverses the same
    // xp/factorGain on the done -> not-done transition, so toggling back and
    // forth can't be used to farm Plant growth.
    const factorGain = FACTOR_GAIN[factor] || 0;
    const xp = list.rewardForIndex(index);
    if (!task.done) {
      awardGrowth({ xp, factor, factorGain }).catch(() => {});
    } else {
      unawardGrowth({ xp, factor, factorGain }).catch(() => {});
    }
    list.toggleTask(task.id);
  }

  return (
    <>
      <div className="task-card-status">
        {list.locked ? (
          <>
            <span className="lock-badge lock-badge--locked">🔒 Locked in</span>
            <span className="earned-pill">✨ {list.earned} XP</span>
          </>
        ) : (
          <span className="lock-badge">🔓 Editing — lock in to start earning</span>
        )}
      </div>

      {missedCount > 0 && (
        <p className="missed-note">
          ⚠️ {missedCount} {missedCount === 1 ? 'task was' : 'tasks were'} still unfinished when the {periodNoun}{' '}
          ended — that cost XP. Edit and lock in again when you're ready.
        </p>
      )}

      <ul className="task-list">
        {list.tasks.map((task, index) =>
          list.locked ? (
            <TaskRow
              key={task.id}
              task={task}
              reward={list.rewardForIndex(index)}
              onToggle={() => handleToggle(task, index)}
              showDue={showDue}
            />
          ) : (
            <EditableTaskRow
              key={task.id}
              task={task}
              reward={list.rewardForIndex(index)}
              showDue={showDue}
              onChange={(patch) => list.updateTask(task.id, patch)}
              onRemove={() => list.removeTask(task.id)}
            />
          )
        )}
      </ul>

      {!list.locked && !atCap && (
        <button
          type="button"
          className="add-task-btn"
          onClick={() => list.addTask(newTaskDefaults)}
        >
          + {addPlaceholder || 'Add task'}
        </button>
      )}
      {!list.locked && atCap && (
        <p className="task-cap-note">
          Up to {maxTasks} {maxTasks === 1 ? 'task' : 'tasks'} — remove one to add another.
        </p>
      )}

      <div className="lock-row">
        {list.locked ? (
          <>
            <button type="button" className="unlock-btn" onClick={list.unlock}>
              🔓 Unlock to edit
            </button>
            <p className="task-cap-note">
              Free to revise any time. XP is only lost if this is still locked with unfinished tasks when the{' '}
              {periodNoun} ends.
            </p>
          </>
        ) : (
          <button
            type="button"
            className="lock-btn"
            onClick={onLock || list.lock}
            disabled={list.tasks.length === 0}
          >
            🔒 Lock in
          </button>
        )}
      </div>
    </>
  );
}

function EditableTaskRow({ task, reward, showDue, onChange, onRemove }) {
  return (
    <li className="task-row task-row--editable">
      <input
        type="text"
        className="task-edit-label"
        value={task.label}
        onChange={(event) => onChange({ label: event.target.value })}
        placeholder="Task name"
      />
      {showDue && (
        <input
          type="text"
          className="task-edit-due"
          value={task.due || ''}
          onChange={(event) => onChange({ due: event.target.value })}
          placeholder="Due"
        />
      )}
      <div className="task-edit-rewards">
        {task.missed && <span className="missed-badge">⚠️ Missed</span>}
        <span className="reward-tag">+{reward} XP</span>
        <button type="button" className="task-remove-btn" onClick={onRemove} aria-label={`Remove "${task.label}"`}>
          ✕
        </button>
      </div>
    </li>
  );
}

function TaskRow({ task, reward, onToggle, showDue, readOnly }) {
  return (
    <li className={`task-row${task.done ? ' is-done' : ''}`}>
      <button
        type="button"
        className="task-checkbox"
        onClick={readOnly ? undefined : onToggle}
        disabled={readOnly}
        aria-pressed={task.done}
        aria-label={readOnly ? undefined : task.done ? `Mark "${task.label}" not done` : `Mark "${task.label}" done`}
      >
        {task.done ? '✓' : ''}
      </button>
      <div className="task-info">
        <span className="task-label">{task.label}</span>
        {showDue && task.due && <span className="task-due">{task.due}</span>}
      </div>
      <div className="task-rewards">
        {task.missed && <span className="missed-badge">⚠️ Missed</span>}
        <span className="reward-tag">+{reward} XP</span>
      </div>
    </li>
  );
}

function PeekView({ otherName, snapshot, showDue, rewardForIndex, emptyMessage, pendingMessage }) {
  if (!snapshot) {
    return <p className="peek-note">Loading {otherName}'s tasks…</p>;
  }
  if (snapshot.tasks.length === 0) {
    return <p className="peek-note">{emptyMessage}</p>;
  }
  if (!snapshot.locked) {
    return <p className="peek-note">{pendingMessage}</p>;
  }

  const earned = snapshot.tasks.reduce(
    (acc, task, index) => (task.done ? acc + rewardForIndex(index) : acc),
    0
  );

  return (
    <>
      <div className="task-card-status">
        <span className="lock-badge lock-badge--locked">🔒 Locked in</span>
        <span className="earned-pill">✨ {earned} XP</span>
      </div>
      <ul className="task-list">
        {snapshot.tasks.map((task, index) => (
          <TaskRow key={task.id} task={task} reward={rewardForIndex(index)} showDue={showDue} readOnly />
        ))}
      </ul>
    </>
  );
}
