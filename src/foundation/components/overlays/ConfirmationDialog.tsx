import { AppModal } from '@/foundation/components/modals/AppModal';
import { PrimaryButton } from '@/foundation/components/buttons/PrimaryButton';
import { SecondaryButton } from '@/foundation/components/buttons/SecondaryButton';
import { AppText } from '@/foundation/components/layout/AppText';
import { View } from 'react-native';
import { spacing } from '@/foundation/theme';

export function ConfirmationDialog({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  warningItems,
}: {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  warningItems?: string[];
}) {
  return (
    <AppModal visible={visible} title={title} onRequestClose={onCancel}>
      <AppText>{message}</AppText>
      {warningItems && warningItems.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          {warningItems.map((item, index) => (
            <AppText key={`${index}-${item}`}>{`• ${item}`}</AppText>
          ))}
        </View>
      ) : null}
      <PrimaryButton label={confirmText} onPress={onConfirm} />
      <SecondaryButton label={cancelText} onPress={onCancel} />
    </AppModal>
  );
}
