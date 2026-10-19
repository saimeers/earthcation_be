import js from '@eslint/js'
import globals from 'globals'

// Base mínima mientras el código es JS (fase 2). Las reglas funcionales y de tamaño llegan con TypeScript (fase 3).
export default [
  { ignores: ['node_modules/', 'coverage/', '.deploy/'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$|^req$|^res$', caughtErrors: 'none' }] },
  },
  {
    files: ['tests/**/*.js', '**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
]
