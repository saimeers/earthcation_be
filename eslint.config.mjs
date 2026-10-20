import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import functional from 'eslint-plugin-functional'

// Monorepo de arquitectura limpia (fase 3b):
// - TS de los paquetes: estricto con tipos, clases y throw permitidos (casos de uso, entidades, errores de
//   dominio), métodos cortos. Los límites entre capas los cuidan pnpm y dependency-cruiser.
// - applications/app-service/src/legacy: el código de la fase 3 (estilo funcional) mientras se migra.
// - JS de v1 y pruebas: base mínima.
const SMALL_FUNCTIONS = {
  'max-lines-per-function': ['error', { max: 10, skipBlankLines: true, skipComments: true }],
  complexity: ['error', 5],
  'max-params': ['error', 3],
  'max-depth': ['error', 2],
  'no-param-reassign': ['error', { props: true }],
  'prefer-const': 'error',
  '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
}

const LEGACY = 'applications/app-service/src/legacy/**/*.ts'

export default tseslint.config(
  { ignores: ['**/node_modules/', '**/coverage/', '**/.deploy/', '**/dist/', '.turbo/'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$|^req$|^res$', caughtErrors: 'none' }] },
  },
  {
    files: ['**/test/**/*.js', '**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['**/src/**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: SMALL_FUNCTIONS,
  },
  {
    // Pruebas en TS: reglas sin información de tipos (no forman parte del build de cada paquete)
    files: ['**/test/**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Esquemas de tablas y plantillas HTML de correo: datos declarativos, no lógica
    files: ['infrastructure/driven-adapters/sequelize-repository/src/models/**/*.ts', 'infrastructure/driven-adapters/resend-mailer/src/templates.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: [LEGACY],
    extends: [functional.configs.lite],
    rules: {
      'functional/no-let': 'error',
      'functional/immutable-data': 'error',
      'functional/no-classes': 'error',
      'functional/no-throw-statements': 'error',
      'functional/no-loop-statements': 'error',
      'functional/functional-parameters': 'off',
      'functional/no-mixed-types': 'off',
      'functional/prefer-immutable-types': 'off',
      'functional/no-return-void': 'off',
      'functional/no-conditional-statements': 'off',
      'functional/no-expression-statements': 'off',
    },
  },
)
