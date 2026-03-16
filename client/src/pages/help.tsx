import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HelpCircle,
  LayoutDashboard,
  TrendingUp,
  Activity,
  Landmark,
  MessageSquare,
  Radio,
  Puzzle,
  BookOpen,
  ClipboardCheck,
  ChevronRight,
  ArrowUp,
  Maximize2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Link } from "wouter";

interface HelpSection {
  id: string;
  title: string;
  path: string;
  icon: React.ElementType;
  description: string;
  details: string[];
  screenshot: string;
  subsections?: {
    title: string;
    description: string;
    screenshot: string;
    details: string[];
  }[];
}

const sections: HelpSection[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
    description:
      "The main overview page showing active signals, connected apps, IBKR orders, and open positions at a glance.",
    details: [
      "Signal Pipeline — shows the 3-step flow: Ingest → Execute → Notify with counts at each stage.",
      "Stats Cards — active signals, connected apps, IBKR orders, and open positions at a glance.",
      "IBKR Account — live account summary with net liquidation value and available funds.",
      "Recent Signals — the latest signal cards with ticker, direction, instrument type, and status.",
      "Activity Feed — real-time feed of system events (signal ingested, Discord sent, target hit, etc.).",
    ],
    screenshot: "/help/01-dashboard.png",
  },
  {
    id: "signals",
    title: "Signals",
    path: "/signals",
    icon: TrendingUp,
    description:
      "View and manage all trading signals with status filters and detailed signal cards.",
    details: [
      "Status Filters — toggle between Active, All, Completed, Stopped Out, Closed, and Expired signals.",
      "Signal Cards — each card shows ticker, direction, instrument type, entry price, and target/stop-loss progress bars.",
      "Target Tracking — visual progress bars show which targets have been hit (green) and which are pending.",
      "New Signal — click '+ New Signal' to manually create a signal from the dashboard.",
      "Click any signal card to open the Signal Detail view.",
    ],
    screenshot: "/help/02-signals.png",
    subsections: [
      {
        title: "Signal Detail",
        description:
          "Click any signal card to open the detail view with a live chart and full trade information.",
        screenshot: "/help/10-signal-detail.png",
        details: [
          "Candlestick Chart — live chart (Polygon.io data with IBKR price updates) with entry, target, and stop-loss lines overlaid.",
          "Signal Info Panel — shows direction, instrument type, entry price, current price, and P&L.",
          "Target Status — tracks which targets have been hit, with timestamps and prices.",
          "Discord Messages — all Discord messages sent for this signal (entry, target hit, SL raised, etc.).",
          "IBKR Orders — order history for this signal (bracket orders, fills, cancellations).",
          "Activity Log — all system events related to this signal.",
        ],
      },
    ],
  },
  {
    id: "activity",
    title: "Activity",
    path: "/activity",
    icon: Activity,
    description:
      "A chronological feed of every system event with search and filter capabilities.",
    details: [
      "Search — search by ticker symbol, title, or keyword to find specific events.",
      "Type Filters — filter by event type: Signal Ingested, Discord Sent, Target Hit, Stop Loss Hit, SL Raised, Trade Error, etc.",
      "Event Cards — each entry shows the event type badge, description, source app, and timestamp.",
      "Click any event card to open the detail dialog with full metadata and raw payload.",
      "Combine search and filters — for example, search 'AAPL' + filter 'Target Hit' to see all AAPL target hits.",
    ],
    screenshot: "/help/03-activity.png",
  },
  {
    id: "ibkr",
    title: "IBKR",
    path: "/ibkr",
    icon: Landmark,
    description:
      "Dedicated Interactive Brokers page showing account, orders, and positions.",
    details: [
      "Account Card — shows connected IBKR account with connect/disconnect controls and status indicator.",
      "Summary Cards — open positions, stock positions, option positions, and pending orders at a glance.",
      "Orders Tab — all IBKR orders with symbol, app, side, type, quantity, fill status, and color-coded status badges.",
      "Positions Tab — current positions with symbol, quantity, avg cost, market price, P&L, and daily change.",
      "Orders are linked to their source signal — click the signal icon to jump to the signal detail.",
    ],
    screenshot: "/help/04-ibkr.png",
  },
  {
    id: "discord-templates",
    title: "Discord Templates",
    path: "/discord-templates",
    icon: MessageSquare,
    description:
      "Configure Discord webhook message templates per instrument type and per connected app.",
    details: [
      "App Selector — choose 'Default Templates' or a specific connected app to customize its templates.",
      "Instrument Types — 5 types: Options, Shares, LETF, LETF Option, Crypto — each with its own set of templates.",
      "Message Types — 4 templates per instrument: Entry Signal, Target Hit, SL Raised, and Stop Loss Hit.",
      "Template Variables — use {{variable}} placeholders (e.g. {{ticker}}, {{entry_price}}, {{direction}}) that get replaced with real signal data.",
      "Preview & Send — each template has a preview button to see the rendered embed and a send button for testing.",
      "Reset — reset any template back to the system default.",
    ],
    screenshot: "/help/05-discord-templates.png",
  },
  {
    id: "integrations",
    title: "Integrations",
    path: "/integrations",
    icon: Radio,
    description:
      "Manage Discord channels and IBKR trading accounts used by the system.",
    details: [
      "Discord Integrations — add Discord webhook URLs for each channel you want to send notifications to.",
      "IBKR Integrations — configure IBKR TWS/Gateway connections with host, port, and client ID.",
      "Status Indicators — each integration shows its connection status (connected, disconnected, error).",
      "Toggle Controls — enable or disable each integration without deleting it.",
      "Add Integration — click '+ Add Integration' to set up a new Discord or IBKR connection.",
    ],
    screenshot: "/help/06-integrations.png",
  },
  {
    id: "connected-apps",
    title: "Connected Apps",
    path: "/connected-apps",
    icon: Puzzle,
    description:
      "Register and manage external trading apps that send signals to TradeSync.",
    details: [
      "App Cards — each app shows its name, description, and toggle switches for Sync Signals, Discord, and IBKR.",
      "API Key — auto-generated Bearer token for authentication. Show/hide, copy, or regenerate.",
      "Settings Modal — click the gear icon to configure the app (General, Discord, IBKR settings).",
      "Add App — click '+ New App' to register a new external signal source.",
      "Built-in App — 'TradeSync API' is the built-in app for testing and manual signal ingestion.",
    ],
    screenshot: "/help/07-connected-apps.png",
    subsections: [
      {
        title: "App Settings — General",
        description:
          "The General tab lets you edit the app's name, slug (URL identifier), and description.",
        screenshot: "/help/11-connected-app-edit.png",
        details: [
          "App Name — the display name shown on cards and in activity logs.",
          "Slug — a URL-friendly identifier used internally.",
          "Description — a brief description of what the app does.",
        ],
      },
      {
        title: "App Settings — Discord",
        description:
          "Configure per-instrument Discord webhook URLs and message content for this app.",
        screenshot: "/help/12-connected-app-edit-discord.png",
        details: [
          "Discord Toggle — enable or disable Discord notifications for this app.",
          "Per-Instrument Webhooks — set a separate webhook URL for each instrument type (Shares, Options, LETF, LETF Option, Crypto).",
          "Message Content — text sent alongside the rich embed (e.g. @everyone for mentions).",
          "Each instrument type routes to its own Discord channel via its webhook URL.",
        ],
      },
      {
        title: "App Settings — IBKR",
        description:
          "Configure which IBKR account to route trade orders through for this app.",
        screenshot: "/help/13-connected-app-edit-ibkr.png",
        details: [
          "IBKR Toggle — enable or disable trade execution for this app.",
          "Account Selector — choose which IBKR account to route orders through from configured integrations.",
          "Orders placed by this app will use the selected account's connection settings.",
        ],
      },
    ],
  },
  {
    id: "api-guide",
    title: "API Guide",
    path: "/api-guide",
    icon: BookOpen,
    description:
      "Interactive REST API documentation with a Quick Start guide, live cURL examples, and endpoint reference.",
    details: [
      "Quick Start — 3-step onboarding: create an app, get your API key, send your first signal.",
      "Endpoint Reference — full docs for Signals API (ingest, list, update, delete, target-hit, stop-loss-hit).",
      "Discord Templates API — get, update, and reset templates programmatically.",
      "Authentication — all ingest endpoints require a Bearer token (the connected app's API key).",
      "Live Examples — copy-paste cURL commands with your actual API key pre-filled.",
      "Instrument Types — detailed specs for Options, Shares, LETF, LETF Option, and Crypto.",
    ],
    screenshot: "/help/08-api-guide.png",
  },
  {
    id: "system-audit",
    title: "System Audit",
    path: "/audit",
    icon: ClipboardCheck,
    description:
      "A live self-documenting system overview that scans the actual codebase in real time.",
    details: [
      "Scan Info — shows last scanned timestamp, file count, and line count.",
      "Tech Stack — lists all frameworks, libraries, and services used.",
      "Statistics — source files, lines of code, API endpoints, DB tables, services, and features.",
      "Backend Services — each service with a description of what it does.",
      "Feature File Map — every feature with its file locations and line numbers.",
      "Three Views — System Architecture, Feature File Map, and JSON Export.",
      "Refresh — hit 'Refresh' to rescan the codebase on demand.",
    ],
    screenshot: "/help/09-system-audit.png",
  },
];

