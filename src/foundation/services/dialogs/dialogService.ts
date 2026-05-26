export type ConfirmDialogRequest = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
};

type ConfirmDialogHandler = (request: ConfirmDialogRequest) => Promise<boolean>;

let confirmDialogHandler: ConfirmDialogHandler | null = null;

export function registerConfirmDialogHandler(handler: ConfirmDialogHandler) {
  confirmDialogHandler = handler;
  return () => {
    if (confirmDialogHandler === handler) {
      confirmDialogHandler = null;
    }
  };
}

export async function confirmDialog(request: ConfirmDialogRequest): Promise<boolean> {
  if (!confirmDialogHandler) return false;
  return confirmDialogHandler(request);
}
