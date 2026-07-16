import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      // The Discord relay server (see server/index.js) — run it separately
      // in dev with `npm run server`.
      '/api': 'http://localhost:8787',
      // Reset Room's real-time layer — needs ws: true for the websocket upgrade.
      '/socket.io': { target: 'http://localhost:8787', ws: true },
    },
  },
});
