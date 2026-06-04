import { useCallback, useState } from 'react'
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native'
import type { VoiceRecording } from '@/lib/voiceRecording'
import { useVoiceMetering } from '@/hooks/useVoiceMetering'

const BAR_WIDTH = 3
const BAR_GAP = 2
const MAX_HEIGHT = 26
const MIN_BARS = 20

function barsForWidth(width: number) {
  if (width <= 0) return MIN_BARS
  return Math.max(MIN_BARS, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)))
}

export function VoiceRecordingWaveform({
  recorder,
  active,
}: {
  recorder: VoiceRecording | null
  active: boolean
}) {
  const [barCount, setBarCount] = useState(MIN_BARS)
  const levels = useVoiceMetering(recorder, active, barCount)

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    const next = barsForWidth(w)
    setBarCount((prev) => (prev === next ? prev : next))
  }, [])

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={styles.row}>
        {levels.map((level, i) => (
          <View key={i} style={styles.slot}>
            <View
              style={[
                styles.bar,
                { height: Math.max(3, level * MAX_HEIGHT) },
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    height: MAX_HEIGHT,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
    height: MAX_HEIGHT,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: MAX_HEIGHT,
    marginHorizontal: BAR_GAP / 2,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 2,
    backgroundColor: '#667781',
  },
})
