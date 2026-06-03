import { describe, expect, it } from 'vitest'
import {
  canActivateCtwaFep,
  freeEntryPointExpiresAt,
  isFreeEntryPointOpen,
  resolveMessagingState,
} from './messaging-windows.js'

describe('messaging-windows', () => {
  it('opens session replies while CSW active', () => {
    const state = resolveMessagingState({
      windowExpiresAt: new Date(Date.now() + 60_000),
      fepExpiresAt: null,
      ctwaClid: null,
      ctwaStartedAt: null,
      createdAt: new Date(),
    })
    expect(state.canSendSession).toBe(true)
    expect(state.needsTemplateForReply).toBe(false)
  })

  it('requires templates when CSW closed even if FEP open', () => {
    const state = resolveMessagingState({
      windowExpiresAt: new Date(Date.now() - 1000),
      fepExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      ctwaClid: 'clid',
      ctwaStartedAt: new Date(Date.now() - 60_000),
      createdAt: new Date(),
    })
    expect(state.canSendSession).toBe(false)
    expect(state.isFepOpen).toBe(true)
    expect(state.needsTemplateForReply).toBe(true)
  })

  it('activates FEP only within 24h of CTWA start', () => {
    const started = new Date(Date.now() - 23 * 60 * 60 * 1000)
    expect(
      canActivateCtwaFep({
        ctwaStartedAt: started,
        ctwaClid: 'x',
        createdAt: started,
        fepExpiresAt: null,
      }),
    ).toBe(true)
    expect(
      canActivateCtwaFep({
        ctwaStartedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        ctwaClid: 'x',
        createdAt: new Date(),
        fepExpiresAt: null,
      }),
    ).toBe(false)
  })

  it('FEP lasts 72 hours from business reply', () => {
    const reply = new Date()
    const end = freeEntryPointExpiresAt(reply)
    expect(end.getTime() - reply.getTime()).toBe(72 * 60 * 60 * 1000)
    expect(isFreeEntryPointOpen(end)).toBe(true)
  })
})
