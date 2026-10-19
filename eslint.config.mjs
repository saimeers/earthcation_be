import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import functional from 'eslint-plugin-functional'

// JS de v1: base mínima mientras se migra. TS nuevo: estilo funcional y funciones pequeñas (fase 3).
export default tseslint.config(
  { ignores: ['node_modules/', 'coverage/', '.deploy/', 'dist/'] },
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
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, functional.configs.lite],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'max-lines-per-function': ['error', { max: 10, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 5],
      'max-params': ['error', 3],
      'max-depth': ['error', 2],
      'no-param-reassign': ['error', { props: true }],
      'prefer-const': 'error',
      'functional/no-let': 'error',
      'functional/immutable-data': 'error',
      'functional/no-classes': 'error',
      'functional/no-throw-statements': 'error',
      'functional/no-loop-statements': 'error',
      // Reglas de lite que chocan con Express/Sequelize en los adaptadores; el dominio ya es puro por diseño
      'functional/functional-parameters': 'off',
      'functional/no-mixed-types': 'off',
      'functional/prefer-immutable-types': 'off',
      'functional/no-return-void': 'off',
      'functional/no-conditional-statements': 'off',
      'functional/no-expression-statements': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // El borde del proceso sí puede terminar la ejecución
    files: ['src/main.ts'],
    rules: { 'functional/no-throw-statements': 'off' },
  },
)
