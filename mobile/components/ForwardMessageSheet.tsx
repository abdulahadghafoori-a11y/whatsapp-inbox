import { useEffect, useMemo, useState } from 'react'
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useInbox } from '@/hooks/useConversations'
import { ConversationItem } from '@/components/ConversationItem'
import { MessageBubble } from '@/components/MessageBubble'
import { Avatar } from '@/components/Avatar'
import { PressableScale } from '@/components/PressableScale'
import type { ConversationListItem, Message } from '@/types'

type Step = 'select' | 'preview'

export function ForwardMessageSheet({
  open,
  message,
  contactName,
  currentConversationId: _currentConversationId,
  onClose,
  onForward,
  forwarding,
}: {
  open: boolean
  message: Message | null
  contactName: string
  currentConversationId: string
  onClose: () => void
  onForward: (targetConversationIds: string[]) => void
  forwarding: boolean
}) {
  const [step, setStep] = useState<Step>('select')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { conversations: forwardTargets, isLoading: isPending } = useInbox('all', search)

  useEffect(() => {
    if (open) {
      setStep('select')
      setSelected(new Set())
      setSearch('')
    }
  }, [open])

  const list = useMemo(() => forwardTargets, [forwardTargets])

  const selectedList = useMemo(
    () => list.filter((c) => selected.has(c.id)),
    [list, selected],
  )

  function resetAndClose() {
    if (forwarding) return
    setStep('select')
    setSelected(new Set())
    setSearch('')
    onClose()
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(list.map((c) => c.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function goToPreview() {
    if (selected.size === 0) return
    setStep('preview')
  }

  if (!open) return null

  return (
    <Modal visible={open} animationType="slide" onRequestClose={resetAndClose}>
      <SafeAreaView className="flex-1 bg-white dark:bg-wa-panelDeep" edges={['top', 'bottom']}>
        {step === 'select' ? (
          <>
            <View className="flex-row items-center justify-between border-b border-neutral-100 dark:border-white/5 px-4 py-3">
              <Pressable onPress={resetAndClose} disabled={forwarding} hitSlop={8}>
                <Text className="text-base text-wa-teal">Cancel</Text>
              </Pressable>
              <Text className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Forward to</Text>
              <Pressable
                onPress={selected.size === list.length ? clearSelection : selectAll}
                disabled={list.length === 0 || forwarding}
                hitSlop={8}
              >
                <Text className="text-base font-medium text-wa-teal">
                  {selected.size === list.length && list.length > 0 ? 'Clear' : 'Select all'}
                </Text>
              </Pressable>
            </View>

            <View className="px-4 py-2">
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search chats"
                className="rounded-xl bg-neutral-100 dark:bg-wa-elevated px-4 py-2.5 text-[15px] text-neutral-900 dark:text-wa-textDark"
                placeholderTextColor="#9ca3af"
              />
              {selected.size > 0 ? (
                <Text className="mt-2 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  {selected.size} chat{selected.size === 1 ? '' : 's'} selected
                </Text>
              ) : (
                <Text className="mt-2 text-center text-xs text-neutral-400 dark:text-neutral-500">
                  Tap or long-press to select chats
                </Text>
              )}
            </View>

            {isPending && list.length === 0 ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color="#008069" />
              </View>
            ) : (
              <FlatList
                data={list}
                keyExtractor={(c) => c.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }: { item: ConversationListItem }) => (
                  <ConversationItem
                    conversation={item}
                    selected={selected.has(item.id)}
                    onPress={() => toggle(item.id)}
                    onLongPress={() => toggle(item.id)}
                  />
                )}
                ListEmptyComponent={
                  <Text className="py-8 text-center text-neutral-500 dark:text-neutral-400">No other chats found</Text>
                }
              />
            )}

            <View className="border-t border-neutral-100 dark:border-white/5 px-4 py-3">
              <PressableScale
                onPress={goToPreview}
                haptic="light"
                disabled={selected.size === 0 || forwarding}
                scaleTo={0.97}
                className={`items-center rounded-2xl py-3.5 ${
                  selected.size > 0 ? 'bg-wa-teal' : 'bg-neutral-200 dark:bg-wa-elevated'
                }`}
              >
                <Text className="text-center text-base font-semibold text-white">
                  Next {selected.size > 0 ? `(${selected.size})` : ''}
                </Text>
              </PressableScale>
            </View>
          </>
        ) : (
          <>
            <View className="flex-row items-center justify-between border-b border-neutral-100 dark:border-white/5 px-4 py-3">
              <Pressable
                onPress={() => setStep('select')}
                disabled={forwarding}
                hitSlop={8}
              >
                <Text className="text-base text-wa-teal">Back</Text>
              </Pressable>
              <Text className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Forward</Text>
              <View className="w-12" />
            </View>

            <View className="flex-1 bg-wa-bg px-4 pt-4 dark:bg-wa-chatDark">
              {message ? (
                <View className="mb-4">
                  <MessageBubble message={message} contactName={contactName} />
                </View>
              ) : null}

              <Text className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Send to {selectedList.length} chat{selectedList.length === 1 ? '' : 's'}
              </Text>
              <FlatList
                data={selectedList}
                keyExtractor={(c) => c.id}
                renderItem={({ item }) => (
                  <View className="flex-row items-center gap-3 border-b border-neutral-100 dark:border-white/5 py-2.5">
                    <Avatar name={item.contact.name} fallback={item.contact.waId} size={40} />
                    <Text className="flex-1 text-[15px] text-neutral-900 dark:text-neutral-100">
                      {item.contact.name ?? item.contact.waId}
                    </Text>
                  </View>
                )}
              />
            </View>

            <View className="border-t border-neutral-100 dark:border-white/5 px-4 py-3">
              <PressableScale
                onPress={() => onForward([...selected])}
                haptic="light"
                disabled={forwarding || selected.size === 0}
                scaleTo={0.97}
                className="flex-row items-center justify-center rounded-2xl bg-wa-teal py-3.5"
              >
                {forwarding ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-center text-base font-semibold text-white">
                    Send
                  </Text>
                )}
              </PressableScale>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  )
}
