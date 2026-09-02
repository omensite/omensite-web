export const AUTH_LINES = [
  "HANDSHAKE........OK",
  "TOKEN_CHECK......OK",
  "ROUTE_MAP........OK",
  "UI_KERNEL........OK",
  "MOTION_SYSTEM....OK",
  "ACCESS_GRANT.....OK",
];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function runLoginSequence({
  reducedMotion = false,
  delay = wait,
  onLine = () => {},
  onGrant = () => {},
  onComplete = () => {},
} = {}) {
  const lineDelay = reducedMotion ? 80 : 230;
  const grantDelay = reducedMotion ? 140 : 360;
  const completionDelay = reducedMotion ? 650 : 1700;

  for (const line of AUTH_LINES) {
    await delay(lineDelay);
    onLine(line);
  }
  await delay(grantDelay);
  onGrant();
  await delay(completionDelay);
  onComplete();
}
