import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffmpegStatic from 'ffmpeg-static'

/** Prefer newer ffmpeg-static (decodes current iOS AAC); fallback to installer. */
export function getFfmpegPath(): string {
  if (ffmpegStatic && typeof ffmpegStatic === 'string') return ffmpegStatic
  return ffmpegInstaller.path
}
