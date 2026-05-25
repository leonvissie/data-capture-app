import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

type EnsurePermissionOptions = {
  title?: string;
  message?: string;
  settingsMessage?: string;
};

type EnsurePhotoLibraryOptions = EnsurePermissionOptions & {
  showLimitedAccessAlert?: boolean;
  onDisableLimitedAccessAlert?: () => void;
};

const showAlertAsync = (
  title: string,
  message: string,
  buttons?: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }>,
): Promise<void> =>
  new Promise((resolve) => {
    const resolvedButtons =
      buttons?.length
        ? buttons.map((button) => ({
          ...button,
          onPress: () => {
            button.onPress?.();
            resolve();
          },
        }))
        : [{ text: 'OK', onPress: () => resolve() }];
    Alert.alert(title, message, resolvedButtons, {
      cancelable: false,
      onDismiss: () => resolve(),
    });
  });

export async function ensureCameraPermission(
  options: EnsurePermissionOptions = {},
): Promise<boolean> {
  const {
    title = 'Camera access needed',
    message = 'Allow camera access to capture a photo.',
    settingsMessage = 'Camera access is disabled. Open Settings to enable it.',
  } = options;

  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;

  if (current.canAskAgain) {
    const requested = await ImagePicker.requestCameraPermissionsAsync();
    if (requested.granted) return true;
  }

  Alert.alert(title, settingsMessage, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Open Settings',
      onPress: () => {
        void Linking.openSettings();
      },
    },
  ]);
  return false;
}

export async function ensurePhotoLibraryPermission(
  options: EnsurePhotoLibraryOptions = {},
): Promise<boolean> {
  if (Platform.OS === 'android') {
    // Use the system picker on Android; avoid broad media permissions.
    return true;
  }

  const {
    title = 'Photo library access needed',
    message = 'Allow photo library access to select a photo.',
    settingsMessage = 'Photo library access is disabled. Open Settings to enable it.',
    showLimitedAccessAlert = true,
    onDisableLimitedAccessAlert,
  } = options;

  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) {
    const access = (current as any)?.accessPrivileges;
    if (access === 'limited' && showLimitedAccessAlert) {
      await showAlertAsync(
        'Limited photo access',
        'iOS will show your full library in the picker. Any photo you select will be added to this app\'s allowed list.',
        onDisableLimitedAccessAlert
          ? [
            { text: 'OK' },
            { text: "Don't show again", onPress: onDisableLimitedAccessAlert },
          ]
          : undefined,
      );
    }
    return true;
  }

  if (current.canAskAgain) {
    const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (requested.granted) return true;
  }

  Alert.alert(title, settingsMessage, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Open Settings',
      onPress: () => {
        void Linking.openSettings();
      },
    },
  ]);
  return false;
}
