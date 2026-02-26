import type { ElementType, ReactNode } from "react";

export function PageHeader({ icon: Icon, title, description, accent = "text-primary", actions, testId }: {
  icon: ElementType;
  title: string;
  description?: string;
  accent?: string;
  actions?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Icon className={`h-5 w-5 ${accent}`} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid={testId}>{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
