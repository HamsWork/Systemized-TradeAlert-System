import type { ElementType } from "react";

export function EmptyState({ icon: Icon, title, description, testId }: {
  icon: ElementType;
  title: string;
  description?: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" data-testid={testId}>
      <Icon className="h-10 w-10 mb-3 opacity-50" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-xs mt-1">{description}</p>}
    </div>
  );
}
