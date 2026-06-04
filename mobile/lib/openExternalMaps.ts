import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native'

/** Prefer the device default maps app (no API key). */
const DEFAULT_MAPS_FIRST = Platform.OS === 'android'

export type MapAppOption = {
  id: string
  title: string
  url: string
}

export function buildMapAppOptions(
  latitude: number,
  longitude: number,
  label?: string,
): MapAppOption[] {
  const q = encodeURIComponent(label ?? `${latitude},${longitude}`)
  const options = [
    {
      id: 'geo',
      title: Platform.OS === 'android' ? 'Maps (device default)' : 'Default maps app',
      url: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${q})`,
    },
    {
      id: 'apple',
      title: 'Apple Maps',
      url: `http://maps.apple.com/?ll=${latitude},${longitude}&q=${q}`,
    },
    {
      id: 'google',
      title: 'Google Maps',
      url: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    },
    {
      id: 'waze',
      title: 'Waze',
      url: `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`,
    },
  ]
  if (DEFAULT_MAPS_FIRST) {
    return options.filter((o) => o.id !== 'apple')
  }
  return [options[1], options[2], options[3], options[0]]
}

export async function showOpenInMapsPicker(
  latitude: number,
  longitude: number,
  label?: string,
): Promise<void> {
  const candidates = buildMapAppOptions(latitude, longitude, label)
  const available: MapAppOption[] = []
  for (const option of candidates) {
    try {
      const can = await Linking.canOpenURL(option.url)
      if (can) available.push(option)
    } catch {
      available.push(option)
    }
  }
  const choices = available.length > 0 ? available : candidates.slice(0, 3)
  const labels = [...choices.map((c) => c.title), 'Cancel']

  if (Platform.OS === 'ios') {
    await new Promise<void>((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: labels,
          cancelButtonIndex: labels.length - 1,
          title: 'Open with',
        },
        (index) => {
          if (index < choices.length) {
            void Linking.openURL(choices[index].url)
          }
          resolve()
        },
      )
    })
    return
  }

  await new Promise<void>((resolve) => {
    Alert.alert(
      'Open with',
      undefined,
      [
        ...choices.map((option) => ({
          text: option.title,
          onPress: () => void Linking.openURL(option.url),
        })),
        { text: 'Cancel', style: 'cancel' as const, onPress: () => resolve() },
      ],
      { cancelable: true, onDismiss: () => resolve() },
    )
  })
}
