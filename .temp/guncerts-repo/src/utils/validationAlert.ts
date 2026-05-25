import { Alert } from 'react-native';

export type ValidationAlertItem = {
  label: string;
  message: string;
};

type ShowValidationAlertOptions = {
  title?: string;
  intro?: string;
  items: ValidationAlertItem[];
  onPressOk?: () => void;
};

export const showValidationAlert = ({
  title = 'Validation failed',
  intro = 'Please correct the following fields:',
  items,
  onPressOk,
}: ShowValidationAlertOptions) => {
  if (!items.length) return;
  const details = items.map((item) => `• ${item.label}: ${item.message}`).join('\n');
  Alert.alert(title, `${intro}\n\n${details}`, [{ text: 'OK', onPress: onPressOk }], {
    cancelable: false,
  });
};
