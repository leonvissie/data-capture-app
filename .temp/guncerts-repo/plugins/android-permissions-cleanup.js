const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const PERMISSIONS_TO_REMOVE = new Set([
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
]);

const removePermissionsFromManifest = (manifest) => {
  const permissions = manifest.manifest['uses-permission'] ?? [];
  manifest.manifest['uses-permission'] = permissions.filter((perm) => {
    const name = perm.$?.['android:name'];
    return !PERMISSIONS_TO_REMOVE.has(name);
  });
};

const ensureToolsNamespace = (manifest) => {
  manifest.manifest.$ = manifest.manifest.$ ?? {};
  if (!manifest.manifest.$['xmlns:tools']) {
    manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  }
};

const addRemoveEntries = (manifest) => {
  const permissions = manifest.manifest['uses-permission'] ?? [];
  const existing = new Set(
    permissions.map((perm) => perm.$?.['android:name']).filter(Boolean)
  );

  for (const permission of PERMISSIONS_TO_REMOVE) {
    if (existing.has(permission)) continue;
    permissions.push({
      $: {
        'android:name': permission,
        'tools:node': 'remove',
      },
    });
  }

  manifest.manifest['uses-permission'] = permissions;
};

const withAndroidPermissionsCleanup = (config) => {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    ensureToolsNamespace(manifest);
    removePermissionsFromManifest(manifest);
    addRemoveEntries(manifest);
    return config;
  });

  // Also patch the generated manifest after prebuild, to override any library additions.
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const manifestPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'AndroidManifest.xml'
      );

      try {
        let contents = fs.readFileSync(manifestPath, 'utf8');

        if (!contents.includes('xmlns:tools=')) {
          contents = contents.replace(
            /<manifest(\s+)/,
            '<manifest$1xmlns:tools="http://schemas.android.com/tools" '
          );
        }

        for (const permission of PERMISSIONS_TO_REMOVE) {
          const existingRemove = new RegExp(
            `<uses-permission[^>]*android:name="${permission}"[^>]*tools:node="remove"[^>]*/>`,
            'm'
          );
          if (!existingRemove.test(contents)) {
            contents = contents.replace(
              /<manifest[^>]*>\s*/m,
              (match) =>
                `${match}  <uses-permission android:name="${permission}" tools:node="remove" />\n`
            );
          }

          const lineRegex = new RegExp(
            `\\n\\s*<uses-permission[^>]*android:name="${permission}"[^>]*\\/?>`,
            'g'
          );
          contents = contents.replace(lineRegex, (line) => {
            return line.includes('tools:node="remove"') ? line : '';
          });
        }

        fs.writeFileSync(manifestPath, contents);
      } catch {
        // ignore if missing during prebuild
      }
      return config;
    },
  ]);

  return config;
};

module.exports = withAndroidPermissionsCleanup;
