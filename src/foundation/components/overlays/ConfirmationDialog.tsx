import { AppModal } from '@/foundation/components/modals/AppModal';
import { PrimaryButton } from '@/foundation/components/buttons/PrimaryButton';
import { SecondaryButton } from '@/foundation/components/buttons/SecondaryButton';
import { AppText } from '@/foundation/components/layout/AppText';

export function ConfirmationDialog({ visible, title, message, onConfirm, onCancel }: { visible: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <AppModal visible={visible} title={title} onRequestClose={onCancel}>
      <AppText>{message}</AppText>
      <PrimaryButton label="Confirm" onPress={onConfirm} />
      <SecondaryButton label="Cancel" onPress={onCancel} />
    </AppModal>
  );
}
