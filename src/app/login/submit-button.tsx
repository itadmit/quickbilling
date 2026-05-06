"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function LoginSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 text-white font-medium rounded-full px-6 py-3 text-[15px] hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-80 disabled:cursor-wait"
    >
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
          מתחבר...
        </>
      ) : (
        "כניסה"
      )}
    </button>
  );
}
