import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Carregando({ texto, className }: { texto?: string; className?: string }) {
  return (
    <div className={cn("flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 text-muted-foreground", className)}>
      <Loader2 className="size-8 animate-spin text-primary" />
      {texto && <p className="text-sm">{texto}</p>}
    </div>
  );
}
