import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Fixed port for `npm run preview` (the scripts that drive a preview build use GB_PORT, default 4340). */
export const PREVIEW_PORT = 4317;

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: PREVIEW_PORT, strictPort: true },
  build: {
    target: 'es2022',
    // PixiJS alone is ~500 kB minified; one chunk is fine for a game that needs it on frame one.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'art3d/**/*.test.ts'],
    environment: 'node',
  },
});
