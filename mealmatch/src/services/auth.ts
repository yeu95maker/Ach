/**
 * Authentication boundary. The MVP runs as a local guest; the rest of the app
 * only depends on `AuthService`, so adding real accounts (Supabase Auth,
 * Firebase Auth, Sign in with Apple/Google…) means implementing this interface
 * and swapping the export below.
 */
export interface AuthUser {
  id: string;
  isGuest: boolean;
  email?: string;
}

export interface AuthService {
  currentUser(): Promise<AuthUser>;
  /** Not available in the MVP – present so the UI can be wired up later. */
  signIn?(email: string): Promise<AuthUser>;
  signOut?(): Promise<void>;
}

export class GuestAuthService implements AuthService {
  async currentUser(): Promise<AuthUser> {
    return { id: 'guest', isGuest: true };
  }
}

export const authService: AuthService = new GuestAuthService();
