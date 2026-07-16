import './PlantScene.css';

const BIRDS = [
  { x: 60, y: 30, scale: 1, color: 'var(--bird-orange)', delay: '0s' },
  { x: 140, y: 20, scale: 0.8, color: 'var(--gold)', delay: '0.6s' },
  { x: 220, y: 40, scale: 1.1, color: 'var(--bird-orange)', delay: '1.1s' },
  { x: 262, y: 24, scale: 0.7, color: 'var(--gold)', delay: '0.3s' },
];

const rect = (x, y, w, h, fill) => ({ shape: 'rect', x, y, w, h, fill });
const glow = (cx, cy, rx, ry, fill, opacity) => ({ shape: 'ellipse', cx, cy, rx, ry, fill, opacity });

// The plant itself — eight stages, each visibly bigger/richer than the last,
// all rooted at the same spot so it reads as one plant growing in place.
function buildPlant(stage) {
  if (stage === 1) {
    return [
      rect(94, 150, 22, 6, 'var(--soil)'),
      rect(97, 146, 16, 4, 'var(--soil)'),
      rect(103, 136, 3, 10, 'var(--sprout-stem)'),
      rect(96, 132, 7, 5, 'var(--sprout-leaf)'),
      rect(106, 130, 7, 5, 'var(--sprout-leaf)'),
    ];
  }
  if (stage === 2) {
    return [
      rect(94, 150, 22, 6, 'var(--soil)'),
      rect(97, 146, 16, 4, 'var(--soil)'),
      rect(102, 124, 4, 26, 'var(--sprout-stem)'),
      rect(92, 128, 10, 6, 'var(--sprout-leaf)'),
      rect(108, 126, 10, 6, 'var(--sprout-leaf)'),
      rect(96, 116, 8, 6, 'var(--sprout-leaf)'),
      rect(106, 114, 8, 6, 'var(--sprout-leaf)'),
    ];
  }
  if (stage === 3) {
    return [
      rect(101, 118, 6, 32, 'var(--trunk)'),
      rect(88, 108, 12, 12, 'var(--canopy)'),
      rect(100, 98, 16, 18, 'var(--canopy)'),
      rect(116, 108, 12, 12, 'var(--canopy)'),
      rect(94, 94, 24, 10, 'var(--canopy)'),
    ];
  }
  if (stage === 4) {
    return [
      rect(99, 115, 10, 35, 'var(--trunk)'),
      rect(78, 98, 18, 16, 'var(--canopy)'),
      rect(98, 84, 24, 24, 'var(--canopy)'),
      rect(120, 98, 18, 16, 'var(--canopy)'),
      rect(86, 72, 48, 16, 'var(--canopy)'),
      rect(98, 84, 10, 24, 'var(--canopy-dark)'),
    ];
  }
  if (stage === 5) {
    return [
      rect(96, 112, 14, 38, 'var(--trunk)'),
      rect(68, 92, 22, 20, 'var(--canopy)'),
      rect(94, 74, 32, 32, 'var(--canopy)'),
      rect(126, 92, 22, 20, 'var(--canopy)'),
      rect(78, 58, 60, 20, 'var(--canopy)'),
      rect(94, 74, 14, 32, 'var(--canopy-dark)'),
      rect(76, 96, 4, 4, 'var(--blossom)'),
      rect(90, 80, 4, 4, 'var(--blossom)'),
      rect(108, 70, 4, 4, 'var(--blossom)'),
      rect(122, 84, 4, 4, 'var(--blossom)'),
      rect(134, 98, 4, 4, 'var(--blossom)'),
      rect(100, 92, 4, 4, 'var(--blossom)'),
    ];
  }
  if (stage === 6) {
    return [
      rect(93, 110, 20, 40, 'var(--trunk)'),
      rect(97, 128, 4, 4, 'var(--trunk-dark)'),
      rect(55, 95, 26, 20, 'var(--canopy)'),
      rect(85, 70, 34, 38, 'var(--canopy)'),
      rect(139, 95, 26, 20, 'var(--canopy)'),
      rect(65, 52, 70, 22, 'var(--canopy)'),
      rect(85, 70, 17, 38, 'var(--canopy-dark)'),
      rect(72, 88, 3, 3, 'var(--gold)'),
      rect(120, 64, 3, 3, 'var(--gold)'),
      rect(100, 100, 3, 3, 'var(--gold)'),
    ];
  }
  if (stage === 7) {
    return [
      rect(90, 105, 26, 45, 'var(--trunk)'),
      rect(94, 122, 4, 4, 'var(--trunk-dark)'),
      rect(108, 138, 4, 4, 'var(--trunk-dark)'),
      rect(46, 90, 28, 22, 'var(--canopy)'),
      rect(80, 60, 42, 44, 'var(--canopy)'),
      rect(148, 90, 28, 22, 'var(--canopy)'),
      rect(56, 40, 90, 24, 'var(--canopy)'),
      rect(80, 60, 21, 44, 'var(--canopy-dark)'),
      rect(93, 20, 8, 8, 'var(--crown)'),
      rect(109, 20, 8, 8, 'var(--crown)'),
      rect(91, 28, 24, 8, 'var(--crown)'),
      rect(99, 28, 8, 8, 'var(--jewel)'),
    ];
  }
  // Eternal Tree — the same silhouette family as the earlier stages, but
  // taller, layered with a radiant halo, sunlit canopy edges, ever-blooming
  // blossoms, glowing fruit, a crown at the peak, and a wider starfield.
  return [
    // radiant halo, widest and softest to tightest and brightest
    glow(103, 78, 98, 80, 'var(--gold)', 0.12),
    glow(103, 76, 68, 56, '#ffffff', 0.12),
    glow(103, 74, 44, 38, 'var(--gold)', 0.24),

    // trunk with flared, grounded roots
    rect(86, 96, 34, 54, 'var(--trunk)'),
    rect(90, 116, 4, 4, 'var(--trunk-dark)'),
    rect(108, 134, 4, 4, 'var(--trunk-dark)'),
    rect(96, 128, 4, 4, 'var(--trunk-dark)'),
    rect(72, 144, 18, 6, 'var(--trunk-dark)'),
    rect(130, 144, 18, 6, 'var(--trunk-dark)'),

    // canopy, widest at the base tapering to a high peak
    rect(28, 88, 34, 26, 'var(--canopy)'),
    rect(158, 88, 34, 26, 'var(--canopy)'),
    rect(68, 58, 54, 50, 'var(--canopy)'),
    rect(42, 30, 116, 28, 'var(--canopy)'),
    rect(64, 10, 70, 24, 'var(--canopy)'),
    rect(86, 0, 28, 14, 'var(--canopy)'),

    // shaded underside for depth
    rect(68, 58, 27, 50, 'var(--canopy-dark)'),
    rect(64, 10, 35, 24, 'var(--canopy-dark)'),

    // sunlit gold along every top edge
    rect(42, 30, 116, 6, 'var(--gold)'),
    rect(64, 10, 70, 5, 'var(--gold-strong)'),
    rect(86, 0, 28, 4, 'var(--gold)'),

    // ever-blooming blossoms threaded through the foliage
    rect(38, 96, 4, 4, 'var(--blossom)'),
    rect(162, 96, 4, 4, 'var(--blossom)'),
    rect(54, 70, 4, 4, 'var(--blossom)'),
    rect(148, 66, 4, 4, 'var(--blossom)'),
    rect(78, 40, 4, 4, 'var(--blossom)'),
    rect(122, 36, 4, 4, 'var(--blossom)'),
    rect(100, 16, 4, 4, 'var(--blossom)'),

    // glowing golden fruit
    rect(58, 84, 3, 3, 'var(--gold-strong)'),
    rect(152, 82, 3, 3, 'var(--gold-strong)'),
    rect(88, 96, 3, 3, 'var(--gold-strong)'),
    rect(118, 94, 3, 3, 'var(--gold-strong)'),
    rect(103, 48, 3, 3, 'var(--gold-strong)'),

    // crown of light at the very peak
    rect(99, 2, 8, 6, 'var(--crown)'),
    rect(101, 0, 4, 4, 'var(--jewel)'),

    // wide starfield, well beyond the canopy itself
    rect(18, 48, 4, 4, 'var(--gold)'),
    rect(212, 38, 4, 4, '#ffffff'),
    rect(48, 14, 4, 4, '#ffffff'),
    rect(184, 18, 4, 4, 'var(--gold)'),
    rect(103, 6, 3, 3, '#ffffff'),
    rect(232, 66, 4, 4, 'var(--gold)'),
    rect(8, 88, 4, 4, 'var(--blossom)'),
    rect(252, 52, 4, 4, 'var(--blossom)'),
    rect(270, 90, 3, 3, '#ffffff'),
    rect(6, 60, 3, 3, 'var(--gold)'),
  ];
}

