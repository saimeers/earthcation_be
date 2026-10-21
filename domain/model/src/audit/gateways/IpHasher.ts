/** Puerto de salida: huella de una IP que no se puede revertir, para relacionar acciones sin guardar la dirección. */
export interface IpHasher {
  hash(ip: string | undefined): string | null
}
