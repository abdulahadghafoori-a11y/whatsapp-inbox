import { useMemo } from 'react'
import { View, Text } from 'react-native'
import { useSecondTick } from '@/hooks/useSecondTick'
import {
  formatCountdown,
  messagingWindowState,
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
  const model = useMemo(
    () => messagingWindowState(conversation),
    [
      conversation?.windowExpiresAt,
      conversation?.fepExpiresAt,
      conversation?.ctwaStartedAt,
      conversation?.canSendSession,
      conversation?.isCtwaLead,
      conversation?.isFepOpen,
      conversation?.isWindowOpen,
    ],
  )

  const headerChip = model && variant === 'header' ? HEADER_CHIP[model.kind] : null
  const showHeader =
    !!model && variant === 'header' && showHeaderWindowChip(model) && !!headerChip
  const expiresAt = showHeader ? model?.expiresAt ?? null : null
  const shouldRunClock = showHeader && !!expiresAt
  const now = useSecondTick(shouldRunClock)
  const remaining = expiresAt
    ? Math.max(0, new Date(expiresAt).getTime() - now)
    : 0

  if (!model) return null

  if (variant === 'header') {
    if (!showHeader || !headerChip) return null

    const clock =
      expiresAt && remaining > 0 ? formatCountdown(remaining) : '0:00'

    return (
      <View className={`mr-1 items-center rounded-xl px-2.5 py-1 ${headerChip.chipBg}`}>
        <Text className={`text-[10px] font-semibold uppercase tracking-wide ${headerChip.labelColor}`}>
          {headerChip.label}
        </Text>
        {expiresAt ? (
          <Text className={`font-mono text-[15px] font-bold tabular-nums leading-tight ${headerChip.clockColor}`}>
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
