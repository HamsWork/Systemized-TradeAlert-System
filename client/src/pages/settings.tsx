import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  TrendingUp,
  Cpu,
  Shield,
  Settings2,
} from "lucide-react";
import type { SystemSetting } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";

function SettingsToggle({ setting, onToggle, isPending }: {
  setting: SystemSetting;
  onToggle: (setting: SystemSetting, newValue: string) => void;
  isPending: boolean;
}) {
  const isBool = setting.type === "boolean";
  const isOn = setting.value === "true";
  const [localValue, setLocalValue] = useState(setting.value);

  return (
    <div className="flex items-center justify-between gap-3 py-3" data-testid={`setting-${setting.key}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{setting.label}</p>
        {setting.description && (
          <p className="text-xs text-muted-foreground">{setting.description}</p>
        )}
      </div>
      {isBool ? (
        <Switch
          checked={isOn}
          onCheckedChange={(checked) => onToggle(setting, String(checked))}
          disabled={isPending}
          data-testid={`switch-${setting.key}`}
        />
      ) : (
        <Input
          type="number"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => {
            if (localValue !== setting.value && localValue.trim() !== "") {
              onToggle(setting, localValue);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && localValue.trim() !== "") {
              onToggle(setting, localValue);
            }
          }}
          className="w-24 text-sm"
          data-testid={`input-${setting.key}`}
        />
      )}
    </div>
  );
}

function SettingsPanel({ settings, category, icon: Icon, title, description }: {
  settings: SystemSetting[];
  category: string;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  const { toast } = useToast();
  const categorySettings = settings.filter(s => s.category === category);

  const updateMutation = useMutation({
    mutationFn: async (data: { key: string; value: string; category: string; label: string; description: string | null; type: string }) => {
      const res = await apiRequest("PUT", "/api/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Setting updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleToggle = (setting: SystemSetting, newValue: string) => {
    updateMutation.mutate({
      key: setting.key,
      value: newValue,
      category: setting.category,
      label: setting.label,
      description: setting.description,
      type: setting.type,
    });
  };

  if (categorySettings.length === 0) return null;

  return (
    <Card data-testid={`card-settings-${category}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {categorySettings.map((setting) => (
            <SettingsToggle
              key={setting.key}
              setting={setting}
              onToggle={handleToggle}
              isPending={updateMutation.isPending}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const settingsQuery = useQuery<SystemSetting[]>({ queryKey: ["/api/settings"] });

  if (settingsQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="page-settings">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const settings = settingsQuery.data ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="page-settings">
      <PageHeader
        icon={Settings2}
        title="Settings"
        description="Configure system controls, trading parameters, and notification preferences"
        testId="heading-settings"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsPanel
          settings={settings}
          category="signals"
          icon={TrendingUp}
          title="Signal Engine"
          description="Configure signal analysis, filtering, and confidence thresholds"
        />
        <SettingsPanel
          settings={settings}
          category="trading"
          icon={Shield}
          title="Trading Controls"
          description="Set execution mode, risk limits, and position sizing rules"
        />
        <SettingsPanel
          settings={settings}
          category="system"
          icon={Cpu}
          title="System"
          description="General platform settings, logging, and API access controls"
        />
      </div>
    </div>
  );
}
