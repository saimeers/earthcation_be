// Grafo permitido entre capas (además de lo que pnpm ya impide: importar lo no declarado):
//   model ← nada · usecase ← model · driven-adapters ← model · entry-points ← usecase, model · app-service ← todos
// Y cada paquete se usa solo por su index (sin rutas relativas hacia el src/ de otro paquete).

module.exports = {
  forbidden: [
    {
      name: 'model-sin-dependencias',
      comment: 'El modelo de dominio no importa ningún otro paquete del monorepo ni librerías externas',
      severity: 'error',
      from: { path: '^domain/model/src' },
      to: { pathNot: ['^domain/model/src'], dependencyTypesNot: ['core'] },
    },
    {
      name: 'usecase-solo-modelo',
      severity: 'error',
      from: { path: '^domain/usecase/src' },
      to: { pathNot: ['^domain/usecase/src', '^domain/model/'], dependencyTypesNot: ['core'] },
    },
    {
      name: 'adapters-solo-modelo',
      comment: 'Un adaptador implementa gateways del modelo; no conoce casos de uso, entry-points ni otros adaptadores',
      severity: 'error',
      from: { path: '^infrastructure/driven-adapters/([^/]+)/src' },
      to: { path: ['^domain/usecase/', '^infrastructure/entry-points/', '^applications/'] },
    },
    {
      name: 'adapters-independientes',
      severity: 'error',
      from: { path: '^infrastructure/driven-adapters/([^/]+)/src' },
      to: { path: '^infrastructure/driven-adapters/', pathNot: '^infrastructure/driven-adapters/$1/' },
    },
    {
      name: 'entry-points-sin-adapters',
      severity: 'error',
      from: { path: '^infrastructure/entry-points/([^/]+)/src' },
      to: { path: ['^infrastructure/driven-adapters/', '^applications/'] },
    },
    {
      name: 'nadie-depende-de-la-app',
      severity: 'error',
      from: { pathNot: '^applications/' },
      to: { path: '^applications/' },
    },
    {
      name: 'sin-rutas-relativas-entre-paquetes',
      comment: 'Otro paquete se importa por su nombre (@earthcation/x), cuyo "exports" expone solo su index',
      severity: 'error',
      from: { path: '^(domain|infrastructure/[^/]+|applications)/([^/]+)/src' },
      to: { path: '^(domain|infrastructure/[^/]+|applications)/[^/]+/src', pathNot: '^$1/$2/src' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['/dist/', '/test/', 'applications/app-service/src/legacy/'] },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
  },
}
