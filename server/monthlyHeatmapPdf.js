import PDFDocument from 'pdfkit';
import { RATING_COLORS, RATING_LABELS } from '../src/lib/checkin.js';
import { buildMonthGrid, monthLabel, WEEKDAY_INITIALS } from '../src/lib/heatmap.js';
import { PARTICIPANTS } from './checkinRepo.js';
import { THEME } from './checkinPdf.js';

const MARGIN = 48;
const GAP = 6;

function contentWidth(doc) {
  return doc.page.width - MARGIN * 2;
}

// The same diagonal split the web grid draws with a CSS gradient: Principe's
// rating in the top-left triangle, Principessa's in the bottom-right.
function drawDayCell(doc, x, y, size, ratings) {
  const [first, second] = PARTICIPANTS.map((name) => ratings?.[name]?.rating);

  if (first) {
    doc.path(`M ${x} ${y} L ${x + size} ${y} L ${x} ${y + size} Z`).fill(RATING_COLORS[first]);
  }
  if (second) {
    doc
      .path(`M ${x + size} ${y} L ${x + size} ${y + size} L ${x} ${y + size} Z`)
      .fill(RATING_COLORS[second]);
  }

  doc.lineWidth(1).rect(x, y, size, size).strokeColor(THEME.border).stroke();
}

function drawLegend(doc, y) {
  const swatch = 11;
  const gap = 6;
  const itemGap = 16;

  doc.font('Helvetica').fontSize(8.5);
  const items = Object.keys(RATING_COLORS)
    .map(Number)
    .sort((a, b) => a - b)
    .map((rating) => {
      const text = `${rating} ${RATING_LABELS[rating]}`;
      return { rating, text, width: swatch + gap + doc.widthOfString(text) };
    });

  const totalWidth = items.reduce((sum, item) => sum + item.width, 0) + itemGap * (items.length - 1);
  let x = MARGIN + (contentWidth(doc) - totalWidth) / 2;

  for (const item of items) {
    doc.rect(x, y, swatch, swatch).fill(RATING_COLORS[item.rating]);
    doc.rect(x, y, swatch, swatch).strokeColor(THEME.border).lineWidth(0.5).stroke();
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(THEME.textMuted)
      .text(item.text, x + swatch + gap, y + 2, { lineBreak: false });
    x += item.width + itemGap;
  }
}

// The month's grid and nothing else — the title, the squares, and a legend so
// the colors are readable without the app next to it.
export function buildMonthlyHeatmapPdf({ monthKey, days }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.rect(0, 0, doc.page.width, doc.page.height).fill(THEME.bg);

    const width = contentWidth(doc);
    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor(THEME.text)
      .text(monthLabel(monthKey), MARGIN, MARGIN, { align: 'center', width });
    doc.moveDown(1);

    const cell = (width - GAP * 6) / 7;
    let y = doc.y;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(THEME.textMuted);
    WEEKDAY_INITIALS.forEach((initial, index) => {
      doc.text(initial, MARGIN + index * (cell + GAP), y, { width: cell, align: 'center' });
    });
    y += 16;

    for (const week of buildMonthGrid(monthKey)) {
      week.forEach((day, index) => {
        if (!day) return;
        const x = MARGIN + index * (cell + GAP);
        const ratings = days?.[day.dateKey];
        drawDayCell(doc, x, y, cell, ratings);
        // Muted grey disappears against the warmer fills, so rated days get
        // the full-strength text colour.
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(ratings ? THEME.text : THEME.textMuted)
          .text(String(day.day), x + 3, y + 3, { lineBreak: false });
      });
      y += cell + GAP;
    }

    drawLegend(doc, y + 10);

    doc.end();
  });
}
