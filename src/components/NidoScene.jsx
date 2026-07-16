// The "il nido" hero scene: the two of you as plump crowned birds perched on
// a branch, the logo's gold heart between you, morning sun behind. The
// orange bird is Principe, the honey-yellow one Principessa. Animations
// (heart pop, breathing) live in HomePage.css.
function Bird({ body, dark, accent, mirrored }) {
  return (
    <g transform={mirrored ? 'scale(-0.92 0.92)' : 'scale(0.92)'} fill={body}>
      <path d="M38 58 L8 44 L24 80 Z" fill={dark} />
      <path
        d="M28 58 C 28 32 48 20 68 20 C 90 20 104 38 104 60 C 104 84 86 96 64 96 C 44 96 28 82 28 58 Z"
        stroke="var(--text)"
        strokeWidth="2.5"
      />
      <path d="M42 62 C 38 50 46 38 60 36 C 56 48 57 62 64 74 C 54 76 45 71 42 62 Z" fill={dark} />
      <path
        d="M104 54 L 118 60 L 104 67 Z"
        fill={accent}
        stroke="var(--text)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="84" cy="48" r="4.5" fill="var(--text)" />
      <circle cx={mirrored ? 82.4 : 85.6} cy="46.4" r="1.5" fill="#fff" />
      <circle cx="88" cy="62" r="6" fill={accent} opacity="0.5" />
      <path
        d="M62 20 L65 8 L73 15 L80 5 L87 15 L95 8 L97 20 Z"
        fill={accent}
        stroke="var(--text)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M58 96 L58 106 M74 96 L74 106" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

export default function NidoScene() {
  return (
    <svg className="nido-scene" viewBox="0 0 880 246" aria-hidden="true" focusable="false">
      {/* morning sun */}
      <circle cx="440" cy="235" r="115" fill="#fbe7b4" opacity="0.8" />
      <circle cx="440" cy="235" r="78" fill="#fadf9c" opacity="0.7" />
      {/* clouds */}
      <g fill="#ffffff" opacity="0.85">
        <ellipse cx="120" cy="58" rx="34" ry="13" />
        <ellipse cx="148" cy="50" rx="22" ry="10" />
        <ellipse cx="742" cy="84" rx="30" ry="12" />
        <ellipse cx="766" cy="76" rx="19" ry="9" />
      </g>
      {/* branch */}
      <path
        d="M-10 208 Q 220 196 440 202 Q 660 208 890 198"
        fill="none"
        stroke="var(--text)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <g fill="var(--mint-strong)">
        <ellipse cx="180" cy="196" rx="12" ry="5.5" transform="rotate(-24 180 196)" />
        <ellipse cx="700" cy="196" rx="12" ry="5.5" transform="rotate(20 700 196)" />
      </g>

      {/* the heart between them, from the logo */}
      <g className="nido-heart">
        <path
          d="M440 148 C 429 137 420 130.5 420 121 C 420 113.5 426 110 431 110
             C 434.8 110 438.6 112.4 440 116 C 441.4 112.4 445.2 110 449 110
             C 454 110 460 113.5 460 121 C 460 130.5 451 137 440 148 Z"
          fill="var(--gold)"
          stroke="var(--text)"
          strokeWidth="2.5"
        />
      </g>

      {/* Principe: the orange one */}
      <g className="nido-bird">
        <g transform="translate(268 108)">
          <Bird body="var(--arancia)" dark="var(--arancia-strong)" accent="var(--gold)" />
        </g>
      </g>
      {/* Principessa: the honey-yellow one */}
      <g className="nido-bird nido-bird--east">
        <g transform="translate(612 108)">
          <Bird body="var(--gold)" dark="var(--gold-strong)" accent="var(--arancia)" mirrored />
        </g>
      </g>
    </svg>
  );
}
