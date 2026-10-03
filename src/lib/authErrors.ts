type AuthErrorLike = {
  message?: string;
  code?: string;
  status?: number;
};

export const PASSWORD_RESET_CODE_ERROR = 'That code is incorrect or has expired. Check the newest email or tap Resend code.';
export const PASSWORD_RESET_RATE_LIMIT_ERROR = 'Please wait a minute before requesting another code.';
export const PASSWORD_RESET_OFFLINE_ERROR = "You're offline. Connect to the internet to reset your password.";

function getAuthErrorDetails(error: unknown): { authError: AuthErrorLike; rawMessage: string; normalized: string } {
  const authError = (error && typeof error === 'object' ? error : {}) as AuthErrorLike;
  const rawMessage = authError.message || (error instanceof Error ? error.message : 'Authentication error');
  return {
    authError,
    rawMessage,
    normalized: `${authError.code || ''} ${rawMessage}`.toLowerCase(),
  };
}

function isRateLimited(authError: AuthErrorLike, normalized: string): boolean {
  return authError.status === 429
    || normalized.includes('rate limit')
    || normalized.includes('over_email_send_rate_limit')
    || normalized.includes('email_rate_limit_exceeded');
}

function isOffline(normalized: string): boolean {
  return (typeof navigator !== 'undefined' && navigator.onLine === false)
    || normalized.includes('failed to fetch')
    || normalized.includes('networkerror')
    || normalized === 'load failed';
}

export function getPasswordResetErrorMessage(error: unknown, action: 'request' | 'verify'): string {
  const { authError, rawMessage, normalized } = getAuthErrorDetails(error);

  if (isOffline(normalized)) return PASSWORD_RESET_OFFLINE_ERROR;
  if (isRateLimited(authError, normalized) || normalized.includes('for security purposes')) {
    return PASSWORD_RESET_RATE_LIMIT_ERROR;
  }

  if (
    action === 'verify'
    && (normalized.includes('invalid') || normalized.includes('expired') || normalized.includes('otp'))
  ) {
    return PASSWORD_RESET_CODE_ERROR;
  }

  if (action === 'request') return 'We could not send a reset code. Please try again.';

  return rawMessage;
}

export function getAuthErrorMessage(error: unknown): string {
  const { authError, rawMessage, normalized } = getAuthErrorDetails(error);

  if (isRateLimited(authError, normalized)) {
    return 'Too many account emails were requested. Please wait and try again.';
  }

  if (rawMessage === 'Load failed') {
    return 'Could not reach Supabase. Check VITE_SUPABASE_URL and network access.';
  }

  return rawMessage;
}
