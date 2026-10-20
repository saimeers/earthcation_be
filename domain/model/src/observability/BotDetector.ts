// Escáneres y robots: user-agent declarado, o red de un centro de datos (llegan con UA de Chrome falso
// apenas se emite el certificado de un dominio nuevo). Se guardan marcados y no cuentan en el panel.
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|scan|facebookexternalhit|whatsapp|telegram|slack|discord/i
const DATACENTER = /amazon|aws|google|microsoft|azure|ovh|hetzner|digitalocean|linode|akamai|oracle|alibaba|tencent|contabo|vultr|choopa|leaseweb|m247|scaleway|hostinger|datacamp|cdn77|g-core|hosting|data ?center|server|cloud/i

/** Decide si una visita la hizo un robot y no una persona. */
export const BotDetector = {
  /** Sin user-agent, con user-agent de robot o desde la red (ASN) de un centro de datos. */
  isBot(userAgent: unknown, network: string | null): boolean {
    if (typeof userAgent !== 'string' || userAgent === '' || BOT_UA.test(userAgent)) return true
    return network !== null && DATACENTER.test(network)
  },
} as const
