import { PropsWithChildren, useEffect, useState } from 'react';

import { ConfirmationDialog } from '@/foundation/components/overlays/ConfirmationDialog';

import { ConfirmDialogRequest, registerConfirmDialogHandler } from './dialogService';

type PendingConfirm = ConfirmDialogRequest & {
  resolve: (value: boolean) => void;
};

export function DialogProvider({ children }: PropsWithChildren) {
  const [pendingConfirms, setPendingConfirms] = useState<PendingConfirm[]>([]);
  const pendingConfirm = pendingConfirms[0] ?? null;

  useEffect(() => {
    return registerConfirmDialogHandler((request) => {
      return new Promise<boolean>((resolve) => {
        setPendingConfirms((prev) => [...prev, { ...request, resolve }]);
      });
    });
  }, []);

  const resolveCurrent = (value: boolean) => {
    setPendingConfirms((prev) => {
      const current = prev[0];
      if (!current) return prev;
      current.resolve(value);
      return prev.slice(1);
    });
  };

  return (
    <>
      {children}
      {pendingConfirm ? (
        <ConfirmationDialog
          visible
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmText={pendingConfirm.confirmText}
          cancelText={pendingConfirm.cancelText}
          onConfirm={() => {
            resolveCurrent(true);
          }}
          onCancel={() => {
            resolveCurrent(false);
          }}
        />
      ) : null}
    </>
  );
}
