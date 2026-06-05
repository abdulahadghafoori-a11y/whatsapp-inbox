import { useEffect, useState } from 'react'
import { View, Text } from 'react-native'
import {
  formatCountdown,
  messagingWindowState,
  msUntil,
  showHeaderWindowChip,
  showUnderHeaderBar,
  type MessagingWindowKind,
} from '@/lib/messagingWindow'
import type { ConversationListItem } from '@/types'

type HeaderChipStyle = {
  label: string
  chipBg: string
  labelColor: string
  clockColor: string
}

const HEADER_CHIP: Record<MessagingWindowKind, HeaderChipStyle | null> = {
  session: {
    label: 'Session',
    chipBg: 'bg-emerald-600/95',
    labelColor: 'text-emerald-50',
    clockColor: 'text-white',
  },
  session_urgent: {
    label: 'Session',
    chipBg: 'bg-orange-500/95',
    labelColor: 'text-orange-50',
    clockColor: 'text-white',
  },
  ctwa_fep: {
    label: 'CTWA',
    chipBg: 'bg-sky-600/95',
    labelColor: 'text-sky-50',
    clockColor: 'text-white',
  },
  ctwa_reply: {
    label: 'Reply',
    chipBg: 'bg-violet-600/95',
    labelColor: 'text-violet-50',
    clockColor: 'text-white',
  },
  template_only: null,
  none: null,
}

const BANNER_STYLES: Record<
  Extract<MessagingWindowKind, 'ctwa_reply' | 'template_only'>,
  { bg: string; border: string; text: string; clock: string }
> = {
  ctwa_reply: {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-900',
    clock: 'text-violet-800',
  },
  template_only: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-900',
    clock: 'text-red-700',
  },
}

export function MessagingWindowTimer({
  conversation,
  variant = 'header',
}: {
  conversation: ConversationListItem | null | undefined
  variant?: 'header' | 'banner'
}) {
  const model = messagingWindowState(conversation)
  const [, bump] = useState(0)

  useEffect(() => {
    if (!model?.expiresAt) return
    const id = setInterval(() => bump((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [model?.expiresAt])

  if (!model) return null

  if (variant === 'header') {
    if (!showHeaderWindowChip(model)) return null
    const chip = HEADER_CHIP[model.kind]
    if (!chip) return null

    const remaining = model.expiresAt ? msUntil(model.expiresAt) : 0
    const clock =
      model.expiresAt && remaining > 0 ? formatCountdown(remaining) : '0:00'

    return (
      <View className={`mr-1 items-center rounded-xl px-2.5 py-1 ${chip.chipBg}`}>
        <Text className={`text-[10px] font-semibold uppercase tracking-wide ${chip.labelColor}`}>
          {chip.label}
        </Text>
        {model.expiresAt ? (
          <Text className={`font-mono text-[15px] font-bold tabular-nums leading-tight ${chip.clockColor}`}>
            {clock}
          </Text>
        ) : null}
      </View>
    )
  }

  if (!showUnderHeaderBar(model) || !model.bannerMessage) return null

  const s = BANNER_STYLES[model.kind as 'ctwa_reply' | 'template_only']

  return (
    <View className={`border-b px-4 py-2.5 ${s.bg} ${s.border}`}>
      <Text className={`text-sm leading-5 ${s.text}`}>{model.bannerMessage}</Text>
    </View>
  )
}
