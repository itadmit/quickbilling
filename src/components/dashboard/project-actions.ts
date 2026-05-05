"use server";

import { revalidatePath } from "next/cache";
import { setSelectedProjectIdCookie } from "@/lib/selected-project";

export async function selectProject(id: string | null) {
  await setSelectedProjectIdCookie(id);
  revalidatePath("/", "layout");
}
