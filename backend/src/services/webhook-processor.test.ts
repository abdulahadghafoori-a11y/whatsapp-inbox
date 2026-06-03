import { describe, expect, it } from 'vitest'

/** Minimal shape check for smb_message_echoes payloads (Chakra / coexistence). */
describe('webhook payload shapes', () => {
  it('message_echoes is separate from messages', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1699456911242528',
          changes: [
            {
              field: 'smb_message_echoes',
              value: {
                messaging_product: 'whatsapp',
                message_echoes: [
                  {
                    from: '93789979662',
                    to: '93789979662',
                    id: 'wamid.test',
                    timestamp: '1780496178',
                    type: 'text',
                    text: { body: 'Hhi' },
                  },
                ],
              },
            },
          ],
        },
      ],
    }

    const value = payload.entry[0].changes[0].value
    expect(value.messages).toBeUndefined()
    expect(value.message_echoes).toHaveLength(1)
    expect(value.message_echoes![0].text?.body).toBe('Hhi')
  })
})
