const { withAppBuildGradle } = require('@expo/config-plugins');

const DEFAULT_NDK_VERSION = '28.0.13004108';

function setNdkVersion(contents, ndkVersion) {
  const replacement = `ndkVersion "${ndkVersion}"`;

  if (/ndkVersion\s+rootProject\.ext\.ndkVersion/.test(contents)) {
    return contents.replace(/ndkVersion\s+rootProject\.ext\.ndkVersion/, replacement);
  }

  if (/ndkVersion\s+["'][^"']+["']/.test(contents)) {
    return contents.replace(/ndkVersion\s+["'][^"']+["']/, replacement);
  }

  return contents;
}

module.exports = function withAndroidNdkVersion(config, props = {}) {
  const ndkVersion = props.ndkVersion || process.env.ANDROID_NDK_VERSION || DEFAULT_NDK_VERSION;

  return withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = setNdkVersion(modConfig.modResults.contents, ndkVersion);
    return modConfig;
  });
};
