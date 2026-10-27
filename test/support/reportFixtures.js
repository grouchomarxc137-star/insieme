import { questionsForType } from '../../src/lib/checkin.js';

export function reportFixtures() {
  const checkin = (type) => {
    const answers = Object.fromEntries(questionsForType(type).filter((q) => q.id).map((q) => [q.id, {
      choice: q.type === 'scale' ? '4' : q.type === 'choice_text' ? 'Yes' : '',
      detail: q.type === 'scale' ? '' : 'Thank you, amore 💛 🌿. We listened and made time for each other. '.repeat(3),
    }]));
    return { type, periodLabel: 'October 27, 2026', responses: { Principe: answers, Principessa: answers } };
  };
  return [
    { name: 'daily', kind: 'checkin', payload: checkin('daily'), module: 'checkinPdf.js', builder: 'buildCheckinPdf' },
    { name: 'weekly', kind: 'checkin', payload: checkin('weekly'), module: 'checkinPdf.js', builder: 'buildCheckinPdf' },
    {
      name: 'monthly', kind: 'monthly-heatmap', module: 'monthlyHeatmapPdf.js', builder: 'buildMonthlyHeatmapPdf',
      payload: {
        monthKey: '2026-09',
        days: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, '0')}`, {
          Principe: { rating: i % 5 + 1 }, Principessa: { rating: (i + 2) % 5 + 1 },
        }])),
      },
    },
    {
      name: 'reset', kind: 'reset-room', module: 'resetRoomPdf.js', builder: 'buildResetRoomSummaryPdf',
      payload: {
        session: { initiatorName: 'Principe', responderName: 'Principessa' },
        emotions: Array.from({ length: 6 }, (_, i) => ({
          text: `Feeling ${i + 1}: wanting more time together`, context: 'A busy week.', intensity: 3,
          status: i === 5 ? 'still_open' : 'resolved',
          acknowledgments: [{ text: 'I hear that you need more time together.', accepted: true }],
          reassurances: [{ text: 'We will make time this week.', skipped: false, sufficiency: 'satisfied' }],
          agreement: { text: 'A walk together this evening.' },
        })),
      },
    },
  ];
}
