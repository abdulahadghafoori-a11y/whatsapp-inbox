import 'dotenv/config'
import { prepareAudioForWhatsApp } from '../src/utils/transcode-audio.js'
import { S3Service } from '../src/services/s3.js'
import { getFfmpegPath } from '../src/utils/ffmpeg-path.js'
import { spawnSync } from 'child_process'

const ffmpeg = getFfmpegPath()
const ver = spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' })
console.log('ffmpeg:', ver.stdout?.split('\n')[0] ?? ver.error)

const key =
  process.argv[2] ??
  'media/088ca1e2-29e6-42b9-9a61-86ae6762a70b/outbound/1780519018381-voice-1780519011222.m4a'

const s3 = new S3Service()
console.log('downloading', key)
const buf = await s3.downloadFromS3(key)
console.log('input bytes', buf.length, 'magic', buf.subarray(0, 8).toString('hex'))

try {
  const r = await prepareAudioForWhatsApp(buf, 'voice-test.m4a', {
    log: {
      info: (o, m) => console.log('INFO', m, o),
      warn: (o, m) => console.warn('WARN', m, o),
    },
  })
  console.log(
    'OK',
    r.mime,
    r.filename,
    r.voiceNote,
    r.buffer.length,
    r.buffer.subarray(0, 4).toString('ascii'),
  )
} catch (e) {
  console.error('FAIL', (e as Error).message)
  process.exit(1)
}
