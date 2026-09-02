import { useTickets } from '../hooks/useTickets.js';
import {
  useGrowth,
  levelProgress,
  stageForLevel,
  currentMultiplier,
  plantXp,
  MAX_LEVEL,
} from '../lib/growth.js';
import { countPersonalSolvedTotal } from '../lib/ticketTiers.js';
import NidoScene from '../components/NidoScene.jsx';
import HomeTasks from '../components/HomeTasks.jsx';
import './HomePage.css';

export default function HomePage({ user }) {
  // One tickets subscription for the whole page — the hero's "tasks done"
  // badge and the HomeTasks list below both read from it.
  const ticketsApi = useTickets(user);
  const tasksDone = countPersonalSolvedTotal(ticketsApi.tickets, user);

  const growth = useGrowth();
  // The nido badge is the Plant's own level — everyone's XP combined,
  // personal or shared, since the Plant represents you both together.
  const { level } = levelProgress(plantXp(growth));
  const stage = stageForLevel(level);
  const multiplier = currentMultiplier(growth);

  return (
    <div className="page">
      <section className="nido-hero" aria-label="Greeting">
        <NidoScene />
        <div className="nido-hero-inner">
          <p className="nido-eyebrow">Il nostro nido</p>
          <h1>Buongiorno, {user}</h1>
          <p className="nido-sub">Where we're headed together — and what's on the list today.</p>
          <div className="nido-badges">
            <span className="nido-badge">{stage.icon} {stage.label} · Lv. {level} / {MAX_LEVEL}</span>
            <span className="nido-badge">⚡ Growth {multiplier}×</span>
            <span className="nido-badge">✅ {tasksDone} {tasksDone === 1 ? 'task' : 'tasks'} done</span>
          </div>
        </div>
      </section>

      <HomeTasks user={user} {...ticketsApi} />
    </div>
  );
}
