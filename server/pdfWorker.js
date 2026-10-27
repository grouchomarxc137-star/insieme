// This entry point receives only report data. It must not import the web
// server, repositories, Discord client, or any module opening the database.
const renderers = {
  checkin: ['./checkinPdf.js', 'buildCheckinPdf'],
  'monthly-heatmap': ['./monthlyHeatmapPdf.js', 'buildMonthlyHeatmapPdf'],
  'reset-room': ['./resetRoomPdf.js', 'buildResetRoomSummaryPdf'],
};

let finished = false;
process.once('disconnect', () => {
  if (!finished) process.exit(1);
});

function finish(result, exitCode) {
  process.exitCode = exitCode;
  process.send(result, (err) => {
    finished = true;
    if (err) process.exitCode = 1;
    if (process.connected) process.disconnect();
  });
}

process.once('message', async ({ kind, payload }) => {
  try {
    if (!Object.hasOwn(renderers, kind)) throw new Error('Unknown PDF job type');
    const [modulePath, exportName] = renderers[kind];
    const renderer = await import(modulePath);
    const pdf = await renderer[exportName](payload);
    finish({ ok: true, pdf }, 0);
  } catch (err) {
    finish({ ok: false, error: err.message }, 1);
  }
});
