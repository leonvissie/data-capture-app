import { Alert } from 'react-native';
import { isDeviceOffline } from './connectivity';

type LibraryConnectivityOptions = {
  onProceedLibrary: () => void | Promise<void>;
  onUseCamera?: () => void | Promise<void>;
  title?: string;
  message?: string;
  proceedLabel?: string;
  cameraLabel?: string;
  cancelLabel?: string;
};

const defaultTitle = 'You seem to be offline';
const defaultMessage =
  'Photos stored in the cloud may not download without an internet connection. Use your camera instead?';

/**
 * Checks connectivity before opening the photo library and prompts the user when offline.
 * Falls back to the camera when the user chooses that option while offline.
 */
export async function promptLibraryConnectivity(options: LibraryConnectivityOptions) {
  const {
    onProceedLibrary,
    onUseCamera,
    title = defaultTitle,
    message = defaultMessage,
    proceedLabel = 'Open library anyway',
    cameraLabel = 'Use camera',
    cancelLabel = 'Cancel',
  } = options;

  if (!(await isDeviceOffline())) {
    await onProceedLibrary();
    return;
  }

  return new Promise<void>(resolve => {
    const buttons = [
      onUseCamera
        ? {
            text: cameraLabel,
            onPress: () =>
              Promise.resolve(onUseCamera()).finally(() => {
                resolve();
              }),
          }
        : null,
      {
        text: proceedLabel,
        onPress: () =>
          Promise.resolve(onProceedLibrary()).finally(() => {
            resolve();
          }),
      },
      { text: cancelLabel, style: 'cancel', onPress: () => resolve() },
    ].filter(Boolean) as { text: string; style?: 'cancel'; onPress: () => void }[];

    Alert.alert(title, message, buttons, { cancelable: true });
  });
}
