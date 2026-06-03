import dns from 'node:dns'
import { Agent, request } from 'undici'
import { config } from '../config.js'

/** Skip bogus answers some routers return for blocked Meta CDNs. */
function isUsableIpv4(address: string | undefined): address is string {
  return (
    !!address &&
    address !== '0.0.0.0' &&
    !address.startsWith('127.') &&
    address !== '255.255.255.255'
  )
}

async function resolve4DoH(hostname: string): Promise<string> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`
  const res = await fetch(url, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) throw new Error(`DoH HTTP ${res.status}`)
  const data = (await res.json()) as {
    Answer?: Array<{ type: number; data: string }>
  }
  const a = data.Answer?.find((r) => r.type === 1 && isUsableIpv4(r.data))
  if (!a) throw new Error(`DoH: no A record for ${hostname}`)
  return a.data
}

/** Resolve Meta CDN hostnames via public DNS, then DNS-over-HTTPS if LAN DNS blocks them. */
export async function resolve4Public(hostname: string): Promise<string> {
  const resolver = new dns.promises.Resolver({ timeout: 5_000, tries: 2 })
  resolver.setServers(config.WHATSAPP_MEDIA_DNS_SERVERS)

  const fromUdp = await resolver.resolve4(hostname).catch(() => [] as string[])
  const usable = fromUdp.find(isUsableIpv4)
  if (usable) return usable

  return resolve4DoH(hostname)
}

/**
 * Download bytes from Meta's CDN (lookaside.fbsbx.com) without using the PC's broken LAN DNS.
 * Resolves the hostname via public DNS/DoH, then requests by IP with Host + TLS SNI.
 */
export async function fetchWhatsAppCdn(
  url: string,
  authorization: string,
): Promise<Buffer> {
  const parsed = new URL(url)
  const hostname = parsed.hostname
  const address = await resolve4Public(hostname)

  const ipUrl = new URL(url)
  ipUrl.hostname = address

  const res = await request(ipUrl, {
    method: 'GET',
    headers: {
      Authorization: authorization,
      Host: hostname,
    },
    dispatcher: new Agent({
      connect: {
        servername: hostname,
        timeout: 60_000,
      },
    }),
  })

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`CDN HTTP ${res.statusCode}`)
  }

  const arrayBuf = await res.body.arrayBuffer()
  return Buffer.from(arrayBuf)
}
