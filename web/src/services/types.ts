export type EventMembershipRole = "event_manager" | "staff";

export interface User {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
}

export interface Membership {
  eventId: string;
  role: EventMembershipRole;
}

export type EventStatus = "draft" | "open" | "closed" | "archived";

export interface CampEvent {
  id: string;
  slug: string;
  name: string;
  kind: "church_camp" | "generic";
  timezone: string;
  status: EventStatus;
  startsOn: string;
  endsOn: string;
}