export default function PlantScene({ className, stage = 1 }) {
  const plant = buildPlant(stage);

  return (
    <svg
      className={className}
      viewBox="0 0 320 180"
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="plant-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--scene-sky-top)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--scene-sky-bottom)' }} />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="320" height="150" fill="url(#plant-sky)" />

      {/* far mountains */}
      <polygon points="10,140 70,55 130,140" style={{ fill: 'var(--mtn-far)' }} />
      <polygon points="150,140 215,40 280,140" style={{ fill: 'var(--mtn-far)' }} />
      <polygon points="58,76 70,55 82,76" style={{ fill: '#ffffff', opacity: 0.85 }} />
      <polygon points="201,63 215,40 229,63" style={{ fill: '#ffffff', opacity: 0.85 }} />

      {/* nearer hills */}
      <polygon points="-10,145 60,95 140,145" style={{ fill: 'var(--mtn-near)' }} />
      <polygon points="190,145 260,90 330,145" style={{ fill: 'var(--mtn-near)' }} />

      {/* terrain */}
      <rect x="0" y="134" width="320" height="46" style={{ fill: 'var(--terrain)' }} />
      <rect x="0" y="132" width="320" height="5" style={{ fill: 'var(--terrain-edge)' }} />

      {/* grass tufts */}
      <rect x="36" y="152" width="6" height="4" style={{ fill: 'var(--terrain-edge)' }} />
      <rect x="80" y="162" width="6" height="4" style={{ fill: 'var(--terrain-edge)' }} />
      <rect x="150" y="170" width="6" height="4" style={{ fill: 'var(--terrain-edge)' }} />
      <rect x="270" y="158" width="6" height="4" style={{ fill: 'var(--terrain-edge)' }} />

      {/* lake */}
      <ellipse cx="245" cy="155" rx="38" ry="13" style={{ fill: 'var(--lake-edge)' }} />
      <ellipse cx="243" cy="153" rx="32" ry="10" style={{ fill: 'var(--lake)' }} />
      <rect x="228" y="148" width="6" height="3" style={{ fill: '#ffffff', opacity: 0.7 }} />

      {plant.map((layer, index) =>
        layer.shape === 'ellipse' ? (
          <ellipse
            key={index}
            cx={layer.cx}
            cy={layer.cy}
            rx={layer.rx}
            ry={layer.ry}
            style={{ fill: layer.fill, opacity: layer.opacity }}
          />
        ) : (
          <rect key={index} x={layer.x} y={layer.y} width={layer.w} height={layer.h} style={{ fill: layer.fill }} />
        )
      )}

      {BIRDS.map((bird, i) => (
        <g key={i} transform={`translate(${bird.x}, ${bird.y}) scale(${bird.scale})`}>
          <g className="plant-bird" style={{ animationDelay: bird.delay }}>
            <rect x="-6" y="-2" width="5" height="2" style={{ fill: bird.color }} />
            <rect x="-1.5" y="0" width="3" height="2" style={{ fill: bird.color }} />
            <rect x="1" y="-2" width="5" height="2" style={{ fill: bird.color }} />
          </g>
        </g>
      ))}
    </svg>
  );
}
