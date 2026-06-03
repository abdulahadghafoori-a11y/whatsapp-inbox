import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Animated, Text, View } from 'react-native'

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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(
    (msg: string, k: ToastKind = 'info') => {
      setMessage(msg)
      setKind(k)
      if (timer.current) clearTimeout(timer.current)
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start()
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(
          () => setMessage(null),
        )
      }, 3000)
    },
    [opacity],
  )

  const bg =
    kind === 'error' ? 'bg-red-600' : kind === 'success' ? 'bg-wa-teal' : 'bg-neutral-800'

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message && (
        <Animated.View
          pointerEvents="none"
          style={{ opacity }}
          className="absolute bottom-12 left-4 right-4 items-center"
        >
          <View className={`rounded-full px-4 py-3 ${bg}`}>
            <Text className="text-white text-center">{message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  )
}
