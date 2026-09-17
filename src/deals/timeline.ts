export type DealEventKind =
  | "deal_opened"
  | "document"
  | "email"
  | "note"
  | "extract"
  | "dossier_version"
  | "share";

export type TimelineEvent = {
  id: string;
  kind: DealEventKind;
  title: string;
  summary: string | null;
  refType: string | null;
  refId: string | null;
  createdAt: Date;
  metadata: Record<string, unknown>;
};

export function sortTimelineNewestFirst(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function timelineEmptyCopy(propertyName: string): { title: string; body: string } {
  return {
    title: `Nothing on ${propertyName} yet`,
    body: "Upload a listing or inspection PDF, forward an email to this deal’s alias, or drop a note. Every capture lands here — documents, extracts, dossier versions, and your own commentary.",
  };
}

export const TIMELINE_KIND_LABEL: Record<DealEventKind, string> = {
  deal_opened: "Opened",
  document: "Document",
  email: "Email",
  note: "Note",
  extract: "Extract",
  dossier_version: "Dossier",
  share: "Share",
};
