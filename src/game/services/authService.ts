export interface AuthUser {
  id: string;
  displayName: string;
  isGuest: boolean;
}

export interface AuthService {
  getCurrentUser(): Promise<AuthUser>;
}

export function createMockAuthService(): AuthService {
  return {
    async getCurrentUser() {
      return {
        id: "local-captain",
        displayName: "Captain Maybe",
        isGuest: true
      };
    }
  };
}
