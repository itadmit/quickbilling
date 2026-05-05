import { Search, ChevronDown } from "lucide-react";

export function SearchInput({
  defaultValue,
  placeholder,
  name = "q",
}: {
  defaultValue?: string;
  placeholder: string;
  name?: string;
}) {
  return (
    <div className="relative flex-1 max-w-xl">
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
      <input
        type="search"
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="w-full bg-white border border-neutral-200 rounded-full px-10 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
      />
    </div>
  );
}

export function FilterSelect({
  name,
  defaultValue,
  options,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div className="relative">
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="appearance-none bg-white border border-neutral-200 rounded-full px-4 py-2.5 pl-9 text-sm focus:outline-none focus:border-emerald-500 hover:border-neutral-300 transition cursor-pointer"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
    </div>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <form className="bg-white border border-neutral-200 rounded-2xl p-3 mb-6 flex items-center gap-3 flex-wrap">
      {children}
    </form>
  );
}
