import { defineConfig } from 'vite';

// GitHub Pages serves this project at https://<user>.github.io/jungleGame/, so
// production builds need that base path; the dev server stays at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/jungleGame/' : '/',
  server: {
    // PORT lets the preview harness assign a free port when 5173 is taken
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
}));
