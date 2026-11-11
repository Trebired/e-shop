class EshopError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>|undefined;
  readonly status: number;

  constructor(status: number, code: string, details?: Record<string, unknown>) {
    super(code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

function badRequest(code: string, details?: Record<string, unknown>): EshopError {
  return new EshopError(400, code, details);
}

function notFound(code: string): EshopError {
  return new EshopError(404, code);
}

function conflict(code: string, details?: Record<string, unknown>): EshopError {
  return new EshopError(409, code, details);
}

export { badRequest, conflict, EshopError, notFound };
