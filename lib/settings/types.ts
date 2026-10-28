export type SettingsTab =
  | "profile"
  | "general"
  | "billing"
  | "sessions"
  | "team"
  | "permissions"
  | "autonomy"
  | "publishApprovals"
  | "managed-tasks"
  | "model-selection"
  | "mail"
  | "data-control"
  | "my-computer"
  | "local-folders"
  | "cloud-browse"
  | "skills"
  | "connectors"
  | "integrations";

export interface UserProfile {
  displayName: string;
  email: string;
  initials: string;
  bio: string;
  customInstructions: string;
  plan: "free" | "pro" | "team" | "enterprise";
  credits: number;
}

export type ThemeMode = "light" | "dark" | "system";

export interface GeneralSettings {
  theme: ThemeMode;
  notifications: {
    productUpdates: boolean;
    taskEmails: boolean;
    ads: boolean;
  };
}

export interface ManagedTask {
  id: string;
  title: string;
  description: string;
  icon: "calendar-clock" | "refresh" | "bot" | "file-text";
  status: "scheduled" | "running";
  enabled: boolean;
  schedule?: string;
  lastRunAgo?: string;
  connectorId?: string;
}

export interface MailSettings {
  forwardingAddress: string;
  replyTo: string;
  autoSummarize: boolean;
  forwardImportant: boolean;
  spamProtection: "strict" | "moderate" | "off";
}

export interface MailMessage {
  id: string;
  sender: string;
  subject: string;
  preview: string;
  timestamp: string;
  unread: boolean;
}

export interface Connector {
  id: string;
  name: string;
  description?: string;
  initials?: string;
  color?: string;
  connected: boolean;
  category: "marketing" | "collaboration" | "ecommerce" | "messaging";
}

export interface ApiKey {
  id: string;
  name: string;
  createdAt: string;
  maskedValue: string;
}

export type IntegrationCategory =
  | "crm"
  | "marketing"
  | "analytics"
  | "communication"
  | "productivity";

export interface Integration {
  id: string;
  name: string;
  description: string;
  initials?: string;
  color?: string;
  categories?: IntegrationCategory[];
  status: "active" | "available" | "coming-soon";
}

export interface BillingHistoryRow {
  id: string;
  date: string;
  action: string;
  credits: number;
  status: "success" | "failed" | "refunded";
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  connected: boolean;
}
