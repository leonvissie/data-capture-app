import { PropsWithChildren } from 'react';

import { AppModal } from '@/foundation/components/modals/AppModal';

export function BottomSheet({
  visible,
  title,
  onRequestClose,
  children,
  headerRight,
}: PropsWithChildren<{ visible: boolean; title: string; onRequestClose: () => void; headerRight?: React.ReactNode }>) {
  return (
    <AppModal visible={visible} title={title} onRequestClose={onRequestClose} headerRight={headerRight}>
      {children}
    </AppModal>
  );
}
