const NON_RETRYABLE_PATTERNS = [
  /ENOENT/,
  /EACCES/,
  /EPERM/,
  /not found at/,
  /No such file or directory/,
  /Permission denied/,
  /ENOTDIR/,
  /is not a directory/,
  /Cannot find module/,
]

export function isNonRetryableError(errorMessage: string): boolean {
  return NON_RETRYABLE_PATTERNS.some((pattern) => pattern.test(errorMessage))
}
