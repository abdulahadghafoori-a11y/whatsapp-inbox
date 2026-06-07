/** Align @imcooder/opuslib with Expo/RN root ndkVersion (avoids CXX1104 on local builds). */
const fs = require('fs')
const path = require('path')

const file = path.join(
  __dirname,
  '../node_modules/@imcooder/opuslib/android/build.gradle',
)

if (!fs.existsSync(file)) process.exit(0)

const needle = 'android {\n  namespace "expo.modules.opuslib"'
const patch = `android {
  if (rootProject.hasProperty("ndkVersion")) {
    ndkVersion rootProject.ext.ndkVersion
  }
  namespace "expo.modules.opuslib"`

let src = fs.readFileSync(file, 'utf8')
if (src.includes('ndkVersion rootProject.ext.ndkVersion')) process.exit(0)
if (!src.includes(needle)) {
  console.warn('patch-opuslib-ndk: unexpected build.gradle shape, skipped')
  process.exit(0)
}
fs.writeFileSync(file, src.replace(needle, patch))
console.log('patch-opuslib-ndk: applied')
