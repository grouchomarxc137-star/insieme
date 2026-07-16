import PDFDocument from 'pdfkit';
import { questionsForType, typeLabel } from '../src/lib/checkin.js';
import { PARTICIPANTS } from './checkinRepo.js';

// Pulled from src/index.css so the PDF reads as part of the same app rather
// than a generic document.
const THEME = {
  bg: '#fbf6ef',
  text: '#4a4453',
  textMuted: '#8a8296',
  border: '#ede6da',
  lavender: '#8f6fd6',
  pink: '#d9527a',
  gold: '#b8842a',
};

const MARGIN = 48;

function contentWidth(doc) {
  return doc.page.width - MARGIN * 2;
}

function responseText(response) {
  if (!response) return 'No answer';
  const choice = (response.choice || '').trim();
  const detail = (response.detail || '').trim();
  const parts = [choice, detail].filter(Boolean);
  return parts.length ? parts.join(' — ') : 'No answer';
}

function ensureSpace(doc, neededHeight) {
  if (doc.y + neededHeight > doc.page.height - MARGIN) {
    doc.addPage();
  }
}

function drawHeading(doc, question) {
  const width = contentWidth(doc);
  doc.font('Helvetica-Bold').fontSize(13);
  const titleHeight = doc.heightOfString(question.label, { width });
  let descriptionHeight = 0;
  if (question.description) {
    doc.font('Helvetica').fontSize(9);
    descriptionHeight = doc.heightOfString(question.description, { width }) + 4;
  }
  ensureSpace(doc, titleHeight + descriptionHeight + 26);

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(THEME.gold).text(question.label, MARGIN, doc.y, { width });
  if (question.description) {
    doc.moveDown(0.15);
    doc.font('Helvetica').fontSize(9).fillColor(THEME.textMuted).text(question.description, MARGIN, doc.y, { width });
  }
  doc.moveDown(0.5);
}

function drawQuestion(doc, question, responsesByParticipant) {
  const width = contentWidth(doc);
  const colGap = 20;
  const colWidth = (width - colGap) / 2;

  doc.font('Helvetica-Bold').fontSize(10.5);
  const labelHeight = doc.heightOfString(question.label, { width });

  doc.font('Helvetica').fontSize(9.5);
  const answerHeights = PARTICIPANTS.map((name) =>
    doc.heightOfString(responseText(responsesByParticipant[name]?.[question.id]), { width: colWidth })
  );
  const blockHeight = labelHeight + 6 + 14 + Math.max(...answerHeights) + 20;
  ensureSpace(doc, blockHeight);

  const startY = doc.y;
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(THEME.text).text(question.label, MARGIN, startY, { width });

  const rowY = doc.y + 6;
  PARTICIPANTS.forEach((name, index) => {
    const x = MARGIN + index * (colWidth + colGap);
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(index === 0 ? THEME.lavender : THEME.pink)
      .text(name.toUpperCase(), x, rowY, { width: colWidth, characterSpacing: 0.5 });
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(THEME.text)
      .text(responseText(responsesByParticipant[name]?.[question.id]), x, rowY + 13, { width: colWidth });
  });

  doc.y = rowY + 13 + Math.max(...answerHeights) + 12;
  doc.moveTo(MARGIN, doc.y).lineTo(doc.page.width - MARGIN, doc.y).strokeColor(THEME.border).lineWidth(1).stroke();
  doc.moveDown(0.7);
}

export function buildCheckinPdf({ type, periodLabel, responses }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const paintBackground = () => doc.rect(0, 0, doc.page.width, doc.page.height).fill(THEME.bg);
    paintBackground();
    doc.on('pageAdded', paintBackground);

    const width = contentWidth(doc);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(THEME.text).text(typeLabel(type), MARGIN, MARGIN, { align: 'center', width });
    doc.moveDown(0.3);
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(THEME.textMuted)
      .text(`${periodLabel} — Principe & Principessa`, MARGIN, doc.y, { align: 'center', width });
    doc.moveDown(1.2);

    for (const question of questionsForType(type)) {
      if (question.type === 'heading') {
        drawHeading(doc, question);
      } else {
        drawQuestion(doc, question, responses);
      }
    }

    doc.end();
  });
}
