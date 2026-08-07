// The 👑💛 logo drawn as one mark: a gold heart wearing the crown.
export default function BrandMark({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size * 0.95}
      viewBox="0 0 40 38"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 36 C 13 29 6 24.5 6 17.5 C 6 12 10.2 9.4 14 9.4 C 16.6 9.4 19 11 20 13.4
           C 21 11 23.4 9.4 26 9.4 C 29.8 9.4 34 12 34 17.5 C 34 24.5 27 29 20 36 Z"
        fill="var(--gold)"
        stroke="var(--text)"
        strokeWidth="2"
      />
      <path
        d="M12.5 12.5 L11.5 3.5 L16 7.5 L20 1.5 L24 7.5 L28.5 3.5 L27.5 12.5 Z"
        fill="var(--gold)"
        stroke="var(--text)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
