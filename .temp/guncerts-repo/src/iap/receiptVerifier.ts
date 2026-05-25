export type ReceiptVerificationInput = {
  platform: 'ios' | 'android';
  sku: string;
  transactionId?: string;
  tokenOrReceipt?: string;
  submissionId: string;
};

export type ReceiptVerificationResult = {
  ok: boolean;
  reason?: string;
};

export interface ReceiptVerifier {
  verify: (input: ReceiptVerificationInput) => Promise<ReceiptVerificationResult>;
}

export class OfflineReceiptVerifier implements ReceiptVerifier {
  async verify(): Promise<ReceiptVerificationResult> {
    return { ok: true };
  }
}
