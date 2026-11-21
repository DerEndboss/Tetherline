import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'docs/screenshots/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // The 3D art kit and models run in the browser (headless Chromium, scripts/art.mjs).
    files: ['art3d/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Scripts run in Node but pass callbacks to page.evaluate, which run in the browser.
    files: ['scripts/**/*.{ts,mjs,js}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      complexity: ['warn', 10],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Offline 3D model code (npm run art): long declarative part lists with per-level branches, never shipped to the game.
    files: ['art3d/**/*.ts'],
    rules: { complexity: 'off' },
  },
);
