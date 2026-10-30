"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseForm } from "@/components/course-form";

export function NewCourse({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Nieuw vak
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" role="dialog" aria-modal aria-label="Nieuw vak">
          <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Nieuw vak</h2>
              <button aria-label="Sluiten" className="rounded-md p-1 hover:bg-muted" onClick={() => setOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <CourseForm onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
