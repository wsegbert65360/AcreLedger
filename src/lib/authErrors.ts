type AuthErrorLike = {
  message?: string;
  code?: string;
  status?: number;
};

export function getAuthErrorMessage(error: unknown): string {
  const authError = (error && typeof error === 'object' ? error : {}) as AuthErrorLike;
  const rawMessage = authError.message || (error instanceof Error ? error.message : 'Authentication error');
  const normalized = `${authError.code || ''} ${rawMessage}`.toLowerCase();

  if (
    authError.status === 429
    || normalized.includes('rate limit')
    || normalized.includes('over_email_send_rate_limit')
    || normalized.includes('email_rate_limit_exceeded')
  ) {
    return 'Too many account emails were requested. Please wait and try again.';
  }

  if (rawMessage === 'Load failed') {
    return 'Could not reach Supabase. Check VITE_SUPABASE_URL and network access.';
  }

  return rawMessage;
}