function SectionCard({
  section,
  onImageClick,
}: {
  section: HelpSection;
  onImageClick: (src: string, title: string) => void;
}) {
  const Icon = section.icon;
  return (
    <div id={section.id} className="scroll-mt-20">
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col lg:flex-row gap-6 p-6">
            <div className="flex-1 min-w-0 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-lg font-semibold" data-testid={`heading-help-${section.id}`}>{section.title}</h2>
                  <Link href={section.path}>
                    <Badge variant="outline" className="cursor-pointer hover:bg-accent text-xs gap-1" data-testid={`link-goto-${section.id}`}>
                      Go to page <ChevronRight className="h-3 w-3" />
                    </Badge>
                  </Link>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{section.description}</p>
              <ul className="space-y-2">
                {section.details.map((detail, i) => {
                  const [label, ...rest] = detail.split(" — ");
                  const desc = rest.join(" — ");
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                      <span>
                        {desc ? (
                          <>
                            <span className="font-medium">{label}</span>
                            <span className="text-muted-foreground"> — {desc}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">{label}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div
              className="lg:w-[420px] shrink-0 cursor-pointer group relative rounded-lg overflow-hidden border"
              onClick={() => onImageClick(section.screenshot, section.title)}
              data-testid={`img-help-${section.id}`}
            >
              <img
                src={section.screenshot}
                alt={`${section.title} page screenshot`}
                className="w-full h-auto rounded-lg transition-transform group-hover:scale-[1.02]"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
              </div>
            </div>
          </div>

          {section.subsections && section.subsections.length > 0 && (
            <>
              <Separator />
              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                {section.subsections.map((sub, idx) => (
                  <div key={idx} className="flex flex-col lg:flex-row gap-4 sm:gap-6">
                    <div className="flex-1 min-w-0 space-y-3">
                      <h3 className="text-sm font-semibold">{sub.title}</h3>
                      <p className="text-sm text-muted-foreground">{sub.description}</p>
                      <ul className="space-y-1.5">
                        {sub.details.map((detail, i) => {
                          const [label, ...rest] = detail.split(" — ");
                          const desc = rest.join(" — ");
                          return (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                              <span>
                                {desc ? (
                                  <>
                                    <span className="font-medium">{label}</span>
                                    <span className="text-muted-foreground"> — {desc}</span>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">{label}</span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <div
                      className="lg:w-[360px] shrink-0 cursor-pointer group relative rounded-lg overflow-hidden border"
                      onClick={() => onImageClick(sub.screenshot, sub.title)}
                    >
                      <img
                        src={sub.screenshot}
                        alt={`${sub.title} screenshot`}
                        className="w-full h-auto rounded-lg transition-transform group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function HelpPage() {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState("");

  const openLightbox = (src: string, title: string) => {
    setLightboxSrc(src);
    setLightboxTitle(title);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6" data-testid="page-help">
      <PageHeader
        icon={HelpCircle}
        title="Help & Walkthrough"
        description="A visual guide to every page and feature in TradeSync"
        testId="heading-help"
      />

      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground mb-3">Jump to a section:</p>
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border hover:bg-accent transition-colors"
                data-testid={`link-jump-${s.id}`}
              >
                <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                {s.title}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {sections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            onImageClick={openLightbox}
          />
        ))}
      </div>

      <div className="flex justify-center pb-4">
        <Button variant="outline" size="sm" onClick={scrollToTop} className="gap-1.5" data-testid="button-back-to-top">
          <ArrowUp className="h-3.5 w-3.5" />
          Back to top
        </Button>
      </div>

      <Dialog open={!!lightboxSrc} onOpenChange={(open) => !open && setLightboxSrc(null)}>
        <DialogContent className="max-w-5xl p-2" data-testid="dialog-lightbox">
          <DialogHeader className="px-4 pt-2">
            <DialogTitle className="text-sm">{lightboxTitle}</DialogTitle>
          </DialogHeader>
          {lightboxSrc && (
            <img
              src={lightboxSrc}
              alt={lightboxTitle}
              className="w-full h-auto rounded-md"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
