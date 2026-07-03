import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // PORT lets the preview harness assign a free port when 5173 is taken
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
