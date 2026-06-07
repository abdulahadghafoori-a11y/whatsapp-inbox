import { View, StyleSheet } from 'react-native'
import type { VoiceRecording } from '@/lib/voiceRecording'
import { useVoiceMetering } from '@/hooks/useVoiceMetering'

const BAR_WIDTH = 3
const BAR_GAP = 2
const MAX_HEIGHT = 26
/** Fixed bar count avoids layout-driven resets that blank the waveform. */
const BAR_COUNT = 36

export function VoiceRecordingWaveform({
  recorder,
  active,
}: {
  recorder: VoiceRecording | null
  active: boolean
}) {
  const levels = useVoiceMetering(recorder, active, BAR_COUNT)

  return (
    <View style={styles.wrap}>
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
