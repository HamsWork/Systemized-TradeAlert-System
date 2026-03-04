import type { Express } from "express";
import { storage } from "../storage";
import { asyncHandler } from "../lib/async-handler";
import { sendDirectWebhook } from "../services/discord";

export function registerDiscordRoutes(app: Express) {
  app.get(
    "/api/discord/channels",
    asyncHandler(async (_req, res) => {
      const apps = await storage.getConnectedApps();
      const channels: {
        id: string;
        appId: string;
        appName: string;
        channelType: string;
        webhookUrl: string;
      }[] = [];

      for (const a of apps) {
        if (!a.sendDiscordMessages) continue;
        if (a.discordWebhookOptions) {
          channels.push({
            id: `${a.id}_options`,
            appId: a.id,
            appName: a.name,
            channelType: "Options",
            webhookUrl: a.discordWebhookOptions,
          });
        }
        if (a.discordWebhookShares) {
          channels.push({
            id: `${a.id}_shares`,
            appId: a.id,
            appName: a.name,
            channelType: "Shares",
            webhookUrl: a.discordWebhookShares,
          });
        }
        if (a.discordWebhookLetf) {
          channels.push({
            id: `${a.id}_letf`,
            appId: a.id,
            appName: a.name,
            channelType: "LETF",
            webhookUrl: a.discordWebhookLetf,
          });
        }
      }

      const seen = new Set<string>();
      const unique = channels.filter((ch) => {
        if (seen.has(ch.webhookUrl)) return false;
        seen.add(ch.webhookUrl);
        return true;
      });

      res.json(unique);
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

      const apps = await storage.getConnectedApps();
      let webhookUrl: string | null = null;
      let appName: string = "Unknown";
      let appId: string = "";
      let channelType: string = "";

      for (const a of apps) {
        if (!a.sendDiscordMessages) continue;
        if (channelId === `${a.id}_options` && a.discordWebhookOptions) {
          webhookUrl = a.discordWebhookOptions;
          appName = a.name;
          appId = a.id;
          channelType = "Options";
          break;
        }
        if (channelId === `${a.id}_shares` && a.discordWebhookShares) {
          webhookUrl = a.discordWebhookShares;
          appName = a.name;
          appId = a.id;
          channelType = "Shares";
          break;
        }
        if (channelId === `${a.id}_letf` && a.discordWebhookLetf) {
          webhookUrl = a.discordWebhookLetf;
          appName = a.name;
          appId = a.id;
          channelType = "LETF";
          break;
        }
      }

      if (!webhookUrl)
        return res.status(400).json({ message: "Channel not found or Discord messages disabled for this app" });

      const result = await sendDirectWebhook(webhookUrl, payload);

      await storage.createDiscordMessage({
        signalId: null,
        webhookUrl,
        channelType: "signal",
        instrumentType: channelType,
        status: result.sent ? "sent" : "error",
        messageType: "manual_template",
        embedData: { manual: true, channelId },
        error: result.error,
        sourceAppId: appId,
        sourceAppName: appName,
      }).catch(() => {});

      await storage.createActivity({
        type: "discord_manual_send",
        title: `Manual Discord message sent via ${appName} (${channelType})`,
        description: result.sent ? "Message delivered successfully" : `Failed: ${result.error}`,
        symbol: null,
        signalId: null,
        metadata: { channelId, channelType, appName, sent: result.sent },
      }).catch(() => {});

      res.json(result);
    }),
  );
}
