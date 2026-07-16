// Ported from personal/lovissimi's server/nest/pdfSummary.js, restyled with
// insieme's own palette (src/index.css) instead of lovissimi's peach theme,
// and using pdfkit's built-in fonts instead of bundling Pixelify Sans files —
// dense body text in a display/pixel font is hard to read (see the Moments
// page counters, same lesson applied here).
import PDFDocument from 'pdfkit';

const THEME = {
  bgTop: '#fbf6ef',
  bgBottom: '#fdf6f8',
  surface: '#ffffff',
  text: '#4a4453',
  textStrong: '#332f3b',
  textSubtle: '#8a8296',
  primary: '#c3adf0',
  primaryDark: '#9f7fe0',
  gold: '#f0c36b',
  secondaryBg: '#f6c6d0',
  secondaryText: '#a13f5e',
  borderStrong: '#ede6da',
  shadow: '#ede6da',
  success: '#5a9c74',
  successBg: '#eaf6ec',
  warn: '#b8842a',
  warnBg: '#fff6e2',
  radius: 6,
};

const SUFFICIENCY_LABEL = {
  satisfied: 'Just right',
  partial: 'Almost there',
  not_needed: 'Not quite it',
};

// A little pixel heart, drawn as plain rectangles — no font dependency.
const HEART = ['.HH.HH.', 'HHHHHHH', 'HHHHHHH', '.HHHHH.', '..HHH..', '...H...'];

const MARGIN = 40;
const CARD_PAD = 18;
const CARD_GAP = 16;
const SHADOW_OFFSET = 5;
const BORDER_WIDTH = 2;
const LABEL_SPACING = 1;

function finalAcknowledgment(emotion) {
  return emotion.acknowledgments.find((a) => a.accepted) || emotion.acknowledgments.at(-1) || null;
}

function finalReassurance(emotion) {
  return emotion.reassurances.at(-1) || null;
}

function paintBackground(doc) {
  const gradient = doc.linearGradient(0, 0, 0, doc.page.height);
  gradient.stop(0, THEME.bgTop).stop(1, THEME.bgBottom);
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(gradient);
  doc.restore();
}

function textBlock(ctx, { text, font, size, color, x, y, width, measure, align, characterSpacing = 0, lineGap = 2 }) {
  const opts = { width, align, characterSpacing, lineGap };
  ctx.doc.font(font).fontSize(size);
  const height = ctx.doc.heightOfString(text, opts);
  if (!measure) ctx.doc.fillColor(color).text(text, x, y, opts);
  return height;
}

function pillMetrics(ctx, label) {
  ctx.doc.font(ctx.bold).fontSize(8);
  return { width: ctx.doc.widthOfString(label) + 16, height: 16 };
}

function drawPill(ctx, { label, fg, bg, x, y }) {
  const { doc } = ctx;
  const { width, height } = pillMetrics(ctx, label);
  doc.save();
  doc.lineWidth(1.5);
  doc.roundedRect(x, y, width, height, THEME.radius).fillAndStroke(bg, fg);
  doc.fillColor(fg).font(ctx.bold).fontSize(8).text(label, x, y + 4.5, { width, align: 'center' });
  doc.restore();
}

function summaryBlock(ctx, { label, body, x, y, width, measure }) {
  let cursor = y;
  cursor += textBlock(ctx, {
    text: label.toUpperCase(),
    font: ctx.bold,
    size: 7.5,
    color: THEME.textSubtle,
    characterSpacing: LABEL_SPACING,
    x,
    y: cursor,
    width,
    measure,
  });
  cursor += 3;
  cursor += textBlock(ctx, { text: body, font: ctx.regular, size: 10.5, color: THEME.text, x, y: cursor, width, measure });
  return cursor - y;
}

function drawHearts(ctx, { centerX, y, count = 3, px = 3, gap = 8 }) {
  const { doc } = ctx;
  const heartWidth = HEART[0].length * px;
  let x = centerX - (count * heartWidth + (count - 1) * gap) / 2;
  doc.save();
  for (let i = 0; i < count; i += 1) {
    HEART.forEach((row, ry) => {
      [...row].forEach((ch, rx) => {
        if (ch === 'H') doc.rect(x + rx * px, y + ry * px, px + 0.1, px + 0.1).fill(THEME.gold);
      });
    });
    x += heartWidth + gap;
  }
  doc.restore();
}

function headerContent(ctx, { session }, x, y, width, measure) {
  let cursor = y;
  if (!measure) drawHearts(ctx, { centerX: x + width / 2, y: cursor });
  cursor += HEART.length * 3 + 12;
  cursor += textBlock(ctx, {
    text: 'Reset Room Summary',
    font: ctx.bold,
    size: 19,
    color: THEME.textStrong,
    align: 'center',
    x,
    y: cursor,
    width,
    measure,
  });
  cursor += 6;
  cursor += textBlock(ctx, {
    text: `${session.initiatorName} & ${session.responderName}`,
    font: ctx.bold,
    size: 11,
    color: THEME.primaryDark,
    align: 'center',
    x,
    y: cursor,
    width,
    measure,
  });
  cursor += 4;
  cursor += textBlock(ctx, {
    text: `Completed ${new Date().toLocaleString()}`,
    font: ctx.regular,
    size: 9,
    color: THEME.textSubtle,
    align: 'center',
    x,
    y: cursor,
    width,
    measure,
  });
  return cursor - y;
}

