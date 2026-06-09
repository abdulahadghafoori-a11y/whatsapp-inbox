import { describe, expect, it } from 'vitest'
import { buildChatListLayouts } from '@/lib/chatListItemLayout'

describe('buildChatListLayouts', () => {
  it('builds cumulative offsets', () => {
    const data = [
      { layoutHeight: 80 },
      { layoutHeight: 52 },
      { layoutHeight: 60 },
    ] as Parameters<typeof buildChatListLayouts>[0]
    expect(buildChatListLayouts(data)).toEqual([
      { length: 80, offset: 0 },
      { length: 52, offset: 80 },
      { length: 60, offset: 132 },
    ])
  })
})
