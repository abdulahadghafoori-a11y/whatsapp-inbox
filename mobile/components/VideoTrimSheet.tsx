import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  PanResponder,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import * as VideoThumbnails from 'expo-video-thumbnails'
import { InteractiveVideoPlayer } from '@/components/InteractiveVideoPlayer'
import { PresentationModal } from '@/components/PresentationModal'
import { formatDuration } from '@/lib/format'
import { resolveUploadUri } from '@/lib/uploadUri'
import { WA_VIDEO_MAX_BYTES } from '@/lib/waMediaLimits'
import {
  estimateTrimmedVideoBytes,
  trimSelectionMayExceedCap,
} from '@/lib/prepareVideoForSend'

export type VideoTrimSource = {
  uri: string
  name: string
  mimeType: string
  durationMs: number
  sizeBytes: number
  initialRange?: { startMs: number; endMs: number }
}

const THUMB_COUNT = 6
const HANDLE_W = 28
const MIN_TRIM_MS = 1000

type ClampMode = 'start' | 'end' | 'move'

function clampRange(
  startMs: number,
  endMs: number,
  durationMs: number,
  maxSelectionMs: number,
  mode: ClampMode = 'move',
): { startMs: number; endMs: number } {
  if (mode === 'move') {
    const width = Math.max(
      MIN_TRIM_MS,
      Math.min(maxSelectionMs, endMs - startMs),
    )
    let start = startMs
    let end = start + width
    if (end > durationMs) {
      end = durationMs
      start = Math.max(0, end - width)
    }
    if (start < 0) {
      start = 0
      end = Math.min(durationMs, width)
    }
    return { startMs: start, endMs: end }
  }

  if (mode === 'end') {
    const start = Math.max(0, Math.min(startMs, durationMs - MIN_TRIM_MS))
    let end = Math.max(start + MIN_TRIM_MS, Math.min(endMs, durationMs))
    if (end - start > maxSelectionMs) end = start + maxSelectionMs
    return { startMs: start, endMs: end }
  }

  let end = Math.min(durationMs, Math.max(endMs, MIN_TRIM_MS))
  let start = Math.max(0, Math.min(startMs, end - MIN_TRIM_MS))
  if (end - start > maxSelectionMs) start = end - maxSelectionMs
  return { startMs: start, endMs: end }
}

