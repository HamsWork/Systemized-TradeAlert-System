import type { Express } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../lib/async-handler";
import { sendDirectWebhook } from "../services/discord";

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
