process.once('message', ({ payload }) => {
  if (payload.mode === 'crash') process.exit(2);
  if (payload.mode === 'hang') {
    setInterval(() => {}, 1000);
    return;
  }
  process.send({ ok: true, pdf: Buffer.from('%PDF-1.0\n' + process.pid) }, () => process.disconnect());
});
