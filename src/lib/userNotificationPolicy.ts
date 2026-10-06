export const USER_EMAIL_MAX_ATTEMPTS = 5;
const retryMinutes = [5, 30, 120, 360] as const;

export function userEmailFailureDecision(attempts: number, permanent: boolean, now = Date.now()) {
  if (permanent || attempts >= USER_EMAIL_MAX_ATTEMPTS) return { status: 'failed' as const, nextAttemptAt: null };
  const minutes = retryMinutes[Math.min(Math.max(attempts - 1, 0), retryMinutes.length - 1)];
  return { status: 'retry' as const, nextAttemptAt: new Date(now + minutes * 60_000).toISOString() };
}
