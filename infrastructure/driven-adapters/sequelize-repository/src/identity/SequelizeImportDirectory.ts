import { Op, type ModelStatic, type Model } from 'sequelize'
import type { DirectoryEntry, ImportDirectory, Place } from '@earthcation/model'
import type { Models } from '../models'
import { rowOf } from './mappers'

type Values = Readonly<Record<string, string>>

// Sin distinguir mayúsculas: el Excel casi nunca escribe el nombre igual a como está guardado
// ("CARBONES LA GARITA COAL SAS" vs "Carbones La Garita Coal S.A.S."); con igualdad exacta se duplicaban
const findOrCreate = async (table: ModelStatic<Model>, where: Values, defaults: Values): Promise<DirectoryEntry> => {
  const like = Object.fromEntries(Object.entries(where).map(([k, v]) => [k, { [Op.iLike]: v }]))
  const existing = await table.findOne({ where: like })
  return existing
    ? { id: rowOf<{ id: string }>(existing).id, created: false }
    : { id: rowOf<{ id: string }>(await table.create({ ...where, ...defaults })).id, created: true }
}

/** Organizaciones y localidades que la importación masiva encuentra o crea. */
export class SequelizeImportDirectory implements ImportDirectory {
  constructor(private readonly models: Models) {}

  organization(name: string): Promise<DirectoryEntry> {
    return findOrCreate(this.models.Organization, { name }, { type: 'institución' })
  }

  location(place: Place): Promise<DirectoryEntry> {
    return findOrCreate(this.models.Location, { municipality: place.municipality, department: place.department }, { country: 'Colombia' })
  }
}
