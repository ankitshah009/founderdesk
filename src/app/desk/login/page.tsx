import type { Metadata } from "next";
import { MonoLabel } from "@/components/ui";
import { LoginForm } from "../desk-forms";

export const metadata: Metadata = { title: "Desk sign-in", robots: { index: false } };

export default function DeskLogin() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4">
      <div className="panel w-full max-w-sm p-6">
        <MonoLabel>Operator desk</MonoLabel>
        <h1 className="mt-3 mb-6 text-xl font-medium text-fg">Sign in with your desk token</h1>
        <LoginForm />
      </div>
    </div>
  );
}
