import PixelCharacter from '../components/PixelCharacter.jsx';
import DiscordSendPanel from '../components/DiscordSendPanel.jsx';
import {
  useGrowth,
  levelProgress,
  characterStageForLevel,
  characterXp,
  CHARACTER_STAGE_LEVELS,
  MAX_LEVEL,
} from '../lib/growth.js';
import { statusOptionsForUser, EMERGENCY_MOOD_OPTIONS } from '../lib/statusOptions.js';
import './CharacterPage.css';

const STAGE_LABELS = {
  principe: ['Fofinho', 'Bello', 'Prezioso', 'Tesorino', 'Principe'],
  principessa: ['Fofinha', 'Bella', 'Preziosa', 'Tesorina', 'Principessa'],
};

export default function CharacterPage({ user }) {
  const gender = user === 'Principessa' ? 'principessa' : 'principe';
  const growth = useGrowth();
  // Each person's own level: their personal-task XP plus the full shared pot
  // (relationship/monthly-shared/quick-log XP counts for both of you).
  const { level, isMax, xpIntoLevel, xpForNext, progress } = levelProgress(characterXp(growth, user));
  const stage = characterStageForLevel(level);
  const stageLabels = STAGE_LABELS[gender];

  return (
    <div className="page">
      <div className="page-header">
        <h1>Character</h1>
        <p>Playing as {user} — full customization coming soon.</p>
      </div>

      <div className="stage-card">
        <div className="stage-sky">
          <PixelCharacter className="stage-sprite" gender={gender} stage={stage} />
        </div>
        <div className="stage-ground" />
      </div>

      <div className="evolution-row">
        {stageLabels.map((label, index) => {
          const stageNumber = index + 1;
          const rangeStart = (stageNumber - 1) * CHARACTER_STAGE_LEVELS + 1;
          const rangeEnd = Math.min(stageNumber * CHARACTER_STAGE_LEVELS, MAX_LEVEL);
          const status = stageNumber === stage ? ' is-current' : stageNumber < stage ? ' is-reached' : '';
          return (
            <div key={label} className={`evolution-step${status}`}>
              <span className="evolution-step-number">
                Lv. {rangeStart}–{rangeEnd}
              </span>
              <span className="evolution-step-label">{label}</span>
            </div>
          );
        })}
      </div>

      <div className="stat-row">
        <div className="stat-pill">
          <span className="stat-label pixel-font">Lv. {level}</span>
        </div>
        <div className="xp-bar">
          <div className="xp-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
      <p className="xp-progress-note">
        {isMax ? `Max level reached — ${characterXp(growth, user)} XP total` : `${xpIntoLevel} / ${xpForNext} XP to next level`}
      </p>

      <button type="button" className="customize-btn" disabled>
        Customize (coming soon)
      </button>

      <DiscordSendPanel
        title="Status"
        subtitle="Let each other know before they ping you."
        options={statusOptionsForUser(user)}
        user={user}
        messageLabel="status"
        emojiKind="status"
      />

      <DiscordSendPanel
        title="Emergency Mood"
        subtitle="Signal when you need extra care, right now."
        options={EMERGENCY_MOOD_OPTIONS}
        user={user}
        messageLabel="emergency"
        emojiKind="emergency"
        cancelable
      />
    </div>
  );
}
