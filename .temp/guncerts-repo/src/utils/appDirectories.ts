import { Directory, Paths } from 'expo-file-system/next';

type DirectoryInfo = {
  documentDirectory: string | null;
  cacheDirectory: string | null;
};

export async function getAppDirectories(): Promise<DirectoryInfo> {
  let documentRoot: string | null = null;
  let cacheRoot: string | null = null;
  try {
    documentRoot = Paths.document?.uri ?? null;
  } catch {
    documentRoot = null;
  }
  try {
    cacheRoot = Paths.cache?.uri ?? null;
  } catch {
    cacheRoot = null;
  }

  const docsDir = documentRoot ? new Directory(documentRoot) : null;
  const cacheDir = cacheRoot ? new Directory(cacheRoot) : null;

  // await Promise.all([
  //   docsDir.create({ intermediates: true }),
  //   cacheDir.create({ intermediates: true }),
  // ]);

  return {
    documentDirectory: docsDir?.uri ?? null,
    cacheDirectory: cacheDir?.uri ?? null,
  };
}
