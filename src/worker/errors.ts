export class PermanentProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentProcessingError";
  }
}
