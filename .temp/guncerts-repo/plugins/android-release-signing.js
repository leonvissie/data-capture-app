const {
  withAppBuildGradle,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const KEYSTORE_SNIPPET = `
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
def hasReleaseKeystore = keystorePropertiesFile.exists()
if (hasReleaseKeystore) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
`;

const RELEASE_SIGNING_SNIPPET = `
        release {
            def storeFilePath = hasReleaseKeystore ? keystoreProperties['storeFile'] : null
            def storeFileFromProps = project.findProperty("ANDROID_KEYSTORE_PATH")
            if (!storeFilePath && storeFileFromProps) {
                storeFilePath = storeFileFromProps
            }
            if (!storeFilePath) {
                throw new RuntimeException("Missing keystore file path. Provide keystore.properties storeFile or ANDROID_KEYSTORE_PATH in gradle.properties/env.")
            }
            storeFile file(storeFilePath)
            def storePass = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: keystoreProperties['storePassword'] ?: project.findProperty("ANDROID_KEYSTORE_PASSWORD")
            def keyAliasValue = System.getenv("ANDROID_KEY_ALIAS") ?: keystoreProperties['keyAlias'] ?: project.findProperty("ANDROID_KEY_ALIAS")
            def keyPass = System.getenv("ANDROID_KEY_PASSWORD") ?: keystoreProperties['keyPassword'] ?: project.findProperty("ANDROID_KEY_PASSWORD")
            if (!storePass || !keyAliasValue || !keyPass) {
                throw new RuntimeException("Missing Android keystore credentials. Set ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD in env, keystore.properties, or ~/.gradle/gradle.properties.")
            }
            storePassword storePass
            keyAlias keyAliasValue
            keyPassword keyPass
        }`;

const SIGNING_CONFIGS_BLOCK = `
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
${RELEASE_SIGNING_SNIPPET}
    }`;

const withAndroidReleaseSigning = (config) => {
  const forceReleaseSigning = (contents) => {
    // Prefer a direct replacement inside the release block to avoid regex edge cases.
    let updated = contents;
    const releaseSigningRegex = /release\s*\{([\s\S]*?)signingConfig\s+signingConfigs\.debug/;
    if (releaseSigningRegex.test(updated)) {
      updated = updated.replace(
        releaseSigningRegex,
        'release {$1signingConfig signingConfigs.release'
      );
    }

    // If release block exists but has no signingConfig, inject it.
    const releaseBlockRegex = /release\s*\{([\s\S]*?)\n\s*\}/m;
    if (!/signingConfig\s+signingConfigs\.release/.test(updated)) {
      updated = updated.replace(
        releaseBlockRegex,
        (match, body) => `release {${body}\n            signingConfig signingConfigs.release\n        }`
      );
    }

    return updated;
  };

  config = withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes('keystoreProperties = new Properties()')) {
      const anchor = 'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()';
      if (contents.includes(anchor)) {
        contents = contents.replace(
          anchor,
          `${anchor}\n${KEYSTORE_SNIPPET.trim()}`
        );
      } else {
        contents = `${KEYSTORE_SNIPPET.trim()}\n${contents}`;
      }
    }

    const signingConfigsMatch = contents.match(/signingConfigs\s*\{[\s\S]*?\n\s*\}/m);
    if (signingConfigsMatch) {
      contents = contents.replace(signingConfigsMatch[0], SIGNING_CONFIGS_BLOCK);
    } else if (contents.includes('buildTypes {')) {
      contents = contents.replace(
        'buildTypes {',
        `${SIGNING_CONFIGS_BLOCK}\n\n    buildTypes {`
      );
    }

    contents = forceReleaseSigning(contents);

    // Clean up any accidental extra closing brace between signingConfigs and buildTypes.
    contents = contents.replace(
      /\n(\s*\})\n\s*\}\n(\s*buildTypes\s*\{)/m,
      '\n$1\n$2'
    );

    config.modResults.contents = contents;
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      // Ensure release signing is enforced even if the build.gradle template changes.
      const appBuildGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'build.gradle'
      );
      try {
        let gradle = fs.readFileSync(appBuildGradlePath, 'utf8');
        const updated = forceReleaseSigning(gradle);
        if (updated !== gradle) {
          fs.writeFileSync(appBuildGradlePath, updated);
        }
      } catch {
        // ignore if file is missing during prebuild
      }

      const gitignorePath = path.join(config.modRequest.platformProjectRoot, '.gitignore');
      let gitignore = '';
      try {
        gitignore = fs.readFileSync(gitignorePath, 'utf8');
      } catch {
        return config;
      }
      if (!gitignore.includes('keystore.properties')) {
        fs.writeFileSync(
          gitignorePath,
          `${gitignore.replace(/\s*$/, '')}\nkeystore.properties\n`
        );
      }
      return config;
    },
  ]);

  return config;
};

module.exports = withAndroidReleaseSigning;