export function VideoTrimSheet({
  source,
  onCancel,
  onConfirm,
  onSendAsDocument,
}: {
  source: VideoTrimSource | null
  onCancel: () => void
  onConfirm: (range: { startMs: number; endMs: number }) => void | Promise<void>
  onSendAsDocument?: (range: { startMs: number; endMs: number }) => void | Promise<void>
}) {
  const insets = useSafeAreaInsets()
  const durationMs = Math.max(source?.durationMs ?? 0, MIN_TRIM_MS)
  const [startMs, setStartMs] = useState(0)
  const [endMs, setEndMs] = useState(durationMs)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [trackW, setTrackW] = useState(0)
  const [busy, setBusy] = useState(false)
  const [thumbsLoading, setThumbsLoading] = useState(false)

  const startMsRef = useRef(startMs)
  const endMsRef = useRef(endMs)
  const trackWRef = useRef(trackW)
  const durationMsRef = useRef(durationMs)
  const maxSelectionMsRef = useRef(durationMs)
  const startDragXRef = useRef(0)
  const endDragXRef = useRef(0)
  const selectionStartRef = useRef(0)
  const selectionEndRef = useRef(0)

  useEffect(() => {
    startMsRef.current = startMs
  }, [startMs])
  useEffect(() => {
    endMsRef.current = endMs
  }, [endMs])
  useEffect(() => {
    trackWRef.current = trackW
  }, [trackW])
  useEffect(() => {
    durationMsRef.current = durationMs
  }, [durationMs])

  const uri = source ? resolveUploadUri(source.uri) : null

  const maxSelectionMs = useMemo(() => {
    if (!source || source.sizeBytes <= WA_VIDEO_MAX_BYTES) return durationMs
    const ratio = WA_VIDEO_MAX_BYTES / source.sizeBytes
    return Math.max(MIN_TRIM_MS, Math.floor(durationMs * ratio * 0.92))
  }, [source, durationMs])

  useEffect(() => {
    maxSelectionMsRef.current = maxSelectionMs
  }, [maxSelectionMs])

  useEffect(() => {
    if (!source) return
    const defaultEnd = Math.min(
      Math.max(source.durationMs, MIN_TRIM_MS),
      maxSelectionMs,
      durationMs,
    )
    const start = source.initialRange?.startMs ?? 0
    const end = source.initialRange?.endMs ?? defaultEnd
    const next = clampRange(start, end, durationMs, maxSelectionMs, 'end')
    setStartMs(next.startMs)
    setEndMs(next.endMs)
  }, [source?.uri, source?.durationMs, source?.initialRange, maxSelectionMs, durationMs])

  useEffect(() => {
    if (!uri || !durationMs) return
    let cancelled = false
    setThumbsLoading(true)
    void (async () => {
      const out: string[] = []
      for (let i = 0; i < THUMB_COUNT; i++) {
        const t = Math.floor((durationMs * i) / THUMB_COUNT)
        try {
          const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(uri, { time: t })
          out.push(thumb)
        } catch {
          /* skip frame */
        }
      }
      if (!cancelled) {
        setThumbs(out)
        setThumbsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uri, durationMs])

  const applyRange = useCallback((start: number, end: number, mode: ClampMode = 'move') => {
    const next = clampRange(
      start,
      end,
      durationMsRef.current,
      maxSelectionMsRef.current,
      mode,
    )
    setStartMs(next.startMs)
    setEndMs(next.endMs)
  }, [])

  const msToX = useCallback((ms: number, width = trackWRef.current, dur = durationMsRef.current) => {
    if (width <= 0 || dur <= 0) return 0
    return (ms / dur) * width
  }, [])

  const xToMs = useCallback((x: number, width = trackWRef.current, dur = durationMsRef.current) => {
    if (width <= 0 || dur <= 0) return 0
    const clamped = Math.max(0, Math.min(width, x))
    return Math.round((clamped / width) * dur)
  }, [])

  const deltaMsFromDx = useCallback((dx: number) => {
    const width = trackWRef.current
    const dur = durationMsRef.current
    if (width <= 0 || dur <= 0) return 0
    return Math.round((dx / width) * dur)
  }, [])

  const startPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          startDragXRef.current = msToX(startMsRef.current)
        },
        onPanResponderMove: (_, g) => {
          const ms = xToMs(startDragXRef.current + g.dx)
          applyRange(ms, endMsRef.current, 'start')
        },
      }),
    [msToX, xToMs, applyRange],
  )

  const endPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          endDragXRef.current = msToX(endMsRef.current)
        },
        onPanResponderMove: (_, g) => {
          const ms = xToMs(endDragXRef.current + g.dx)
          applyRange(startMsRef.current, ms, 'end')
        },
      }),
    [msToX, xToMs, applyRange],
  )

  const selectionPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          selectionStartRef.current = startMsRef.current
          selectionEndRef.current = endMsRef.current
        },
        onPanResponderMove: (_, g) => {
          const delta = deltaMsFromDx(g.dx)
          const width = selectionEndRef.current - selectionStartRef.current
          const newStart = selectionStartRef.current + delta
          applyRange(newStart, newStart + width, 'move')
        },
      }),
    [deltaMsFromDx, applyRange],
  )

  const selectedSec = Math.max(0, (endMs - startMs) / 1000)
  const estBytes =
    source && source.durationMs > 0
      ? estimateTrimmedVideoBytes(source.sizeBytes, source.durationMs, startMs, endMs)
      : 0
  const mayExceed =
    source && source.durationMs > 0
      ? trimSelectionMayExceedCap(source.sizeBytes, source.durationMs, startMs, endMs)
      : false
  const sizeHint = !source
    ? ''
    : mayExceed
      ? `Selection may exceed 16MB (~${Math.max(1, Math.round(estBytes / (1024 * 1024)))}MB est.) — trim shorter or send as document`
      : source.sizeBytes > WA_VIDEO_MAX_BYTES
        ? `Original ${Math.round(source.sizeBytes / (1024 * 1024))}MB — drag handles or move the selection`
        : estBytes > 0
          ? `~${Math.max(1, Math.round(estBytes / (1024 * 1024)))}MB estimated for selection`
          : 'Drag handles to trim, or drag the selection to move it'

  const selLeft = msToX(startMs, trackW, durationMs)
  const selWidth = Math.max(0, msToX(endMs, trackW, durationMs) - selLeft)

  return (
    <PresentationModal visible={source != null} onClose={onCancel} animationType="slide">
      {source && uri ? (
        <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            <Pressable onPress={onCancel} hitSlop={12} disabled={busy}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.title}>Trim video</Text>
            <Pressable
              disabled={busy}
              onPress={() => {
                void (async () => {
                  setBusy(true)
                  try {
                    await onConfirm({ startMs, endMs })
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
              hitSlop={12}
            >
              {busy ? (
                <ActivityIndicator color="#53bdeb" size="small" />
              ) : (
                <Text style={styles.done}>Done</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.playerWrap}>
            {uri ? (
              <InteractiveVideoPlayer
                url={uri}
                fill
                expanded
                autoPlay
                playbackRange={{ startMs, endMs }}
              />
            ) : null}
          </View>

          <Text style={styles.hint}>{sizeHint}</Text>
          <Text style={styles.duration}>
            {formatDuration(startMs)} – {formatDuration(endMs)} ({selectedSec.toFixed(1)}s selected)
          </Text>

          {mayExceed && onSendAsDocument ? (
            <Pressable
              disabled={busy}
              style={styles.docBtn}
              onPress={() => {
                void (async () => {
                  setBusy(true)
                  try {
                    await onSendAsDocument({ startMs, endMs })
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            >
              <Text style={styles.docBtnText}>Send as document (up to 100MB)</Text>
            </Pressable>
          ) : null}

          <View
            style={styles.track}
            onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
          >
            {thumbsLoading ? (
              <View style={styles.thumbLoading}>
                <ActivityIndicator color="#53bdeb" />
                <Text style={styles.thumbLoadingText}>Loading timeline…</Text>
              </View>
            ) : null}
            <View style={styles.thumbRow} pointerEvents="none">
              {thumbs.map((t, i) => (
                <View key={i} style={styles.thumbSlot}>
                  {t ? (
                    <Image source={{ uri: t }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={styles.thumbPlaceholder} />
                  )}
                </View>
              ))}
            </View>
            <View
              style={[
                styles.selection,
                { left: selLeft, width: selWidth },
              ]}
              {...selectionPan.panHandlers}
            />
            <View
              style={[styles.handle, { left: selLeft - HANDLE_W / 2 }]}
              {...startPan.panHandlers}
            />
            <View
              style={[styles.handle, { left: selLeft + selWidth - HANDLE_W / 2 }]}
              {...endPan.panHandlers}
            />
          </View>
        </View>
      ) : null}
    </PresentationModal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b141a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancel: { color: '#8696a0', fontSize: 16 },
  done: { color: '#53bdeb', fontSize: 16, fontWeight: '600' },
  title: { color: '#e9edef', fontSize: 17, fontWeight: '600' },
  playerWrap: {
    marginHorizontal: 16,
    aspectRatio: 16 / 9,
    backgroundColor: '#111b21',
    borderRadius: 12,
    overflow: 'hidden',
  },
  hint: {
    color: '#8696a0',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
  },
  duration: {
    color: '#e9edef',
    textAlign: 'center',
    marginTop: 8,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  docBtn: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#53bdeb',
  },
  docBtnText: { color: '#53bdeb', fontSize: 14, fontWeight: '500' },
  track: {
    marginHorizontal: 16,
    marginTop: 20,
    height: 64,
    justifyContent: 'center',
  },
  thumbLoading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,20,26,0.55)',
    borderRadius: 8,
  },
  thumbLoadingText: { color: '#8696a0', marginTop: 8, fontSize: 12 },
  thumbRow: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    opacity: 0.55,
  },
  thumbSlot: { flex: 1 },
  thumbPlaceholder: { flex: 1, backgroundColor: '#202c33' },
  selection: {
    position: 'absolute',
    top: 8,
    height: 48,
    borderWidth: 2,
    borderColor: '#53bdeb',
    borderRadius: 6,
    backgroundColor: 'rgba(83,189,235,0.12)',
    zIndex: 1,
  },
  handle: {
    position: 'absolute',
    top: 4,
    width: HANDLE_W,
    height: 56,
    borderRadius: 6,
    backgroundColor: '#53bdeb',
    zIndex: 3,
    elevation: 6,
  },
})
