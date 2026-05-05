import { cookies } from "next/headers";

const COOKIE = "selected_project";

export async function getSelectedProjectId(): Promise<string | null> {
  const c = await cookies();
  return c.get(COOKIE)?.value || null;
}

export async function setSelectedProjectIdCookie(id: string | null) {
  const c = await cookies();
  if (id) {
    c.set(COOKIE, id, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    c.delete(COOKIE);
  }
}
