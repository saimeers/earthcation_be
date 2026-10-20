import type { CatalogDepartment, PlaceCatalog } from '@earthcation/model'
import municipios from './data/colombia-municipios.json'

// 33 departamentos / 1104 municipios (dataset abierto marcovega/colombia-json, fuente DANE), con Bogotá como su propio
// departamento "Bogotá D.C." en vez de un municipio de Cundinamarca
const DEPARTMENTS: readonly CatalogDepartment[] = municipios.map((d) => ({ name: d.departamento, municipalities: d.municipios }))

/** Catálogo cerrado de municipios de Colombia, empaquetado como JSON. */
export class JsonPlaceCatalog implements PlaceCatalog {
  departments(): readonly CatalogDepartment[] {
    return DEPARTMENTS
  }
}
