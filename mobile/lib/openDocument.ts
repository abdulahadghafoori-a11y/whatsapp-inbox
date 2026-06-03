import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import * as IntentLauncher from 'expo-intent-launcher'

function safeFilename(name: string) {
  return name.replace(/[^\w.\-()+ ]+/g, '_') || 'document'
}

/** Download a remote file and open it with the system viewer. */
export async function openDocumentFromUrl(
  remoteUrl: string,
  filename: string,
  mimeType?: string | null,
): Promise<void> {
  const dir = `${FileSystem.cacheDirectory ?? ''}wa-docs/`
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined)

  const target = `${dir}${safeFilename(filename)}`
  const { uri } = await FileSystem.downloadAsync(remoteUrl, target)
  await openLocalDocument(uri, mimeType ?? 'application/octet-stream')
}

export async function openLocalDocument(
  localUri: string,
  mimeType: string,
): Promise<void> {
  if (Platform.OS === 'android') {
    const contentUri = await FileSystem.getContentUriAsync(localUri)
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1,
      type: mimeType,
    })
    return
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(localUri, { mimeType })
    return
  }

  throw new Error('Cannot open this file on this device.')
}
