/**
 * Was: HTTP URLs allowed in production builds — JWT and message bodies sent in cleartext.
 * Now: fail fast when release builds point at non-HTTPS API/socket endpoints.
 */
export function assertProductionTransportSecurity(): void {
  if (__DEV__) return
  const api = process.env.EXPO_PUBLIC_API_URL ?? ''
  const socket = process.env.EXPO_PUBLIC_SOCKET_URL ?? process.env.EXPO_PUBLIC_API_URL ?? ''
  for (const [label, url] of [
    ['EXPO_PUBLIC_API_URL', api],
    ['EXPO_PUBLIC_SOCKET_URL', socket],
  ] as const) {
    if (!url.startsWith('https://')) {
      throw new Error(`${label} must use https:// in production builds (got ${url || '(empty)'})`)
    }
  }
}
