import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Animated, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

type ToastKind = 'info' | 'error' | 'success'

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const [kind, setKind] = useState<ToastKind>('info')
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(16)).current
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(
    (msg: string, k: ToastKind = 'info') => {
      setMessage(msg)
      setKind(k)
      if (timer.current) clearTimeout(timer.current)
      translateY.setValue(16)
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 220 }),
      ]).start()
      timer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 12, duration: 250, useNativeDriver: true }),
        ]).start(() => setMessage(null))
      }, 3000)
    },
    [opacity, translateY],
  )

  const bg =
    kind === 'error' ? 'bg-red-600' : kind === 'success' ? 'bg-wa-teal' : 'bg-neutral-800'
  const icon =
    kind === 'error'
      ? 'alert-circle'
      : kind === 'success'
        ? 'checkmark-circle'
        : 'information-circle'

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message && (
        <Animated.View
          pointerEvents="none"
          style={{ opacity, transform: [{ translateY }] }}
          className="absolute bottom-12 left-4 right-4 items-center"
        >
          <View
            className={`flex-row items-center gap-2 rounded-2xl px-4 py-3 shadow-lg ${bg}`}
          >
            <Ionicons name={icon} size={18} color="#ffffff" />
            <Text className="text-center text-[14px] font-medium text-white">{message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  )
}
