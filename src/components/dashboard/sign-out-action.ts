"use server";

import { signOut } from "@/lib/auth/nextauth";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
