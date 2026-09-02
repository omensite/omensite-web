export const ROLES = Object.freeze({
  DEVELOPER: "Developer",
  ADMIN: "Admin",
  OS: "OS",
  INDICATORS: "Indicators",
  JOURNAL: "Journal",
});

export const CAPABILITIES = Object.freeze({
  BASE: "base",
  INDICATORS: "indicators",
  JOURNAL: "journal",
  ADMIN: "admin",
});

export const ACCESS_ERRORS = Object.freeze({
  AUTH_REQUIRED: "AUTH_REQUIRED",
  INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",
  ACCOUNT_BANNED: "ACCOUNT_BANNED",
  ROLE_SYNC_FAILED: "ROLE_SYNC_FAILED",
});
