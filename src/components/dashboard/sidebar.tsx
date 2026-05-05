"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  ClipboardList,
  FileText,
  PackageOpen,
  TrendingUp,
  Settings,
  LogOut,
  ChevronLeft,
} from "lucide-react";
import { ProjectSwitcher } from "./project-switcher";

const NAV = [
  { href: "/customers", label: "לקוחות", Icon: Users },
  { href: "/subscriptions", label: "מנויים", Icon: ClipboardList },
  { href: "/invoices", label: "חשבוניות", Icon: FileText },
  { href: "/products", label: "פרוייקטים", Icon: PackageOpen },
  { href: "/analytics", label: "אנליטיקה", Icon: TrendingUp },
  { href: "/settings", label: "הגדרות", Icon: Settings },
];

interface SidebarProps {
  user: {
    email: string;
    name?: string | null;
    image?: string | null;
    role: string;
  };
  projects: Array<{ id: string; name: string; slug: string }>;
  selectedProjectId: string | null;
}

export function Sidebar({ user, projects, selectedProjectId }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 bg-[#033841] text-white flex flex-col">
      <div className="px-3 pt-4 pb-2">
        <ProjectSwitcher
          projects={projects}
          selectedId={selectedProjectId}
        />
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {NAV.map(({ href, label, Icon }) => {
          const active =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[16px] font-medium transition ${
                active
                  ? "bg-white/10 text-white"
                  : "text-white hover:bg-white/6"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
              <span className="flex-1">{label}</span>
              <ChevronLeft
                className={`w-3.5 h-3.5 ${active ? "text-white/70" : "text-white/40"}`}
                strokeWidth={1.5}
              />
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 mb-3">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="w-9 h-9 rounded-full bg-white/10"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-emerald-600 grid place-items-center text-sm font-medium text-white">
              {user.email[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-normal text-white/95 truncate">
              {user.name ?? "אזור אישי"}
            </div>
            <div className="text-[11px] text-white/45 truncate ltr-num">
              {user.email}
            </div>
          </div>
        </div>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="w-full inline-flex items-center gap-2 text-[12px] text-white/50 hover:text-white/90 transition"
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
            התנתקות
          </button>
        </form>
      </div>
    </aside>
  );
}
