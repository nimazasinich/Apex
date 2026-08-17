import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      cssCodeSplit: true,
      chunkSizeWarningLimit: 550,
      rollupOptions: {
        output: {
          // Return a chunk name only for modules that are actually present in
          // the graph. This avoids Rollup creating empty forced chunks such as
          // the previous `vendor-motion` warning when Motion is not imported.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/react/') || id.includes('/react-dom/')) return 'vendor-react';
            if (id.includes('/lucide-react/')) return 'vendor-icons';
            if (id.includes('/recharts/') || id.includes('/d3/') || id.includes('/d3-') || id.includes('/victory-vendor/')) return 'vendor-charts';
            if (id.includes('/motion/')) return 'vendor-motion';
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // `npm run dev` serves UI + API from Express on one origin. This proxy
      // also keeps direct/standalone Vite sessions functional when the APEX
      // backend is already running on port 3000.
      proxy: {
        '/api': {
          target: process.env.APEX_API_ORIGIN || 'http://127.0.0.1:3000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/tests/**/*.test.ts', 'tests/**/*.test.ts'],
      setupFiles: ['dotenv/config'],
    },
  };
});
