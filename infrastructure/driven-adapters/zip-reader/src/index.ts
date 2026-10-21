import AdmZip from 'adm-zip'
import type { ZipEntry, ZipReader } from '@earthcation/model'

const bufferOf = (zip: Uint8Array): Buffer => (Buffer.isBuffer(zip) ? zip : Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength))

/** Abre el ZIP en memoria; cada entrada se descomprime solo cuando se lee. */
export class AdmZipReader implements ZipReader {
  read(zip: Uint8Array): readonly ZipEntry[] | null {
    try {
      return new AdmZip(bufferOf(zip)).getEntries().map((e) => ({ name: e.entryName, isDirectory: e.isDirectory, size: e.header.size, read: () => e.getData() }))
    } catch {
      return null
    }
  }
}
