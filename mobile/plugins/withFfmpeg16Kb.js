const { withProjectBuildGradle, withAppBuildGradle } = require('@expo/config-plugins')

const FFMPEG_16KB = "io.github.minorlai:ffmpeg-kit-16kb:6.1.2"
const FFMPEG_OLD = "io.github.maitrungduc1410:ffmpeg-kit-min"

/**
 * react-native-video-trim ships FFmpegKit 6.0.1 (4KB page alignment).
 * Android 15+ devices crash with ExceptionInInitializerError — swap in 16KB build.
 */
function withFfmpeg16Kb(config) {
  config = withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents
    if (!contents.includes('ffmpeg-kit-16kb')) {
      const injection = `
  configurations.all {
    resolutionStrategy.dependencySubstitution {
      substitute(module('${FFMPEG_OLD}')).using(module('${FFMPEG_16KB}'))
    }
  }
`
      if (contents.includes('allprojects {')) {
        contents = contents.replace(/allprojects\s*\{/, `allprojects {${injection}`)
      } else {
        contents += `\nallprojects {${injection}}\n`
      }
    }
    cfg.modResults.contents = contents
    return cfg
  })

  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents
    if (!contents.includes('ffmpeg-kit-16kb')) {
      contents = contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    implementation("${FFMPEG_16KB}")`,
      )
    }
    cfg.modResults.contents = contents
    return cfg
  })

  return config
}

module.exports = withFfmpeg16Kb
