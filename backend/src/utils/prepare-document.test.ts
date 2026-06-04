import { describe, expect, it } from 'vitest'
import {
  prepareDocumentForWhatsApp,
  sanitizeDocumentFilename,
} from './prepare-document.js'
import { WA_DOCUMENT_MAX_BYTES } from './wa-media-limits.js'

describe('prepareDocumentForWhatsApp', () => {
  it('sanitizes unsafe filenames', () => {
    expect(sanitizeDocumentFilename('../../evil.pdf')).toBe('.._.._evil.pdf')
    expect(sanitizeDocumentFilename('report.pdf')).toBe('report.pdf')
  })

  it('rejects blocked executable extensions', async () => {
    await expect(
      prepareDocumentForWhatsApp(Buffer.from('MZ'), 'setup.exe', 'application/octet-stream'),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('rejects documents over 100MB', async () => {
    const big = Buffer.alloc(WA_DOCUMENT_MAX_BYTES + 1)
    await expect(
      prepareDocumentForWhatsApp(big, 'large.pdf', 'application/pdf'),
    ).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' })
  })

  it('passes through valid PDFs', async () => {
    const buf = Buffer.from('%PDF-1.4')
    const prepared = await prepareDocumentForWhatsApp(buf, 'quote.pdf', 'application/pdf')
    expect(prepared.mime).toBe('application/pdf')
    expect(prepared.buffer).toEqual(buf)
  })
})
