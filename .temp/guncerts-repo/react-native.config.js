module.exports = {
  // Kept explicit so React Native autolinking cache invalidates when this file changes.
  project: {
    android: {
      packageName: 'com.ureondigital.guncerts',
    },
  },
  dependencies: {
    'react-native-pdf-thumbnail': {
      platforms: {
        android: {
          packageImportPath: 'import org.songsterq.pdfthumbnail.PdfThumbnailPackage;',
          packageInstance: 'new PdfThumbnailPackage()',
        },
      },
    },
  },
};
