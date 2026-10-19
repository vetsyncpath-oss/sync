export class SyncFault extends Error {
  constructor(
    public code: string,
    message: string,
    public scope = "file",
    public retryable = false,
  ) {
    super(message);
    this.name = "SyncFault";
  }
}
