import { describe, it, expect } from 'vitest'
import { LoginThrottle } from './login-throttle.js'

describe('LoginThrottle', () => {
  it('allows up to max attempts then blocks within the window', () => {
    const t = new LoginThrottle(3, 1000)
    const key = '1.2.3.4:user@example.com'
    expect(t.register(key, 0)).toBe(true)
    expect(t.register(key, 0)).toBe(true)
    expect(t.register(key, 0)).toBe(true)
    expect(t.register(key, 0)).toBe(false)
  })

  it('resets after the window elapses', () => {
    const t = new LoginThrottle(2, 1000)
    const key = 'k'
    expect(t.register(key, 0)).toBe(true)
    expect(t.register(key, 0)).toBe(true)
    expect(t.register(key, 0)).toBe(false)
    // After the window, the counter resets.
    expect(t.register(key, 1001)).toBe(true)
  })

  it('clear() resets the counter (e.g. after a successful login)', () => {
    const t = new LoginThrottle(2, 1000)
    const key = 'k'
    t.register(key, 0)
    t.register(key, 0)
    expect(t.register(key, 0)).toBe(false)
    t.clear(key)
    expect(t.register(key, 0)).toBe(true)
  })

  it('tracks distinct keys independently', () => {
    const t = new LoginThrottle(1, 1000)
    expect(t.register('a', 0)).toBe(true)
    expect(t.register('a', 0)).toBe(false)
    expect(t.register('b', 0)).toBe(true)
  })
})
