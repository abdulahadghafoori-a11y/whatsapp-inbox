export type ErrorCode =
  | 'WINDOW_EXPIRED'
  | 'WHATSAPP_API_ERROR'
  | 'MEDIA_TOO_LARGE'
  | 'INVALID_SIGNATURE'
  | 'TOKEN_REVOKED'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONVERSATION_NOT_FOUND'
  | 'ASSIGNMENT_FORBIDDEN'
  | 'DUPLICATE_MESSAGE'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'

/**
 * Application error with a stable machine-readable `code` and an HTTP status.
 * Serialized by the global error handler into:
 *   { error, code, statusCode }
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, statusCode = 400, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

export const errors = {
  windowExpired: () =>
    new AppError(
      'WINDOW_EXPIRED',
      '24-hour window closed. Use a Message Template instead.',
      422,
    ),
  whatsappApi: (message: string, details?: unknown) =>
    new AppError('WHATSAPP_API_ERROR', message, 502, details),
  mediaTooLarge: () =>
    new AppError('MEDIA_TOO_LARGE', 'File exceeds the 50MB limit.', 413),
  invalidSignature: () =>
    new AppError('INVALID_SIGNATURE', 'Webhook signature mismatch.', 403),
  tokenRevoked: () =>
    new AppError('TOKEN_REVOKED', 'Your session was revoked. Please log in again.', 401),
  rateLimited: () =>
    new AppError('RATE_LIMITED', 'Too many messages. Slow down.', 429),
  unauthorized: (message = 'Unauthorized') =>
    new AppError('UNAUTHORIZED', message, 401),
  forbidden: (message = 'Forbidden') => new AppError('FORBIDDEN', message, 403),
  notFound: (message = 'Not found') => new AppError('NOT_FOUND', message, 404),
  conversationNotFound: () =>
    new AppError('CONVERSATION_NOT_FOUND', 'Conversation not found.', 404),
  assignmentForbidden: (message = 'Not allowed to change assignment.') =>
    new AppError('ASSIGNMENT_FORBIDDEN', message, 403),
  duplicateMessage: () =>
    new AppError('DUPLICATE_MESSAGE', 'Message already processed.', 409),
  validation: (message: string, details?: unknown) =>
    new AppError('VALIDATION_ERROR', message, 400, details),
}
