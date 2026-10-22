import js from '@eslint/js';
import expo from 'eslint-config-expo/flat.js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.expo/**', '.cache/**', 'dist/**', 'dist-android/**', 'server/dist/**', 'coverage/**', 'graphify-out/**', 'supabase/functions/**'] },
  js.configs.recommended,
  ...expo,
  ...tseslint.configs.recommended,
  // eslint-config-expo's TypeScript block keeps only the node resolver, which does not know the @/ alias.
  { files: ['**/*.ts', '**/*.tsx'], settings: { 'import/resolver': { typescript: { project: './tsconfig.json' }, node: true } } },
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], 'import/no-named-as-default-member': 'off' } },
);
