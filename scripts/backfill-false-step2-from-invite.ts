import * as store from "../src/lib/store";
import type { Lead, LeadEvent } from "../src/lib/types";

function normalize(text: string | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function deriveStatus(events: LeadEvent[]): Lead["status"] {
  if (events.some((event) => event.type === "replied")) return "replied";
  if (events.some((event) => event.type === "message_sent")) return "message_sent";
  if (events.some((event) => event.type === "accepted")) return "accepted";
  if (events.some((event) => event.type === "invite_sent")) return "invite_sent";
  return "discovered";
}

function deriveCurrentStep(events: LeadEvent[]): number {
  let currentStep = 0;

  for (const event of events) {
    if (event.type === "invite_sent") {
      currentStep = Math.max(currentStep, 1);
      continue;
    }
    if (event.type === "message_sent" && typeof event.step === "number") {
      currentStep = Math.max(currentStep, event.step);
    }
  }

  return currentStep;
}

function stripFalseInviteEcho(lead: Lead): Lead | null {
  const inviteEvent = (lead.events || []).find((event) => event.type === "invite_sent" && event.message);
  if (!inviteEvent?.message) return null;

  const falseMessageIndex = (lead.events || []).findIndex((event) =>
    event.type === "message_sent" &&
    normalize(event.message) === normalize(inviteEvent.message) &&
    (event.step === undefined || event.step === 2)
  );

  if (falseMessageIndex === -1) return null;

  const falseMessage = lead.events[falseMessageIndex];
  const falseMessageTs = Date.parse(falseMessage.ts);

  const nextEvents = (lead.events || []).filter((event, index) => {
    if (index === falseMessageIndex) return false;

    if (
      event.type === "accepted" &&
      event.message === "Inferred from manual LinkedIn message" &&
      Math.abs(Date.parse(event.ts) - falseMessageTs) <= 5 * 1000
    ) {
      return false;
    }

    if (
      event.type === "skipped" &&
      event.message === "Sequence stopped after manual outbound message" &&
      Math.abs(Date.parse(event.ts) - falseMessageTs) <= 5 * 1000
    ) {
      return false;
    }

    return true;
  });

  return {
    ...lead,
    events: nextEvents,
    status: deriveStatus(nextEvents),
    currentStep: deriveCurrentStep(nextEvents),
    updatedAt: new Date().toISOString(),
  };
}

async function main() {
  const campaignId = process.argv[2] || "cmp_c4g_freelancer";
  const leads = await store.listLeads(campaignId, { workspaceId: "ws_default" });

  let updated = 0;

  for (const lead of leads) {
    if (lead.status === "replied") continue;

    const cleaned = stripFalseInviteEcho(lead);
    if (!cleaned) continue;

    await store.saveLead(cleaned);
    updated++;
    console.log(`cleaned\t${lead.name}\t${lead.status}->${cleaned.status}\tstep ${lead.currentStep}->${cleaned.currentStep}`);
  }

  console.log(`updated=${updated}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
