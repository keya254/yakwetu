// @paystack/inline-js ships no types. The slice the Buy button uses:
// https://github.com/PaystackOSS/inline-js#paystackpopresumetransactionaccesscode-callbacks
declare module "@paystack/inline-js" {
  interface ResumeCallbacks {
    onSuccess?: (transaction: { id: number; reference: string; message: string }) => void;
    onCancel?: () => void;
    onError?: (error: { message: string }) => void;
    onLoad?: (response: { id: number; accessCode: string }) => void;
  }
  export default class PaystackPop {
    resumeTransaction(accessCode: string, callbacks?: ResumeCallbacks): unknown;
    cancelTransaction(id?: unknown): void;
  }
}
