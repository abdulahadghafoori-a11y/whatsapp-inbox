/**
 * NativeWind dev warning calls JSON.stringify on props; expo-router navigation
 * getters throw during that walk. Patch printUpgradeWarning to survive it.
 */
const fs = require('fs')
const path = require('path')

const file = path.join(
  __dirname,
  '../node_modules/react-native-css-interop/dist/runtime/native/render-component.js',
)

if (!fs.existsSync(file)) process.exit(0)

const src = fs.readFileSync(file, 'utf8')
const needle = 'function printUpgradeWarning(warning, originalProps) {'
const patched = `function printUpgradeWarning(warning, originalProps) {
    let propsText = "[props omitted]";
    try {
        propsText = stringify(originalProps);
    }
    catch {
        // Navigation/expo-router prop getters throw when walked during stringify.
    }`

if (src.includes('propsText = "[props omitted]"')) {
  process.exit(0)
}

if (!src.includes(needle)) {
  console.warn('[patch-css-interop] render-component.js layout changed; skip')
  process.exit(0)
}

const next = src.replace(
  /function printUpgradeWarning\(warning, originalProps\) \{[\s\S]*?console\.log\(`CssInterop upgrade warning/,
  `${patched}
    console.log(\`CssInterop upgrade warning`,
)

fs.writeFileSync(file, next)
console.log('[patch-css-interop] applied')
