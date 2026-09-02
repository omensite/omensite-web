export function createAuthService() {
  return {
    async authenticate({ username = "", passkey = "" }) {
      const normalized = username.trim();
      if (!normalized || !passkey.trim()) {
        const error = new Error("Credentials required");
        error.code = "CREDENTIALS_REQUIRED";
        throw error;
      }
      return { id: normalized, username: normalized };
    },
  };
}
