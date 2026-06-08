import dns from 'node:dns'
import { Agent, request } from 'undici'
import { config } from '../config.js'

/** Meta CDN host suffixes we are willing to fetch media from. */
const ALLOWED_HOST_SUFFIXES = [
  'fbsbx.com',
  'facebook.com',
  'fbcdn.net',
  'whatsapp.net',
  'cdn.whatsapp.net',
]

/** Cap a single media download so a malicious/oversized object can't OOM us. */
const MAX_MEDIA_BYTES = 110 * 1024 * 1024 // > WA 100MB document cap, with headroom

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  )
}

/**
 * Reject private/loopback/link-local/reserved IPv4 to prevent SSRF to internal
 * services or the cloud metadata endpoint (169.254.169.254) after DNS resolves.
 */
function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map((n) => Number(n))
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false
  }
  const [a, b] = parts as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127) return false // this-net, private, loopback
  if (a === 169 && b === 254) return false // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return false // private
  if (a === 192 && b === 168) return false // private
  if (a === 100 && b >= 64 && b <= 127) return false // CGNAT
  if (a >= 224) return false // multicast + reserved + 255.255.255.255
  return true
}

/** Skip bogus answers some routers return for blocked Meta CDNs, and block SSRF targets. */
function isUsableIpv4(address: string | undefined): address is string {
  return !!address && isPublicIpv4(address)
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
  if (parsed.protocol !== 'https:') {
    throw new Error(`Refusing non-HTTPS media URL: ${parsed.protocol}`)
  }
  const hostname = parsed.hostname
  // Only ever send the WhatsApp bearer token to Meta-owned CDN hosts. Prevents
  // SSRF + token exfiltration if a non-Meta URL ever reaches this function.
  if (!isAllowedHost(hostname)) {
    throw new Error(`Refusing media fetch for non-Meta host: ${hostname}`)
  }
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

  const declared = Number(res.headers['content-length'])
  if (Number.isFinite(declared) && declared > MAX_MEDIA_BYTES) {
    res.body.destroy()
    throw new Error(`CDN media too large: ${declared} bytes`)
  }

  // Stream with a hard byte cap so a missing/lying Content-Length can't OOM us.
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of res.body) {
    total += chunk.length
    if (total > MAX_MEDIA_BYTES) {
      res.body.destroy()
      throw new Error(`CDN media exceeded ${MAX_MEDIA_BYTES} bytes`)
    }
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks, total)
}
