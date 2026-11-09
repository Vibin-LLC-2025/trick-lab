import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // The asset pipeline runs in Node (tsx), not the browser.
  { files: ['scripts/**/*.ts', 'playwright.config.ts'], languageOptions: { globals: globals.node } },
  // The browser checks (npm run test:browser) run in Node and evaluate code in the page.
  { files: ['browser/**/*.ts'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
);
