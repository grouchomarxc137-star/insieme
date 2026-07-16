const rect = (x, y, w, h, fill) => ({ shape: 'rect', x, y, w, h, fill });
const poly = (points, fill) => ({ shape: 'poly', points, fill });

// Builds the full list of shapes for a given gender ('principe' | 'principessa')
// and evolution stage (1-5). Stage 1 is the plainest; each stage after that
// adds a more distinctly royal marker (crown, cape, gendered silhouette).
// Stage 5, the Principe/Principessa endgame, reuses stage 4's full regalia
// plus an extra sparkle flourish so it reads as a step up, not a repeat.
function buildLayers(gender, stage) {
  const isPrincipessa = gender === 'principessa';
  const tunic = isPrincipessa ? 'var(--pink)' : 'var(--tunic)';
  const tunicDark = isPrincipessa ? 'var(--pink-strong)' : 'var(--tunic-dark)';
  const cape = isPrincipessa ? 'var(--cape-principessa)' : 'var(--cape-principe)';
  const jewel = isPrincipessa ? 'var(--jewel)' : 'var(--jewel-principe)';

  const layers = [];

  // crown — absent at stage 1, grows more ornate each stage after
  if (stage === 2) {
    layers.push(rect(30, 10, 40, 10, 'var(--crown)'));
  } else if (stage === 3) {
    layers.push(rect(30, 0, 10, 10, 'var(--crown)'));
    layers.push(rect(60, 0, 10, 10, 'var(--crown)'));
    layers.push(rect(30, 10, 40, 10, 'var(--crown)'));
    layers.push(rect(45, 10, 10, 10, jewel));
  } else if (stage >= 4) {
    layers.push(rect(28, 0, 8, 10, 'var(--crown)'));
    layers.push(rect(46, 0, 8, 10, 'var(--crown)'));
    layers.push(rect(64, 0, 8, 10, 'var(--crown)'));
    layers.push(rect(28, 10, 44, 10, 'var(--crown)'));
    layers.push(rect(44, 8, 12, 12, jewel));
    layers.push(rect(33, 12, 4, 4, 'var(--gold-strong)'));
    layers.push(rect(63, 12, 4, 4, 'var(--gold-strong)'));
    if (stage === 5) {
      layers.push(rect(14, 6, 6, 6, 'var(--gold-strong)'));
      layers.push(rect(80, 6, 6, 6, 'var(--gold-strong)'));
      layers.push(rect(6, 18, 5, 5, 'var(--gold)'));
      layers.push(rect(89, 18, 5, 5, 'var(--gold)'));
    }
  }

  // hair top — Principe keeps it short with a slightly uneven, curl-suggesting
  // hairline; Principessa's is smooth and full-width
  if (isPrincipessa) {
    layers.push(rect(20, 20, 60, 10, 'var(--hair)'));
  } else {
    layers.push(rect(20, 20, 15, 10, 'var(--hair)'));
    layers.push(rect(35, 16, 10, 14, 'var(--hair)'));
    layers.push(rect(45, 18, 10, 12, 'var(--hair)'));
    layers.push(rect(55, 16, 10, 14, 'var(--hair)'));
    layers.push(rect(65, 20, 15, 10, 'var(--hair)'));
  }

  // forehead row
  layers.push(rect(20, 30, 10, 10, 'var(--hair)'));
  layers.push(rect(30, 30, 40, 10, 'var(--skin)'));
  layers.push(rect(70, 30, 10, 10, 'var(--hair)'));

  // eyes row
  layers.push(rect(20, 40, 10, 10, 'var(--hair)'));
  layers.push(rect(30, 40, 40, 10, 'var(--skin)'));
  layers.push(rect(70, 40, 10, 10, 'var(--hair)'));
  layers.push(rect(37, 42, 6, 6, 'var(--eye)'));
  layers.push(rect(57, 42, 6, 6, 'var(--eye)'));

  // cheeks row — Principe's hair is cropped shorter here, showing more face
  if (isPrincipessa) {
    layers.push(rect(20, 50, 10, 10, 'var(--hair)'));
    layers.push(rect(30, 50, 40, 10, 'var(--skin)'));
    layers.push(rect(70, 50, 10, 10, 'var(--hair)'));
    layers.push(rect(48, 49, 4, 3, 'var(--nose-stud)'));
  } else {
    layers.push(rect(20, 50, 60, 10, 'var(--skin)'));
  }
  layers.push(rect(32, 52, 8, 6, 'var(--blush)'));
  layers.push(rect(60, 52, 8, 6, 'var(--blush)'));

  // neck — Principessa's hair drapes down past it; Principe grows stubble
  // from stage 3 on
  layers.push(rect(40, 60, 20, 10, 'var(--skin)'));
  if (isPrincipessa) {
    layers.push(rect(20, 60, 10, 10, 'var(--hair)'));
    layers.push(rect(70, 60, 10, 10, 'var(--hair)'));
  } else if (stage >= 3) {
    layers.push(rect(36, 57, 28, 5, 'var(--stubble)'));
  }

  // cape — appears behind the shoulders from stage 3 on, gets a gold trim at 4+
  if (stage === 3) {
    layers.push(rect(10, 70, 10, 30, cape));
    layers.push(rect(80, 70, 10, 30, cape));
  } else if (stage >= 4) {
    layers.push(rect(5, 65, 15, 40, cape));
    layers.push(rect(80, 65, 15, 40, cape));
    layers.push(rect(18, 65, 2, 40, 'var(--gold)'));
    layers.push(rect(80, 65, 2, 40, 'var(--gold)'));
  }

  // shoulders — Principessa's hair drapes further down over them
  layers.push(rect(20, 70, 60, 10, tunic));
  if (isPrincipessa) {
    layers.push(rect(10, 70, 10, 10, 'var(--hair)'));
    layers.push(rect(80, 70, 10, 10, 'var(--hair)'));
  }

  // torso
  layers.push(rect(20, 80, 10, 10, tunic));
  layers.push(rect(30, 80, 40, 10, tunic));
  layers.push(rect(70, 80, 10, 10, tunic));

  layers.push(rect(20, 90, 10, 10, 'var(--skin)'));
  layers.push(rect(30, 90, 40, 10, tunic));
  layers.push(rect(70, 90, 10, 10, 'var(--skin)'));

  // belt
  layers.push(rect(30, 100, 40, 10, tunicDark));

  // lower body — Principessa's legwear becomes a flared gown from stage 3;
  // Principe stays in trousers throughout
  if (isPrincipessa && stage >= 3) {
    const flare =
      stage >= 4
        ? { topX: 32, topW: 36, botX: 18, botW: 64 }
        : { topX: 35, topW: 30, botX: 25, botW: 50 };
    layers.push(
      poly(
        `${flare.topX},110 ${flare.topX + flare.topW},110 ${flare.botX + flare.botW},140 ${flare.botX},140`,
        tunic
      )
    );
    layers.push(rect(flare.botX, 136, flare.botW, 4, stage >= 4 ? 'var(--gold)' : tunicDark));
  } else {
    layers.push(rect(32, 110, 15, 20, 'var(--legs)'));
    layers.push(rect(53, 110, 15, 20, 'var(--legs)'));
    layers.push(rect(30, 130, 18, 10, 'var(--feet)'));
    layers.push(rect(52, 130, 18, 10, 'var(--feet)'));
  }

  return layers;
}

export default function PixelCharacter({ className, gender = 'principe', stage = 1 }) {
  const layers = buildLayers(gender, stage);

  return (
    <svg
      className={className}
      viewBox="0 0 100 150"
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      {layers.map((layer, index) =>
        layer.shape === 'poly' ? (
          <polygon key={index} points={layer.points} style={{ fill: layer.fill }} />
        ) : (
          <rect key={index} x={layer.x} y={layer.y} width={layer.w} height={layer.h} style={{ fill: layer.fill }} />
        )
      )}
    </svg>
  );
}
