const DEFAULT_APP_ADMIN_EMAILS = ['kareem@family.local'];
const MOCK_USER_EMAIL = 'mock_user@demo.local';

/** Emails that can open the app-admin activity dashboard. */
export function appAdminEmails(): string[] {
  const raw = process.env.APP_ADMIN_EMAILS?.trim();
  if (!raw) return DEFAULT_APP_ADMIN_EMAILS;
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAppAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return appAdminEmails().includes(email.trim().toLowerCase());
}

export function isMockUserEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === MOCK_USER_EMAIL;
}

export { MOCK_USER_EMAIL };
