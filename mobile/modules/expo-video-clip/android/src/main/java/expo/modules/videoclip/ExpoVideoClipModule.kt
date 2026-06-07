package expo.modules.videoclip

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer

/**
 * Fast stream-copy clip via MediaExtractor/Muxer — no FFmpeg.
 * Cuts at nearest keyframe before startMs (same trade-off as WA-style trim).
 */
class ExpoVideoClipModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoVideoClip")

    AsyncFunction("clip") { inputUri: String, startMs: Double, endMs: Double ->
      clipVideo(inputUri, startMs.toLong(), endMs.toLong())
    }
  }

  private fun resolvePath(uri: String): String =
    when {
      uri.startsWith("file://") -> uri.removePrefix("file://")
      else -> uri
    }

  private fun clipVideo(inputUri: String, startMs: Long, endMs: Long): String {
    if (endMs <= startMs) {
      throw CodedException("Trim end must be after start.")
    }

    val inputPath = resolvePath(inputUri)
    val inputFile = File(inputPath)
    if (!inputFile.exists() || inputFile.length() < 400) {
      throw CodedException("Video file not found or empty.")
    }

    val cacheDir =
      appContext.reactContext?.cacheDir
        ?: throw CodedException("React context unavailable.")
    val outputFile = File(cacheDir, "wa-clip-${System.currentTimeMillis()}.mp4")

    val startUs = startMs * 1000L
    val endUs = endMs * 1000L

    val extractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    try {
      extractor.setDataSource(inputPath)
      muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

      val trackCount = extractor.trackCount
      val muxerTracks = IntArray(trackCount) { -1 }
      var validTracks = 0

      for (i in 0 until trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        if (mime.startsWith("video/") || mime.startsWith("audio/")) {
          muxerTracks[i] = muxer!!.addTrack(format)
          validTracks++
        }
      }

      if (validTracks == 0) {
        throw CodedException("No video or audio track found.")
      }

      muxer!!.start()

      val buffer = ByteBuffer.allocate(2 * 1024 * 1024)
      val info = MediaCodec.BufferInfo()

      for (i in 0 until trackCount) {
        val outTrack = muxerTracks[i]
        if (outTrack < 0) continue

        extractor.selectTrack(i)
        extractor.seekTo(startUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC)

        while (true) {
          info.offset = 0
          info.size = extractor.readSampleData(buffer, 0)
          if (info.size < 0) break

          val sampleTime = extractor.sampleTime
          if (sampleTime > endUs) break
          if (sampleTime < startUs) {
            if (!extractor.advance()) break
            continue
          }

          info.presentationTimeUs = sampleTime - startUs
          info.flags = extractor.sampleFlags
          muxer!!.writeSampleData(outTrack, buffer, info)

          if (!extractor.advance()) break
        }

        extractor.unselectTrack(i)
      }

      muxer!!.stop()
    } catch (e: CodedException) {
      outputFile.delete()
      throw e
    } catch (e: Exception) {
      outputFile.delete()
      throw CodedException(e.message ?: "Could not trim video.", e)
    } finally {
      try {
        muxer?.release()
      } catch (_: Exception) {
      }
      extractor.release()
    }

    if (!outputFile.exists() || outputFile.length() < 400) {
      outputFile.delete()
      throw CodedException("Trim produced an empty file. Try a different range.")
    }

    return "file://${outputFile.absolutePath}"
  }
}
