import { Alert } from 'react-native';

let warnedTempStorage = false;

export function warnTempStorageFallback() {
  if (warnedTempStorage) return;
  warnedTempStorage = true;
  Alert.alert(
    'Limited storage available',
    "Your device doesn't provide a documents directory. Files will be stored in temporary storage and won't sync to cloud (if enabled)."
  );
}
