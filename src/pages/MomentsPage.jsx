import { useLiveNow } from '../hooks/useLiveNow.js';
import { MILESTONES, formatDate, getDurationParts, getNextMonthlyAnniversary } from '../lib/moments.js';
import './MomentsPage.css';

const ACCENTS = ['lavender', 'pink', 'mint', 'gold'];

export default function MomentsPage() {
  const now = useLiveNow();

  return (
    <div className="page">
      <div className="page-header">
        <h1>Moments</h1>
        <p>Your bond, visualized — live counters for the time you've shared together.</p>
      </div>

      <div className="moments-grid">
        {MILESTONES.map((milestone, index) => (
          <MomentCard key={milestone.id} milestone={milestone} now={now} accent={ACCENTS[index % ACCENTS.length]} />
        ))}
        <FutureMomentCard accent={ACCENTS[MILESTONES.length % ACCENTS.length]} />
      </div>
    </div>
  );
}

function MomentCard({ milestone, now, accent }) {
  const date = new Date(milestone.date);
  const since = getDurationParts(date, now);
  const nextAnniversary = getNextMonthlyAnniversary(date, now);
  const untilAnniversary = getDurationParts(now, nextAnniversary);

  return (
    <article className={`moment-card moment-card--${accent}`}>
      <span className="moment-icon">{milestone.icon}</span>
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
