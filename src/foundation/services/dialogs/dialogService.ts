export type ConfirmDialogRequest = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
};

export async function confirmDialog(_request: ConfirmDialogRequest): Promise<boolean> {
  return false;
}
