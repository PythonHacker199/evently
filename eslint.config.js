import js from '@eslint/js';
import globals from 'globals';

/** Lint rules for the server, its tests and the classic planner. The React app in web/ has its own config. */
export default [
  { ignores: ['web/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-shadow': 'error',
      'no-implicit-coercion': ['error', { allow: ['!!'] }],
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      'no-return-assign': 'error',
      curly: ['error', 'multi-line'],
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
];
