import * as ImagePicker from 'expo-image-picker';

export const launchImageLibraryStandardAsync = (
  options: ImagePicker.ImagePickerOptions = {},
) => {
  const presentationStyle =
    (options as any).presentationStyle ??
    (ImagePicker as any)?.UIImagePickerPresentationStyle?.FULL_SCREEN ??
    'fullScreen';

  return ImagePicker.launchImageLibraryAsync({
    ...options,
    presentationStyle,
  } as any);
};
