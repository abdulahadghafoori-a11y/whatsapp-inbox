import NetInfo from '@react-native-community/netinfo'
import { onlineManager } from '@tanstack/react-query'

let subscribed = false

function isReachable(
  isConnected: boolean | null,
  isInternetReachable: boolean | null,
): boolean {
  if (!isConnected) return false
  // `null` = unknown on iOS right after connect — treat as online unless explicitly false.
  if (isInternetReachable === false) return false
  return true
}

export function initNetworkListener() {
  if (subscribed) return
  subscribed = true

  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      setOnline(isReachable(state.isConnected, state.isInternetReachable))
    })
  })
}

/** Wait briefly when reachability is unknown before treating the device as offline. */
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
