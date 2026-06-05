import { Text, View } from 'react-native'

type IconProps = { size?: number; color?: string }

/** Plus — attach / add media (not rotated). */
/** Keyboard — return to typing when the attach tray is open. */
export function KeyboardIcon({ size = 22, color = '#374151' }: IconProps) {
  const keyW = size * 0.72
  const keyH = size * 0.48
  const keyR = 3
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: keyW,
          height: keyH,
          borderRadius: keyR,
          borderWidth: 1.5,
          borderColor: color,
          paddingTop: keyH * 0.18,
          paddingHorizontal: keyW * 0.12,
          gap: keyH * 0.1,
        }}
      >
        <View style={{ flexDirection: 'row', gap: keyW * 0.08, justifyContent: 'center' }}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                width: keyW * 0.14,
                height: keyH * 0.14,
                borderRadius: 1,
                backgroundColor: color,
              }}
            />
          ))}
        </View>
        <View
          style={{
            alignSelf: 'center',
            width: keyW * 0.42,
            height: keyH * 0.14,
            borderRadius: 1,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  )
}

export function AttachIcon({ size = 26, color = '#374151' }: IconProps) {
  return (
    <Text
      pointerEvents="none"
      style={{
        fontSize: size,
        lineHeight: size,
        color,
        fontWeight: '300',
        textAlign: 'center',
        width: size,
      }}
    >
      +
    </Text>
  )
}

export function MicIcon({ size = 22, color = '#fff' }: IconProps) {
  const bodyW = size * 0.38
  const bodyH = size * 0.5
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: bodyW,
          height: bodyH,
          borderRadius: bodyW / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.1,
          width: size * 0.58,
          height: size * 0.24,
          borderBottomWidth: 2,
          borderLeftWidth: 2,
          borderRightWidth: 2,
          borderColor: color,
          borderBottomLeftRadius: size * 0.3,
          borderBottomRightRadius: size * 0.3,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          width: 2,
          height: size * 0.12,
          backgroundColor: color,
        }}
      />
    </View>
  )
}

export function SendIcon({ size = 18, color = '#fff' }: IconProps) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        marginLeft: size * 0.15,
        borderTopWidth: size * 0.38,
        borderBottomWidth: size * 0.38,
        borderLeftWidth: size * 0.55,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
    />
  )
}

/** Circular retry arrow for failed outbound messages. */
export function RetryIcon({ size = 22, color = '#e53935' }: IconProps) {
  const r = size / 2
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        borderWidth: 2,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color, fontSize: size * 0.55, lineHeight: size * 0.6, fontWeight: '700' }}>
        ↻
      </Text>
    </View>
  )
}

export function CloseIcon({ size = 22, color = '#6b7280' }: IconProps) {
  return (
    <Text style={{ fontSize: size, lineHeight: size, color, fontWeight: '400' }}>×</Text>
  )
}

/** Curved reply arrow (swipe + menu). */
export function ReplySwipeIcon({ size = 24, color = '#00A884' }: IconProps) {
  return (
    <Text
      pointerEvents="none"
      style={{
        fontSize: size,
        lineHeight: size,
        color,
        fontWeight: '600',
        transform: [{ scaleX: -1 }],
      }}
    >
      ↩
    </Text>
  )
}

export function ForwardIcon({ size = 22, color = '#374151' }: IconProps) {
  return (
    <Text pointerEvents="none" style={{ fontSize: size, lineHeight: size, color, fontWeight: '500' }}>
      ↪
    </Text>
  )
}

export function DeleteActionIcon({ size = 22, color = '#dc2626' }: IconProps) {
  const w = size * 0.55
  const h = size * 0.62
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: w * 1.15,
          height: h * 0.22,
          borderRadius: 2,
          backgroundColor: color,
          marginBottom: 1,
        }}
      />
      <View
        style={{
          width: w,
          height: h,
          borderWidth: 1.5,
          borderColor: color,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
        }}
      />
    </View>
  )
}

export function DocumentIcon({ size = 28, color = '#00A884' }: IconProps) {
  const w = size * 0.65
  const h = size * 0.8
  return (
    <View
      style={{
        width: w,
        height: h,
        borderWidth: 2,
        borderColor: color,
        borderRadius: 3,
        backgroundColor: `${color}18`,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: w * 0.35,
          height: h * 0.35,
          borderBottomWidth: 2,
          borderLeftWidth: 2,
          borderColor: color,
          backgroundColor: '#fff',
        }}
      />
    </View>
  )
}