function emotionContent(ctx, emotion, index, x, y, width, measure) {
  let cursor = y;

  const stillOpen = emotion.status === 'still_open';
  const pill = stillOpen
    ? { label: 'Still open', fg: THEME.warn, bg: THEME.warnBg }
    : { label: 'Settled', fg: THEME.success, bg: THEME.successBg };
  const pillSize = pillMetrics(ctx, pill.label);

  const titleHeight = textBlock(ctx, {
    text: `${index + 1}. ${emotion.text}`,
    font: ctx.bold,
    size: 13,
    color: THEME.textStrong,
    x,
    y: cursor,
    width: width - pillSize.width - 12,
    measure,
  });
  if (!measure) drawPill(ctx, { ...pill, x: x + width - pillSize.width, y: cursor });
  cursor += Math.max(titleHeight, pillSize.height);

  if (emotion.context) {
    cursor += 6;
    cursor += textBlock(ctx, { text: emotion.context, font: ctx.regular, size: 10, color: THEME.textSubtle, x, y: cursor, width, measure });
  }

  if (emotion.intensity != null) {
    cursor += 8;
    const chip = { label: `Intensity ${emotion.intensity}/10`, fg: THEME.secondaryText, bg: THEME.secondaryBg };
    if (!measure) drawPill(ctx, { ...chip, x, y: cursor });
    cursor += pillMetrics(ctx, chip.label).height;
  }

  const ack = finalAcknowledgment(emotion);
  if (ack) {
    cursor += 12;
    cursor += summaryBlock(ctx, { label: 'Acknowledgment', body: ack.text, x, y: cursor, width, measure });
  }

  const reassurance = finalReassurance(emotion);
  if (reassurance && !reassurance.skipped) {
    cursor += 12;
    cursor += summaryBlock(ctx, { label: 'Reassurance', body: reassurance.text, x, y: cursor, width, measure });
    if (reassurance.sufficiency) {
      cursor += 3;
      cursor += textBlock(ctx, {
        text: SUFFICIENCY_LABEL[reassurance.sufficiency] || '',
        font: ctx.regular,
        size: 8.5,
        color: THEME.textSubtle,
        x,
        y: cursor,
        width,
        measure,
      });
    }
  }

  if (emotion.agreement) {
    cursor += 12;
    const boxPad = 10;
    const innerWidth = width - boxPad * 2;
    let innerHeight = summaryBlock(ctx, { label: 'Agreement', body: emotion.agreement.text, x: x + boxPad, y: cursor + boxPad, width: innerWidth, measure: true });
    innerHeight += 4;
    innerHeight += textBlock(ctx, {
      text: `Saved ${new Date(emotion.agreement.created_at).toLocaleString()}`,
      font: ctx.regular,
      size: 8,
      color: THEME.textSubtle,
      x: x + boxPad,
      y: 0,
      width: innerWidth,
      measure: true,
    });
    if (!measure) {
      ctx.doc.save();
      ctx.doc.lineWidth(1.5);
      ctx.doc
        .roundedRect(x, cursor, width, innerHeight + boxPad * 2, THEME.radius)
        .fillAndStroke(THEME.secondaryBg, THEME.borderStrong);
      ctx.doc.restore();
      let innerCursor = cursor + boxPad;
      innerCursor += summaryBlock(ctx, { label: 'Agreement', body: emotion.agreement.text, x: x + boxPad, y: innerCursor, width: innerWidth, measure: false });
      innerCursor += 4;
      textBlock(ctx, {
        text: `Saved ${new Date(emotion.agreement.created_at).toLocaleString()}`,
        font: ctx.regular,
        size: 8,
        color: THEME.textSubtle,
        x: x + boxPad,
        y: innerCursor,
        width: innerWidth,
        measure: false,
      });
    }
    cursor += innerHeight + boxPad * 2;
  }

  return cursor - y;
}

function drawCard(ctx, cursorY, contentFn) {
  const { doc } = ctx;
  const x = MARGIN;
  const width = doc.page.width - MARGIN * 2;
  const contentWidth = width - CARD_PAD * 2;
  const cardHeight = contentFn(0, 0, contentWidth, true) + CARD_PAD * 2;

  let y = cursorY;
  if (y + cardHeight + SHADOW_OFFSET > doc.page.height - MARGIN && y > MARGIN) {
    doc.addPage();
    y = MARGIN;
  }

  doc.save();
  doc.rect(x + SHADOW_OFFSET, y + SHADOW_OFFSET, width, cardHeight).fill(THEME.shadow);
  doc.lineWidth(BORDER_WIDTH);
  doc.roundedRect(x, y, width, cardHeight, THEME.radius).fillAndStroke(THEME.surface, THEME.borderStrong);
  doc.restore();

  contentFn(x + CARD_PAD, y + CARD_PAD, contentWidth, false);
  return y + cardHeight + SHADOW_OFFSET + CARD_GAP;
}

export function buildResetRoomSummaryPdf({ session, emotions }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ctx = { doc, regular: 'Helvetica', bold: 'Helvetica-Bold' };

    paintBackground(doc);
    doc.on('pageAdded', () => paintBackground(doc));

    let cursorY = MARGIN;
    cursorY = drawCard(ctx, cursorY, (x, y, width, measure) => headerContent(ctx, { session }, x, y, width, measure));
    emotions.forEach((emotion, index) => {
      cursorY = drawCard(ctx, cursorY, (x, y, width, measure) => emotionContent(ctx, emotion, index, x, y, width, measure));
    });

    doc.end();
  });
}
