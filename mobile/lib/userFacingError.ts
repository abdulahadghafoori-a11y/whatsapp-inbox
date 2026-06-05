import { apiErrorMessage } from '@/services/api'

/** Was: dev setup strings shown in production error UI. */
export function userFacingLoadError(err: unknown, context: 'inbox' | 'chat'): string {
  const detail = apiErrorMessage(err)
  if (__DEV__) {
    if (context === 'chat') {
      return `${detail}. Check that the backend is running and EXPO_PUBLIC_API_URL in mobile/.env matches your PC IP (same Wi‑Fi as the phone).`
    }
    return `${detail}. Check that the backend is running and EXPO_PUBLIC_API_URL in mobile/.env matches your PC IP.`
  }
  return `${detail}. Pull to refresh or try again shortly.`
}
