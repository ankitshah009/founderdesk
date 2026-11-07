import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security";

export const DESK_COOKIE = "fd_desk";

/**
 * The operator desk shows every order, so it is gated. With DESK_TOKEN set,
 * the cookie must match it. Without one, the desk is open in development only.
 */
export async function deskAccess(): Promise<"ok" | "login" | "unconfigured"> {
  const token = env().DESK_TOKEN;
  if (!token) return env().NODE_ENV === "production" ? "unconfigured" : "ok";
  const given = (await cookies()).get(DESK_COOKIE)?.value ?? "";
  return given && safeEqual(given, token) ? "ok" : "login";
}

export async function assertDesk() {
  if ((await deskAccess()) !== "ok") throw new Error("Not authorised");
}
