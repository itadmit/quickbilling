"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";
import { selectProject } from "./project-actions";

interface Project {
  id: string;
  name: string;
  slug: string;
}

export function ProjectSwitcher({
  projects,
  selectedId,
}: {
  projects: Project[];
  selectedId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selected = projects.find((p) => p.id === selectedId);

  const handleSelect = (id: string | null) => {
    setOpen(false);
    startTransition(async () => {
      await selectProject(id);
      router.refresh();
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-white transition ${pending ? "opacity-60" : ""}`}
      >
        <div className="text-right min-w-0 flex-1">
          <div className="text-[11px] text-white/50">פרוייקט</div>
          <div className="text-[14px] font-medium truncate">
            {selected ? selected.name : "כל הפרוייקטים"}
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-white/50 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <div className="absolute top-full inset-x-0 mt-2 bg-white rounded-lg shadow-2xl ring-1 ring-black/5 z-50 py-1 max-h-80 overflow-y-auto">
          <Item
            label="כל הפרוייקטים"
            selected={!selectedId}
            onClick={() => handleSelect(null)}
          />
          {projects.length > 0 && (
            <div className="my-1 border-t border-neutral-100" />
          )}
          {projects.map((p) => (
            <Item
              key={p.id}
              label={p.name}
              hint={`/${p.slug}`}
              selected={p.id === selectedId}
              onClick={() => handleSelect(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Item({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 transition"
    >
      <Check
        className={`w-3.5 h-3.5 shrink-0 ${selected ? "text-emerald-600" : "text-transparent"}`}
        strokeWidth={2.5}
      />
      <div className="flex-1 text-right">
        <div className="text-[14px] font-medium text-neutral-900">{label}</div>
        {hint && (
          <div className="text-[11px] text-neutral-500 ltr-num">{hint}</div>
        )}
      </div>
    </button>
  );
}
