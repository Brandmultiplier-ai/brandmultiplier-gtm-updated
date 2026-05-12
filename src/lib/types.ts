// ── BrandMultiplier GTM — Unified Data Model ──────────────────────────────────────

// ── Workspace (multi-tenant) ────────────────────────────────────────────

export type ChannelType = "linkedin" | "email" | "ads";

export interface Workspace {
  id: string;              // ws_xxxxxxxx
  name: string;            // "Claw4Growth"
  slug: string;            // "c4g"
  status: "active" | "paused" | "archived";
  niche: string;           // usato dal Global Brain
  defaultLanguage: "it" | "en";
  profileSettings?: {
    companyName?: string;
    website?: string;
    industry?: string;
    size?: string;
    description?: string;
    brandVoice?: string;
  };
  channels: {
    linkedin?: { unipileAccountId: string; unipileApiKey: string; unipileBaseUrl: string };
    email?: { provider: "instantly"; apiKey: string };
  };
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceTemplate {
  id: string;
  workspaceId: string;
  name: string;
  content: string;
  language: "it" | "en";
  type: "connection_request" | "message";
  step: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContactList {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  leadIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LinkedInSeatActiveDays {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

export interface LinkedInSeatWarmup {
  enabled: boolean;
  rampEveryDays: number;
  startedAt?: string;
  lastRateLimitedAt?: string;
}

export interface LinkedInSeat {
  id: string;
  workspaceId: string;
  name: string;
  status: "active" | "paused";
  country: string;
  unipileAccountId: string;
  profileName?: string;
  profilePictureUrl?: string;
  profileHeadline?: string;
  profilePublicIdentifier?: string;
  profileUrl?: string;
  profileSyncedAt?: string;
  isDefault?: boolean;
  quotas: {
    profileLookupsPerWeek: number;
    invitationsPerWeek: number;
    messagesPerWeek: number;
  };
  schedule: {
    timezone: string;
    launchHour: number;
    randomizedLaunchWindowHours: number;
    activeDays: LinkedInSeatActiveDays;
    warmup?: LinkedInSeatWarmup;
  };
  usage: {
    weekKey: string;
    dayKey: string;
    invitationsUsed: number;
    messagesUsed: number;
    profileLookupsUsed: number;
    prospectingRunsToday: number;
    lastInviteAt?: string;
    lastMessageAt?: string;
    lastProfileLookupAt?: string;
    lastProspectingAt?: string;
  };
  createdAt: string;
  updatedAt: string;
  /** When set, Unipile API key and base URL come from this connection row */
  providerConnectionId?: string;
}

/** Stored on `workspace_memberships.role` and `workspace_invites.role` (same strings in UI). */
export type WorkspaceRole = "workspace admin" | "user";

/**
 * Stored on `app_users.global_role` (same strings in UI).
 * `member` = normal account; workspace access comes from `workspace_memberships`.
 */
export type AppGlobalRole = "super admin" | "member";

export interface AppUser {
  id: string;
  email: string;
  /** super admin: all workspaces; member: invite-only / normal accounts */
  globalRole?: AppGlobalRole;
  displayName?: string;
  profileSettings?: {
    title?: string;
    phone?: string;
    timezone?: string;
    /** Normalized profile URL, e.g. https://www.linkedin.com/in/handle */
    linkedinProfileUrl?: string;
    linkedinPublicIdentifier?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMembership {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  createdAt: string;
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  tokenHash: string;
  role: WorkspaceRole;
  createdByUserId?: string;
  acceptedByUserId?: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
}

export type DashboardPeriod = "7d" | "30d" | "3m" | "current";

export interface DashboardSnapshot {
  workspaceId: string;
  period: DashboardPeriod;
  payload: Record<string, unknown>;
  computedAt: string;
}

export interface ProviderConnection {
  id: string;
  workspaceId: string;
  /** Provider type; V1 uses "unipile" for LinkedIn */
  provider: string;
  unipileAccountId: string;
  unipileApiKey: string;
  unipileBaseUrl: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Agent: top-level entity configured via UI wizard */
export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  status: "active" | "paused" | "draft";
  createdAt: string;
  updatedAt: string;

  icp: {
    jobTitles: string[];
    locations: string[];
    industries: string[];
    companySizes: string[];
    excludeKeywords: string[];
    matchingMode: "discovery" | "precision";
  };

  signals: {
    personalProfile: string;
    companyPage: string;
    trackProfileVisitors: boolean;
    trackCompanyFollowers: boolean;
    selectedTopics?: string[];
    engagementKeywords: string[];
    watchProfiles: string[];
    neverTargetProfiles: string[];
    triggerEvents: {
      topActiveProfiles: boolean;
      recentFunding: boolean;
      jobChanges: boolean;
    };
    competitorPages: string[];
  };

  voice: {
    it: { tone: string; constraints: string[] };
    en: { tone: string; constraints: string[] };
  };

  limits: {
    invitesPerDay: number;
    invitesPerWeek: number;
    delayBetweenInvitesMs: number;
    maxMessageLength: number;
    /** Operating window: earliest hour (0-23) to send invites. Default 9. */
    activeHoursStart?: number;
    /** Operating window: latest hour (0-23) to send invites. Default 17. */
    activeHoursEnd?: number;
    /** Min delay between invites in ms when spreading across the day. Default: 600000 (10min). */
    minDelayMs?: number;
    /** Max delay between invites in ms when spreading across the day. Default: 1800000 (30min). */
    maxDelayMs?: number;
  };

  messageTemplates: Record<string, string[]>;
  templateWeights?: Record<string, TemplateWeights>;  // per-language weights (Brain v1)

  linkedinAccountId?: string;
}

/** Campaign: owns a sequence and a set of leads */
export interface CampaignQueryVariation {
  keywords?: string;
  titleFilter?: string;
}

export interface CampaignExecutionState {
  nextInviteAt?: string;
  lastInviteAt?: string;
  lastRunAt?: string;
  lastRunStatus?: "idle" | "sent" | "waiting" | "rate_limited" | "error";
  invitesSentToday?: number;
  inviteDay?: string;
}

export interface Campaign {
  id: string;
  workspaceId: string;
  agentId: string;
  linkedinSeatId?: string;
  name: string;
  status: "active" | "paused" | "draft" | "completed";
  segment: string;
  createdAt: string;
  updatedAt: string;

  search: {
    keywords: string;
    titleFilter: string;
    language: string;
    locations: string[];
    queryVariations?: CampaignQueryVariation[];
  };

  sequence: SequenceStep[];
  execution?: CampaignExecutionState;
  settings?: {
    goal?: "conversations" | "demos";
    tone?: "professional" | "conversational" | "direct";
    excludeFirstDegree?: boolean;
    reviewMode?: boolean;
    inviteSource?: "campaign_step" | "template_library";
    autopilotDraftMode?: "ignore_saved_drafts" | "use_saved_drafts";
  };
}

export interface SequenceStep {
  step: number;
  type: "connection_request" | "message" | "profile_visit";
  delayDays: number;
  trigger: "immediate" | "accepted" | "no_reply";
  content: string;
}

export interface CampaignStats {
  totalLeads: number;
  sent: number;
  accepted: number;
  replied: number;
  errored: number;
  connectRate: number;
  replyRate: number;
}

/** Lead: a person tracked within a campaign */
export interface Lead {
  id: string;
  workspaceId: string;
  campaignId: string;
  providerId: string;

  name: string;
  headline: string;
  company: string;
  location: string;
  publicIdentifier: string;
  networkDistance: string;
  profilePictureUrl?: string;

  segment: string;
  language: "it" | "en";
  aiScore: number;
  signal: string;

  status: LeadStatus;
  currentStep: number;

  events: LeadEvent[];

  templateIndex?: number;
  templateHash?: string;           // first 8 chars of template text hash, for version tracking
  experimentId?: string;
  experimentArm?: "control" | "challenger";
  approved?: boolean;
  copilotEdits?: Record<string, string>;
  unipileChatId?: string;
  companySize?: string;
  industry?: string;
  companyDescription?: string;
  companyLinkedInUrl?: string;

  createdAt: string;
  updatedAt: string;
}

export type LeadStatus =
  | "discovered"
  | "new"
  | "invite_sent"
  | "already_invited"
  | "invite_failed"
  | "accepted"
  | "message_sent"
  | "manual_override"
  | "replied"
  | "interested"
  | "not_interested"
  | "rate_limited"
  | "skipped";

export interface LeadEvent {
  ts: string;
  type:
    | "discovered"
    | "invite_sent"
    | "invite_failed"
    | "accepted"
    | "message_sent"
    | "replied"
    | "skipped"
    | "rate_limited";
  step?: number;
  message?: string;
}

// ── Discovery Engine types ──────────────────────────────────────────────

export type SignalSource =
  | "keyword_search"
  | "post_engagement"
  | "recent_activity"
  | "profile_visitors"
  | "company_page"
  | "company_followers"
  | "job_changes"
  | "recent_funding"
  | "top_active";

export type SignalKind =
  | "matched_topic_query"
  | "commented_topic_post"
  | "reacted_topic_post"
  | "posted_about_topic"
  | "visited_profile"
  | "follows_topic"
  | "job_change"
  | "recent_funding"
  | "top_active_topic_profile"
  | "generic_topic_signal";

export type SignalFamily =
  | "topic_query_match"
  | "engaged_with_profile"
  | "engaged_with_company"
  | "engaged_with_post"
  | "posted_about_topic"
  | "visited_profile"
  | "follows_entity"
  | "job_change"
  | "recent_funding"
  | "high_activity_icp"
  | "generic_signal";

export type SignalSourceType =
  | "search_query"
  | "personal_profile"
  | "watch_profile"
  | "author_profile"
  | "company_page"
  | "competitor_page"
  | "linkedin_post"
  | "profile"
  | "event"
  | "activity_score"
  | "generic";

export type SignalEngagementType =
  | "comment"
  | "reaction"
  | "post"
  | "visit"
  | "follow"
  | "event"
  | "search"
  | "activity";

export interface NormalizedSignal {
  title: string;
  source: SignalSource | string;
  sourceLabel: string;
  kind: SignalKind | string;
  kindLabel: string;
  family: SignalFamily;
  familyLabel: string;
  sourceType: SignalSourceType;
  sourceTypeLabel: string;
  sourceName: string | null;
  reason: string;
  engagementType: SignalEngagementType | null;
  topicKey: string | null;
  topicLabel: string | null;
  context: string;
  quality: "high" | "medium" | "low";
  sourceUrl: string | null;
  sourceUrlType?: "signal" | "profile" | null;
  sourcePostId: string | null;
  sourcePostUrl: string | null;
  sourceEntityUrl: string | null;
  sourceAuthorUrl: string | null;
  sourceQuery: string | null;
}

export interface DiscoveryCandidate {
  providerId: string;
  name: string;
  headline: string;
  location: string;
  publicIdentifier: string;
  networkDistance: string;
  profilePictureUrl?: string;

  signalSource: SignalSource;
  signalContext: string;
  sourcePostId?: string;
  topicKey?: string;
  topicLabel?: string;
  signalKind?: SignalKind;
  signalPayload?: Record<string, unknown>;

  icpFit: number;          // 0-1
  intentScore: number;     // 0-5
  totalScore: number;      // icpFit + intentScore
  scoreReasoning: string;
}

export type SignalCandidateStatus = "new" | "shortlisted" | "promoted" | "dismissed";

export interface SignalCandidate {
  id: string;
  workspaceId: string;
  agentId: string;
  campaignId?: string;
  leadId?: string;
  providerId: string;
  name: string;
  headline: string;
  location: string;
  publicIdentifier: string;
  networkDistance: string;
  signalSource: SignalSource;
  signalContext: string;
  sourcePostId?: string;
  topicKey?: string;
  topicLabel?: string;
  signalKind?: SignalKind;
  signalPayload?: Record<string, unknown>;
  language: Lead["language"];
  icpFit: number;
  intentScore: number;
  totalScore: number;
  scoreReasoning: string;
  status: SignalCandidateStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveryRun {
  id: string;
  workspaceId: string;
  agentId: string;
  startedAt: string;
  completedAt: string;
  status: "completed" | "error";
  sources: Record<string, { scanned: number; found: number }>;
  totalDiscovered: number;
  totalDuplicates: number;
  totalSaved: number;
  errors: string[];
}

// ── Brain v0 types ────────────────────────────────────────────────────

export interface ConversionMetrics {
  total: number;
  sent: number;
  accepted: number;
  replied: number;
  connectRate: number;
  replyRate: number;
  replyOfAccepted: number;
}

export interface BrainPatterns {
  bySegment: Record<string, ConversionMetrics>;
  byLanguage: Record<string, ConversionMetrics>;
  byNetworkDistance: Record<string, ConversionMetrics>;
  byTemplateIndex: Record<string, ConversionMetrics>;
  byDayOfWeek: Record<string, ConversionMetrics>;
  byAiScoreBucket: Record<string, ConversionMetrics>;
  byCampaign: Record<string, ConversionMetrics>;
  avgDaysToAccept: number | null;
  avgDaysToReply: number | null;
  overall: ConversionMetrics;
}

export interface BrainRecommendation {
  type: "insight" | "warning" | "suggestion";
  category: "segment" | "language" | "template" | "timing" | "icp" | "general";
  message: string;
  confidence: "low" | "medium" | "high";
  dataPoints: number;
}

export interface BrainSnapshot {
  id: string;
  workspaceId: string;
  analyzedAt: string;
  leadsAnalyzed: number;
  campaignsAnalyzed: number;
  patterns: BrainPatterns;
  recommendations: BrainRecommendation[];
  activeExperimentId?: string;
}

// ── Brain v1 — Experiment types ──────────────────────────────────────

export type ExperimentVariable = "template_weights" | "template_variant" | "targeting" | "timing";
export type ExperimentStatus = "proposed" | "approved" | "running" | "kept" | "discarded" | "cancelled";

export interface TemplateWeights {
  [templateIndex: number]: number;  // e.g. {0: 0.2, 1: 0.5, 2: 0.3}
}

export interface ExperimentArm {
  name: string;
  templateWeights?: TemplateWeights;
  templateIndex?: number;
  templateText?: string;
  templateHash?: string;
  description: string;
}

export interface BrainExperiment {
  id: string;                        // exp_xxxxxxxx
  workspaceId: string;
  campaignId: string;
  language?: string;
  variable: ExperimentVariable;
  hypothesis: string;
  reasoning: string;
  control: ExperimentArm;
  challenger: ExperimentArm;
  status: ExperimentStatus;
  splitRatio: number;                // 0.5 in v1
  minSamplePerArm: number;
  maxDurationDays: number;
  controlLeadIds: string[];
  challengerLeadIds: string[];
  mutationAxis?: string;
  contextSnapshot?: {
    sourceSnapshotId: string;
    agentId: string;
    agentName: string;
    campaignName: string;
    segment: string;
    search: Campaign["search"];
    templates: string[];
    templateHashes: string[];
    bestTemplateIndex?: number;
    controlWeights?: TemplateWeights;
    challengerWeights?: TemplateWeights;
  };
  results?: {
    control: ConversionMetrics;
    challenger: ConversionMetrics;
    winner: "control" | "challenger" | "inconclusive";
    confidenceLevel: "low" | "medium" | "high";
    deltaConnectRate?: number;
    pValue?: number;
    summary: string;
  };
  previousConfig?: { templateWeights?: TemplateWeights };
  proposedAt: string;
  approvedAt?: string;
  startedAt?: string;
  evaluatedAt?: string;
  decidedAt?: string;
}

export interface ExperimentExposure {
  id: string;                        // exp_xxx:led_xxx
  experimentId: string;
  workspaceId: string;
  campaignId: string;
  leadId: string;
  providerId: string;
  language: "it" | "en";
  experimentArm: "control" | "challenger";
  templateIndex: number;
  templateHash?: string;
  assignedAt: string;
  sentAt: string;
  acceptedAt?: string;
  repliedAt?: string;
  updatedAt: string;
}
