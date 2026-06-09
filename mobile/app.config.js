/** @type {import('expo/config').ExpoConfig} */
const appJson = require('./app.json')

/**
 * APP_VARIANT=production  -> standalone release sideload (Render), separate Android package
 * APP_VARIANT=development -> dev client (default), com.salesinbox.app
 */
const variant = process.env.APP_VARIANT === 'production' ? 'production' : 'development'
const isProduction = variant === 'production'

const androidPackage = isProduction ? 'com.salesinbox.app.prod' : 'com.salesinbox.app'
const appName = isProduction ? 'Sales Inbox Prod' : 'Sales Inbox Dev'
const scheme = isProduction ? 'salesinbox' : 'salesinbox-dev'

module.exports = {
  expo: {
    ...appJson.expo,
    name: appName,
    scheme,
    android: {
      ...appJson.expo.android,
      package: androidPackage,
      adaptiveIcon: {
        ...appJson.expo.android.adaptiveIcon,
        // Green ring on prod so the two installs are easy to tell apart on the launcher.
        backgroundColor: isProduction ? '#128C4B' : '#ffffff',
      },
    },
    ios: {
      ...appJson.expo.ios,
      bundleIdentifier: androidPackage,
    },
  },
}
