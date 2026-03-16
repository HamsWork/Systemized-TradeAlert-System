import type { Express } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../lib/async-handler";
import { sendDirectWebhook } from "../services/discord";
import { generateAllTemplates } from "../services/discord-preview";
import {
  generateAllTemplateGroups,
  getDefaultTemplates,
  buildSampleVariables,
  renderTemplate,
  type TemplateEmbed,
} from "../services/discord-templates";

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
    "/api/discord-templates/var-templates",
    asyncHandler(async (_req, res) => {
      const overrides = await storage.getDiscordTemplatesByApp("__default__");
      const overrideMap = new Map<string, typeof overrides[0]>();
      for (const o of overrides) {
        overrideMap.set(`${o.instrumentType}::${o.messageType}`, o);
      }

      const groups = generateAllTemplateGroups();
      const result = groups.map(g => ({
        instrumentType: g.instrumentType,
        ticker: g.ticker,
        templates: g.templates.map(t => {
          const key = `${g.instrumentType}::${t.type}`;
          const override = overrideMap.get(key);
          const templateEmbed = override
            ? (override.embedJson as TemplateEmbed)
            : t.embed;
          const content = override ? (override.content ?? t.content) : t.content;
          const label = override ? (override.label || t.label) : t.label;

          const sampleVars = buildSampleVariables(g.instrumentType, t.type);
          const rendered = renderTemplate(templateEmbed, sampleVars);
          return {
            type: t.type,
            label,
            content,
            template: templateEmbed,
            sampleVars,
            preview: {
              content,
              embed: rendered,
            },
            isCustom: !!override,
          };
        }),
      }));
      res.json(result);
    }),
  );

  app.get(
    "/api/discord-templates/app/:appId",
    asyncHandler(async (req, res) => {
      const appId = getParam(req, "appId");

      const isDefaultApp = appId === "__default__";
      const connectedApp = isDefaultApp
        ? null
        : await storage.getConnectedApp(appId);
      if (!isDefaultApp && !connectedApp) {
        return res.status(404).json({ message: "App not found" });
      }

      const overrides = await storage.getDiscordTemplatesByApp(appId);
      const overrideMap = new Map<string, typeof overrides[0]>();
      for (const o of overrides) {
        overrideMap.set(`${o.instrumentType}::${o.messageType}`, o);
      }

      const groups = generateAllTemplateGroups();
      const result = groups.map(g => ({
        instrumentType: g.instrumentType,
        ticker: g.ticker,
        templates: g.templates.map(t => {
          const key = `${g.instrumentType}::${t.type}`;
          const override = overrideMap.get(key);
          const templateEmbed = override
            ? (override.embedJson as TemplateEmbed)
            : t.embed;
          const content = override ? (override.content ?? t.content) : t.content;
          const label = override ? (override.label || t.label) : t.label;

          const sampleVars = buildSampleVariables(g.instrumentType, t.type);
          const rendered = renderTemplate(templateEmbed, sampleVars);

          return {
            type: t.type,
            label,
            content,
            template: templateEmbed,
            sampleVars,
            preview: {
              content,
              embed: rendered,
            },
            isCustom: !!override,
          };
        }),
      }));

      res.json(result);
    }),
  );

  // Raw templates saved for an app (custom overrides only).
  // Optional query params:
  // - instrumentType: filter by instrument type
  // - messageType: filter by message type (signal_alert, target_hit, stop_loss_raised, stop_loss_hit)
  app.get(
    "/api/discord-templates/app/:appId/raw",
    asyncHandler(async (req, res) => {
      const appId = getParam(req, "appId");
      const isDefaultApp = appId === "__default__";
      const connectedApp = isDefaultApp
        ? null
        : await storage.getConnectedApp(appId);
      if (!isDefaultApp && !connectedApp) {
        return res.status(404).json({ message: "App not found" });
      }

      const instrumentType =
        typeof req.query.instrumentType === "string"
          ? (req.query.instrumentType as string)
          : undefined;
      const messageType =
        typeof req.query.messageType === "string"
          ? (req.query.messageType as string)
          : undefined;

      const templates = await storage.getDiscordTemplatesByApp(appId);
      const filtered = templates.filter((t) => {
        if (instrumentType && t.instrumentType !== instrumentType) return false;
        if (messageType && t.messageType !== messageType) return false;
        return true;
      });

      res.json({
        appId,
        appName: connectedApp?.name ?? "__default__",
        count: filtered.length,
        templates: filtered,
      });
    }),
  );

  app.put(
    "/api/discord-templates/app/:appId",
    asyncHandler(async (req, res) => {
      const appId = getParam(req, "appId");

      const isDefaultApp = appId === "__default__";
      const connectedApp = isDefaultApp
        ? null
        : await storage.getConnectedApp(appId);
      if (!isDefaultApp && !connectedApp) {
        return res.status(404).json({ message: "App not found" });
      }

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
