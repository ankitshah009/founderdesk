import { env } from "@/lib/env";
import { signLink } from "@/lib/security";

const base = () => env().APP_URL.replace(/\/$/, "");

export const links = {
  order: (jobId: string) => `${base()}/orders/${jobId}?t=${signLink(jobId, "order")}`,
  orderPath: (jobId: string) => `/orders/${jobId}?t=${signLink(jobId, "order")}`,
  checkout: (jobId: string) => `${base()}/api/checkout/${jobId}?t=${signLink(jobId, "order")}`,
  checkoutPath: (jobId: string) => `/api/checkout/${jobId}?t=${signLink(jobId, "order")}`,
  review: (jobId: string) => `${base()}/review/${signLink(jobId, "review")}`,
  reviewPath: (jobId: string) => `/review/${signLink(jobId, "review")}`,
  article: (slug: string) => `${base()}/a/${slug}`,
  account: (email: string) => `${base()}/account?t=${signLink(email.toLowerCase(), "account", 7)}`,
};
