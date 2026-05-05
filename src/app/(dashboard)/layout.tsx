import { auth } from "@/lib/auth/nextauth";
import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { Sidebar } from "@/components/dashboard/sidebar";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { getSelectedProjectId } from "@/lib/selected-project";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [projectRows, selectedRaw] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, slug: products.slug })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.name)),
    getSelectedProjectId(),
  ]);

  // Sanitize: if cookie points to a deleted/inactive project, treat as "all".
  const selectedProjectId =
    selectedRaw && projectRows.some((p) => p.id === selectedRaw)
      ? selectedRaw
      : null;

  return (
    <div className="min-h-screen flex">
      <Sidebar
        user={session.user}
        projects={projectRows}
        selectedProjectId={selectedProjectId}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
