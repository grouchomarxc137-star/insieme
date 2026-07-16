import { useState } from 'react';
import { useTaskList } from '../hooks/useTaskList.js';
import { usePeekTasks } from '../hooks/usePeekTasks.js';
import { awardGrowth, getGrowthState, canAwardMonthlyLock, MONTHLY_LOCK_BONUS_XP } from '../lib/growth.js';
import './HomePage.css';

// How much each completed task nudges its matching Plant factor, on top of
// the task's own XP reward. Monthly goals move Bees more since they're rarer.
const FACTOR_GAIN = {
  water: 6,
  sun: 6,
  bees: 12,
};

const DEFAULT_PERSONAL = [
  { label: '30 minutes on your own project', xp: 20 },
  { label: '10-minute stretch or walk', xp: 10 },
  { label: 'Read a few pages of something just for you', xp: 10 },
];

const DEFAULT_RELATIONSHIP = [
  { label: 'Have one phone-free conversation', xp: 15 },
  { label: 'Send one kind, unprompted text', xp: 10 },
  { label: 'Ask how their day actually went', xp: 10 },
];

const DEFAULT_MONTHLY_SHARED = [{ label: 'Plan one date night', due: 'By Jul 31', xp: 50 }];

const DEFAULT_MONTHLY_PERSONAL = [
  { label: 'Finish something you started for yourself', due: 'By Jul 31', xp: 35 },
  { label: 'Check in on your own goal for the month', due: 'By Jul 31', xp: 25 },
];

// Reward values for any newly added task, per category — configured here in
// code, not by the player. Only a task's name is player-editable.
const NEW_TASK_REWARDS = {
  personal: { xp: 10 },
  relationship: { xp: 10 },
  monthlyShared: { xp: 25, due: 'This month' },
  monthlyPersonal: { xp: 25, due: 'This month' },
};

const MAX_TASKS = 3;
const MAX_MONTHLY_SHARED = 1;
const MAX_MONTHLY_PERSONAL = 2;

export default function HomePage({ user }) {
  const otherName = user === 'Principe' ? 'Principessa' : 'Principe';

  const personal = useTaskList(`insieme-personal-${user}`, DEFAULT_PERSONAL);
  const relationship = useTaskList('insieme-relationship-tasks', DEFAULT_RELATIONSHIP);
  const monthlyShared = useTaskList('insieme-monthly-shared', DEFAULT_MONTHLY_SHARED);
  const monthlyPersonal = useTaskList(`insieme-monthly-personal-${user}`, DEFAULT_MONTHLY_PERSONAL);

  const [peekingPersonal, setPeekingPersonal] = useState(false);
  const otherPersonalSnapshot = usePeekTasks(`insieme-personal-${otherName}`, peekingPersonal);

  const [peekingMonthly, setPeekingMonthly] = useState(false);
  const otherMonthlySnapshot = usePeekTasks(`insieme-monthly-personal-${otherName}`, peekingMonthly);

  const todayEarned = personal.earned + relationship.earned;

  // Locking in a goal is worth a little XP on its own, before it's done —
  // but only the first lock per list per calendar month counts, so
  // unlocking and relocking the same goals can't be used to farm it.
  function handleLockMonthly(list, logId) {
    if (list.tasks.length > 0) {
      const state = getGrowthState();
      if (canAwardMonthlyLock(state, logId)) {
        awardGrowth({
          xp: MONTHLY_LOCK_BONUS_XP * list.tasks.length,
          factor: 'bees',
          factorGain: 4,
          logId,
        });
      }
    }
    list.lock();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Home</h1>
        <p>Today's focus, and where you're headed this month.</p>
      </div>

      <div className="earned-strip">
        <span className="earned-label">Today so far</span>
        <span className="earned-pill">✨ {todayEarned} XP</span>
      </div>

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
              emptyMessage={`${otherName} hasn't set up personal tasks yet.`}
              pendingMessage={`${otherName} is still setting up today's tasks.`}
            />
          ) : (
            <TaskListBody
              list={personal}
              factor="water"
              addPlaceholder="Add a personal task"
              newTaskDefaults={NEW_TASK_REWARDS.personal}
            />
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
            newTaskDefaults={NEW_TASK_REWARDS.relationship}
            maxTasks={MAX_TASKS}
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
            newTaskDefaults={NEW_TASK_REWARDS.monthlyShared}
            maxTasks={MAX_MONTHLY_SHARED}
            onLock={() => handleLockMonthly(monthlyShared, 'monthly-lock-shared')}
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
              emptyMessage={`${otherName} hasn't set up personal goals yet.`}
              pendingMessage={`${otherName} is still setting up this month's goals.`}
            />
          ) : (
            <TaskListBody
              list={monthlyPersonal}
              factor="bees"
              showDue
              addPlaceholder="Add a personal goal"
              newTaskDefaults={NEW_TASK_REWARDS.monthlyPersonal}
              maxTasks={MAX_MONTHLY_PERSONAL}
              onLock={() => handleLockMonthly(monthlyPersonal, `monthly-lock-personal-${user}`)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TaskListBody({ list, factor, showDue, addPlaceholder, newTaskDefaults, maxTasks = MAX_TASKS, onLock }) {
  const atCap = list.tasks.length >= maxTasks;

  function handleToggle(task) {
    // Only awards on the not-done -> done transition, and never reverses on
    // uncheck, so toggling back and forth can't be used to farm Plant growth.
    if (!task.done) {
      awardGrowth({ xp: task.xp, factor, factorGain: FACTOR_GAIN[factor] || 0 });
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

      <ul className="task-list">
        {list.tasks.map((task) =>
          list.locked ? (
            <TaskRow key={task.id} task={task} onToggle={() => handleToggle(task)} showDue={showDue} />
          ) : (
            <EditableTaskRow
              key={task.id}
              task={task}
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
          <button type="button" className="unlock-btn" onClick={list.unlock}>
            🔓 Unlock to edit (resets progress)
          </button>
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

function EditableTaskRow({ task, showDue, onChange, onRemove }) {
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
        <span className="reward-tag">+{task.xp} XP</span>
        <button type="button" className="task-remove-btn" onClick={onRemove} aria-label={`Remove "${task.label}"`}>
          ✕
        </button>
      </div>
    </li>
  );
}

function TaskRow({ task, onToggle, showDue, readOnly }) {
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
        <span className="reward-tag">+{task.xp} XP</span>
      </div>
    </li>
  );
}

function PeekView({ otherName, snapshot, showDue, emptyMessage, pendingMessage }) {
  if (!snapshot) {
    return <p className="peek-note">Loading {otherName}'s tasks…</p>;
  }
  if (snapshot.tasks.length === 0) {
    return <p className="peek-note">{emptyMessage}</p>;
  }
  if (!snapshot.locked) {
    return <p className="peek-note">{pendingMessage}</p>;
  }

  const earned = snapshot.tasks.reduce((acc, task) => (task.done ? acc + task.xp : acc), 0);

  return (
    <>
      <div className="task-card-status">
        <span className="lock-badge lock-badge--locked">🔒 Locked in</span>
        <span className="earned-pill">✨ {earned} XP</span>
      </div>
      <ul className="task-list">
        {snapshot.tasks.map((task) => (
          <TaskRow key={task.id} task={task} showDue={showDue} readOnly />
        ))}
      </ul>
    </>
  );
}
