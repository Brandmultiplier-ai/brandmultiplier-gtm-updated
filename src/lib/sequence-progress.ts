import type { Campaign, Lead, LeadEvent, LeadStatus, SequenceStep } from "./types";

const MANUAL_OVERRIDE_REASON = "Sequence stopped after manual outbound message";

interface ReconcileResult {
  lead: Lead;
  changed: boolean;
  inferredAccepted: boolean;
  manualOverride: boolean;
}

function eventTime(event: LeadEvent): number {
  const parsed = Date.parse(event.ts);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortEvents(events: LeadEvent[]): LeadEvent[] {
  return events
    .map((event, index) => ({ event: { ...event }, index }))
    .sort((a, b) => {
      const delta = eventTime(a.event) - eventTime(b.event);
      return delta === 0 ? a.index - b.index : delta;
    })
    .map(({ event }) => event);
}

function hasAcceptedEvent(events: LeadEvent[]): boolean {
  return events.some((event) => event.type === "accepted");
}

function hasReplyEvent(events: LeadEvent[]): boolean {
  return events.some((event) => event.type === "replied");
}

function hasManualOverrideEvent(events: LeadEvent[]): boolean {
  return events.some((event) => event.type === "skipped" && event.message === MANUAL_OVERRIDE_REASON);
}

function deriveStatus(currentStatus: LeadStatus, events: LeadEvent[], manualOverride: boolean): LeadStatus {
  if (["interested", "not_interested", "skipped", "rate_limited"].includes(currentStatus)) {
    return currentStatus;
  }

  if (hasReplyEvent(events)) return "replied";
  if (manualOverride || currentStatus === "manual_override" || hasManualOverrideEvent(events)) return "manual_override";
  if (events.some((event) => event.type === "message_sent")) return "message_sent";
  if (hasAcceptedEvent(events)) return "accepted";
  if (events.some((event) => event.type === "invite_sent")) return "invite_sent";
  return currentStatus;
}

function deriveCurrentStep(lead: Lead, events: LeadEvent[]): number {
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

  return Math.max(currentStep, lead.currentStep);
}

export function reconcileSequenceProgressFromEvents(lead: Lead, campaign: Campaign): ReconcileResult {
  const sortedEvents = sortEvents(lead.events || []);
  const originalEvents = JSON.stringify(lead.events || []);

  let inferredAccepted = false;
  let manualOverride = false;

  for (let index = 0; index < sortedEvents.length; index++) {
    const event = sortedEvents[index];

    if (event.type !== "message_sent") continue;
    if (typeof event.step === "number") {
      continue;
    }
    if (hasReplyEvent(sortedEvents.slice(0, index + 1))) continue;

    if (!hasAcceptedEvent(sortedEvents.slice(0, index + 1))) {
      const acceptedTs = new Date(Math.max(eventTime(event) - 1, 0)).toISOString();
      sortedEvents.splice(index, 0, {
        ts: acceptedTs,
        type: "accepted",
        message: "Inferred from manual LinkedIn message",
      });
      inferredAccepted = true;
      index++;
    }

    const hasExistingManualMarker = sortedEvents.some((candidate) =>
      candidate.type === "skipped" &&
      candidate.message === MANUAL_OVERRIDE_REASON &&
      Math.abs(eventTime(candidate) - eventTime(event)) <= 5 * 60 * 1000
    );

    if (!hasExistingManualMarker) {
      sortedEvents.push({
        ts: new Date(Math.max(eventTime(event) + 1, 0)).toISOString(),
        type: "skipped",
        message: MANUAL_OVERRIDE_REASON,
      });
    }

    manualOverride = true;
  }

  sortEvents(sortedEvents).forEach((event, index) => {
    sortedEvents[index] = event;
  });
  const nextCurrentStep = deriveCurrentStep(lead, sortedEvents);
  const nextStatus = deriveStatus(lead.status, sortedEvents, manualOverride);
  const nextLead: Lead = {
    ...lead,
    currentStep: nextCurrentStep,
    status: nextStatus,
    events: sortedEvents,
  };

  const changed =
    inferredAccepted ||
    manualOverride ||
    nextCurrentStep !== lead.currentStep ||
    nextStatus !== lead.status ||
    JSON.stringify(nextLead.events) !== originalEvents;

  return {
    lead: nextLead,
    changed,
    inferredAccepted,
    manualOverride,
  };
}
