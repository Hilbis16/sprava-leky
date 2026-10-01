import js from '@eslint/js';
import expo from 'eslint-config-expo/flat.js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.expo/**', 'dist/**', 'dist-android/**', 'coverage/**', 'graphify-out/**', 'supabase/functions/**'] },
  js.configs.recommended,
  ...expo,
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], 'import/no-named-as-default-member': 'off' } },
);
