import type { Express } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../lib/async-handler";
import { sendDirectWebhook } from "../services/discord";
import { generateAllTemplates } from "../services/discord-preview";

function getParam(req: any, name: string): string {
  return req.params[name] as string;
}

export function registerDiscordRoutes(app: Express) {
  app.get(
    "/api/discord/channels",
    asyncHandler(async (_req, res) => {
      const integrations = await storage.getIntegrations();
      const channels: {
        id: string;
        integrationId: string;
        name: string;
        channelName: string;
        webhookUrl: string;
      }[] = [];

      for (const integ of integrations) {
        if (integ.type !== "discord" || !integ.enabled) continue;
        const config = (integ.config || {}) as Record<string, any>;
        if (!config.webhookUrl) continue;

        channels.push({
          id: integ.id,
          integrationId: integ.id,
          name: integ.name,
          channelName: config.channelName || integ.name,
          webhookUrl: config.webhookUrl,
        });
      }

      res.json(channels);
    }),
  );

  app.get(
    "/api/discord-templates/app/:appId",
    asyncHandler(async (req, res) => {
      const appId = getParam(req, "appId");

      const app = await storage.getConnectedApp(appId);
      if (!app) return res.status(404).json({ message: "App not found" });

      const defaults = generateAllTemplates();
      const overrides = await storage.getDiscordTemplatesByApp(appId);

      const overrideMap = new Map<string, typeof overrides[0]>();
      for (const o of overrides) {
        overrideMap.set(`${o.instrumentType}::${o.messageType}`, o);
      }

      const result = defaults.map(group => ({
        instrumentType: group.instrumentType,
        ticker: group.ticker,
        templates: group.templates.map(t => {
          const key = `${group.instrumentType}::${t.type}`;
          const override = overrideMap.get(key);
          if (override) {
            return {
              type: t.type,
              label: override.label || t.label,
              content: override.content ?? t.content,
              embed: override.embedJson as any || t.embed,
              isCustom: true,
            };
          }
          return { ...t, isCustom: false };
        }),
      }));

      res.json(result);
    }),
  );

  app.put(
    "/api/discord-templates/app/:appId",
    asyncHandler(async (req, res) => {
      const appId = getParam(req, "appId");

      const connectedApp = await storage.getConnectedApp(appId);
      if (!connectedApp) return res.status(404).json({ message: "App not found" });

      const { instrumentType, messageType, label, content, embedJson } = req.body;
      if (!instrumentType || !messageType) {
        return res.status(400).json({ message: "instrumentType and messageType are required" });
      }

      const result = await storage.upsertDiscordTemplate({
        appId,
        instrumentType,
        messageType,
        label: label || "",
        content: content ?? "",
        embedJson: embedJson || {},
      });

      res.json(result);
    }),
  );

  app.delete(
    "/api/discord-templates/app/:appId",
    asyncHandler(async (req, res) => {
      const appId = getParam(req, "appId");
      const instrumentType = req.query.instrumentType as string | undefined;

      await storage.deleteDiscordTemplatesByApp(appId, instrumentType);
      res.json({ success: true });
    }),
  );

  app.post(
    "/api/discord/send-manual",
    asyncHandler(async (req, res) => {
      const { channelId, payload } = req.body;

      if (!channelId || typeof channelId !== "string")
        return res.status(400).json({ message: "channelId is required" });
      if (!payload || !Array.isArray(payload.embeds) || payload.embeds.length === 0)
        return res.status(400).json({ message: "payload with embeds array is required" });
      if (payload.embeds.length > 10)
        return res.status(400).json({ message: "Maximum 10 embeds allowed" });
      if (payload.content && typeof payload.content === "string" && payload.content.length > 2000)
        return res.status(400).json({ message: "Content must be 2000 characters or less" });

      const integration = await storage.getIntegration(channelId);
      if (!integration || integration.type !== "discord" || !integration.enabled)
        return res.status(400).json({ message: "Discord channel not found or disabled" });

      const config = (integration.config || {}) as Record<string, any>;
      const webhookUrl = config.webhookUrl;
      if (!webhookUrl)
        return res.status(400).json({ message: "No webhook URL configured for this channel" });

      const channelName = config.channelName || integration.name;
      const result = await sendDirectWebhook(webhookUrl, payload);

      await storage.createDiscordMessage({
        signalId: null,
        webhookUrl,
        channelType: "signal",
        instrumentType: channelName,
        status: result.sent ? "sent" : "error",
        messageType: "manual_template",
        embedData: { manual: true, channelId, integrationName: integration.name },
        error: result.error,
        sourceAppId: null,
        sourceAppName: integration.name,
      }).catch(() => {});

      await storage.createActivity({
        type: "discord_manual_send",
        title: `Manual Discord message sent to ${channelName}`,
        description: result.sent ? "Message delivered successfully" : `Failed: ${result.error}`,
        symbol: null,
        signalId: null,
        metadata: { channelId, channelName, integrationName: integration.name, sent: result.sent },
      }).catch(() => {});

      res.json(result);
    }),
  );
}
