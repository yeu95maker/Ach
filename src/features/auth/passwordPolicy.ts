/** Client-side password policy (mirrors Supabase Auth settings in supabase/config.toml). */
export const PASSWORD_MIN_LENGTH = 10

export function passwordIssues(password: string): string[] {
  const issues: string[] = []
  if (password.length < PASSWORD_MIN_LENGTH) issues.push('length')
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) issues.push('case')
  if (!/\d/.test(password)) issues.push('digit')
  return issues
}
