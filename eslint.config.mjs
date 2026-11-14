import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint 9 flat configuration for ARVEN TypeScript packages.
 * Individual workspaces can extend or spread this array while preserving strict type/boundary hygiene.
 */
export const baseConfig = tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/generated/**', '**/coverage/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
);

export default baseConfig;
