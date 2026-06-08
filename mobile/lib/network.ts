import NetInfo from '@react-native-community/netinfo'
import { onlineManager } from '@tanstack/react-query'

let subscribed = false
/** Last-known Wi‑Fi/ethernet state, kept warm by the shared NetInfo listener. */
let lastWifi: boolean | null = null

function isReachable(
  isConnected: boolean | null,
  isInternetReachable: boolean | null,
): boolean {
  if (!isConnected) return false
  // `null` = unknown on iOS right after connect — treat as online unless explicitly false.
  if (isInternetReachable === false) return false
  return true
}

function wifiFromState(state: { isConnected: boolean | null; type: string }): boolean {
  return !!state.isConnected && (state.type === 'wifi' || state.type === 'ethernet')
}

export function initNetworkListener() {
  if (subscribed) return
  subscribed = true

  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      lastWifi = wifiFromState(state)
      setOnline(isReachable(state.isConnected, state.isInternetReachable))
    })
  })
}

/** Synchronous, last-known Wi‑Fi state (null until the first NetInfo event/fetch). */
export function getWifiSync(): boolean | null {
  return lastWifi
}

/** Wait briefly when reachability is unknown before treating the device as offline. */
export async function isOnWifi(): Promise<boolean> {
  const state = await NetInfo.fetch()
  const wifi = wifiFromState(state)
  lastWifi = wifi
  return wifi
}

export async function isOnline(graceMs = 2500): Promise<boolean> {
  const first = await NetInfo.fetch()
  if (isReachable(first.isConnected, first.isInternetReachable)) {
    if (first.isInternetReachable !== null) return true
    // Connected but reachability unknown — recheck after grace period.
    await new Promise((r) => setTimeout(r, graceMs))
    const second = await NetInfo.fetch()
    return isReachable(second.isConnected, second.isInternetReachable)
  }
  return false
}
