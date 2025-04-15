// Define custom error types for better error handling

export class FileError extends Error {
  constructor(message: string, cause?: any) {
    super(message);
    this.name = 'FileError';
    this.cause = cause;
  }
}

export class PathAccessError extends FileError {
  constructor(message: string, cause?: any) {
    super(`Path access error: ${message}`, cause);
    this.name = 'PathAccessError';
  }
}

export class RepositoryPackagingError extends FileError {
  constructor(message: string, cause?: any) {
    super(`Repository packaging error: ${message}`, cause);
    this.name = 'RepositoryPackagingError';
  }
}

export class ApiKeyMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyMissingError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, cause?: any) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}
