import { cn } from "@/lib/utils";
import Link from "next/link";
import { Badge } from "./badge";

interface AsciiCardProps {
  title: string;
  subtitle?: string;
  status?: "ACTIVE" | "SOON";
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function AsciiCard({
  title,
  subtitle,
  status,
  href,
  onClick,
  className,
}: AsciiCardProps) {
  const content = (
    <div
      className={cn(
        "bg-panel border border-dashed border-border rounded-lg px-4 py-3 font-mono relative",
        "transition-colors",
        href || onClick
          ? "cursor-pointer hover:border-solid hover:bg-panel/80 active:bg-panel/60"
          : "",
        className
      )}
      onClick={onClick}
    >
      {status && (
        <div className="absolute top-2 right-2">
          <Badge
            variant={status === "ACTIVE" ? "success" : "outline"}
            className="text-[10px]"
          >
            {status}
          </Badge>
        </div>
      )}
      <div className="text-sm font-semibold mb-1">{title}</div>
      {subtitle && (
        <div className="text-xs text-text/70 font-mono">{subtitle}</div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

