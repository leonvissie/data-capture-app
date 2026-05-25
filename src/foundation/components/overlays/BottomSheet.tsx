import { PropsWithChildren } from 'react';

import { AppModal } from '@/foundation/components/modals/AppModal';

export function BottomSheet({ visible, title, onRequestClose, children }: PropsWithChildren<{ visible: boolean; title: string; onRequestClose: () => void }>) {
  return (
    <AppModal visible={visible} title={title} onRequestClose={onRequestClose}>
      {children}
    </AppModal>
  );
}
