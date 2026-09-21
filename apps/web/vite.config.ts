import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Pointable at a throwaway API — a second instance on its own PGLITE_DIR —
    // so the workspace can be exercised without touching the live data.
    proxy: { '/api': process.env.API_ORIGIN ?? 'http://127.0.0.1:4000' },
  },
});
