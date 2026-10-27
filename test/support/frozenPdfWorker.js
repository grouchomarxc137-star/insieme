const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [Date.UTC(2026, 9, 27, 12)]));
  }
  static now() { return RealDate.UTC(2026, 9, 27, 12); }
};
await import('../../server/pdfWorker.js');
