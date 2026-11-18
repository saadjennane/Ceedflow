import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        /* React et le routeur à part : ils changent rarement, le navigateur les
           garde d'une mise en ligne à l'autre. AG Grid aussi, chargé avec sa page. */
        manualChunks: (id) => {
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react';
          if (id.includes('node_modules/ag-grid-')) return 'ag-grid';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    // Pointable at a throwaway API — a second instance on its own PGLITE_DIR —
    // so the workspace can be exercised without touching the live data.
    proxy: { '/api': process.env.API_ORIGIN ?? 'http://127.0.0.1:4000' },
  },
});
