import { useEffect, type ReactNode } from 'react'
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useToast } from '@/components/Toast'
import {
  useSendTemplate,
  useTemplates,
  useUpdateConversation,
  type WaTemplate,
} from '@/hooks/useConversations'
import { useTeam } from '@/hooks/useTeam'
import { apiErrorMessage } from '@/services/api'

/** Gently pulsing red dot shown while a voice note is being recorded. */
export function RecordingPulse() {
  const o = useSharedValue(1)
  useEffect(() => {
    o.value = withRepeat(withTiming(0.25, { duration: 700 }), -1, true)
  }, [o])
  const style = useAnimatedStyle(() => ({ opacity: o.value }))
  return (
    <Animated.View
      style={style}
      className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500"
    />
  )
}

function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View className="rounded-t-3xl bg-white pb-8 pt-2.5 dark:bg-wa-panel">
          <View className="mb-1.5 h-1 w-10 self-center rounded-full bg-neutral-300 dark:bg-wa-elevated" />
          {children}
        </View>
      </View>
    </Modal>
  )
}

function Row({
  label,
  onPress,
  danger,
  icon,
  iconColor,
  trailing,
}: {
  label: string
  onPress: () => void
  danger?: boolean
  icon?: keyof typeof Ionicons.glyphMap
  iconColor?: string
  trailing?: ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3.5 px-5 py-3.5 active:bg-neutral-100 dark:active:bg-wa-elevated"
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={21}
          color={iconColor ?? (danger ? '#ef4444' : '#54656f')}
        />
      ) : null}
      <Text
        className={`flex-1 text-[15px] ${danger ? 'text-red-600 dark:text-red-400' : 'text-neutral-800 dark:text-neutral-200'}`}
      >
        {label}
      </Text>
      {trailing}
    </Pressable>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <View>
      <Text className="text-xs text-neutral-400 dark:text-neutral-500">{label}</Text>
      <Text className="text-[15px] text-neutral-800 dark:text-neutral-200">{value}</Text>
    </View>
  )
}

export function OverflowMenu({
  open,
  onClose,
  status,
  onResolve,
  onReopen,
  onAssign,
  onAttribution,
  onMediaGallery,
}: {
  open: boolean
  onClose: () => void
  status?: string
  onResolve: () => void
  onReopen: () => void
  onAssign: () => void
  onAttribution: () => void
  onMediaGallery?: () => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      {onMediaGallery ? (
        <Row label="Media, links & docs" icon="images-outline" onPress={onMediaGallery} />
      ) : null}
      {status === 'resolved' ? (
        <Row label="Reopen" icon="refresh" onPress={onReopen} />
      ) : (
        <Row label="Resolve" icon="checkmark-done" iconColor="#008069" onPress={onResolve} />
      )}
      <Row label="Assign to…" icon="person-add-outline" onPress={onAssign} />
      <Row label="View attribution" icon="bar-chart-outline" onPress={onAttribution} />
    </BottomSheet>
  )
}

export function AssignSheet({
  open,
  onClose,
  conversationId,
  onAssigned,
}: {
  open: boolean
  onClose: () => void
  conversationId: string
  onAssigned: () => void
}) {
  const { data } = useTeam()
  const update = useUpdateConversation(conversationId)
  const toast = useToast()
  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text className="px-5 py-2 text-xs font-semibold uppercase text-neutral-400">
        Assign to
      </Text>
      <ScrollView style={{ maxHeight: 320 }}>
        <Row
          label="Unassigned"
          icon="person-remove-outline"
          onPress={async () => {
            try {
              await update.mutateAsync({ assignedTo: null })
              toast.show('Unassigned', 'success')
              onAssigned()
            } catch (err) {
              toast.show(apiErrorMessage(err), 'error')
            }
          }}
        />
        {data?.members.map((m) => (
          <Row
            key={m.id}
            label={m.name}
            icon="person-circle-outline"
            iconColor={m.isOnline ? '#25D366' : '#8696A0'}
            onPress={async () => {
              try {
                await update.mutateAsync({ assignedTo: m.id })
                toast.show(`Assigned to ${m.name}`, 'success')
                onAssigned()
              } catch (err) {
                toast.show(apiErrorMessage(err), 'error')
              }
            }}
          />
        ))}
      </ScrollView>
    </BottomSheet>
  )
}

export function TemplateSheet({
  open,
  onClose,
  conversationId,
}: {
  open: boolean
  onClose: () => void
  conversationId: string
}) {
  const { data, isLoading } = useTemplates(open)
  const send = useSendTemplate(conversationId)
  const toast = useToast()
  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text className="px-5 py-2 text-xs font-semibold uppercase text-neutral-400">
        Message templates
      </Text>
      {isLoading ? (
        <ActivityIndicator className="py-6" color="#00A884" />
      ) : (
        <ScrollView style={{ maxHeight: 360 }}>
          {(data ?? []).map((t: WaTemplate) => (
            <Row
              key={`${t.name}-${t.language}`}
              label={`${t.name}  (${t.language})`}
              onPress={async () => {
                try {
                  await send.mutateAsync({ templateName: t.name, languageCode: t.language })
                  toast.show('Template sent', 'success')
                  onClose()
                } catch (err) {
                  toast.show(apiErrorMessage(err), 'error')
                }
              }}
            />
          ))}
          {(data ?? []).length === 0 && (
            <Text className="px-5 py-6 text-center text-neutral-400">
              No approved templates found.
            </Text>
          )}
        </ScrollView>
      )}
    </BottomSheet>
  )
}

export function AttributionSheet({
  open,
  onClose,
  adTitle,
  adBody,
  sourceUrl,
  sourceType,
  ctwaClid,
}: {
  open: boolean
  onClose: () => void
  adTitle: string | null
  adBody: string | null
  sourceUrl: string | null
  sourceType: string | null
  ctwaClid: string | null
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <Text className="px-5 py-2 text-xs font-semibold uppercase text-neutral-400">
        Click-to-WhatsApp attribution
      </Text>
      <View className="gap-2 px-5 py-2">
        <Field label="Ad title" value={adTitle} />
        <Field label="Ad body" value={adBody} />
        <Field label="Source type" value={sourceType} />
        <Field label="Source URL" value={sourceUrl} />
        <Field label="CTWA click id" value={ctwaClid} />
        {!ctwaClid && (
          <Text className="py-2 text-neutral-400">No ad attribution for this conversation.</Text>
        )}
      </View>
    </BottomSheet>
  )
}
