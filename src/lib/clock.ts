import "server-only";

/** Request-time clock for server components (keeps render functions pure for the linter). */
export const nowMs = () => Date.now();
