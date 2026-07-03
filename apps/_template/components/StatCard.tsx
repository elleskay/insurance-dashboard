import { type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "default" | "alert" | "success" | "info";
  hint?: string;
  delta?: { value: string; positive?: boolean };
}

const toneStyles: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-foreground",
  alert: "text-destructive",
  success: "text-emerald-600 dark:text-emerald-400",
  info: "text-primary",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
  delta,
}: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={cn("h-4 w-4", toneStyles[tone])} />
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-semibold", toneStyles[tone])}>{value}</div>
        {(hint || delta) && (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            {delta && (
              <span
                className={cn(
                  delta.positive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
                )}
              >
                {delta.positive ? "+" : ""}
                {delta.value}
              </span>
            )}
            {hint && <span>{hint}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
