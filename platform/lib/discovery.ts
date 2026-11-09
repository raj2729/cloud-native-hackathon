/** Public response shapes intentionally exclude resumes, links and embedding payloads. */
export interface DiscoveryInput {
  query: string;
  kind: 'all' | 'talks' | 'people';
  eventId: string;
  tag: string;
  assistant: boolean;
}
export interface DiscoverySource {
  id: string;
  citation: string;
  kind: 'talk' | 'person';
  title: string;
  excerpt: string;
  href: string;
  tags: string[];
  signals: { keyword: number; semantic: number; interests: number; popularity: number; social: number };
  attendees: number;
  session?: {
    rooms: string[];
    startsAt: string;
    endsAt: string;
    speaker: string;
    track: string;
  };
}
export interface DiscoveryResult {
  query: string;
  sources: DiscoverySource[];
  answer?: string;
  generation: 'openai' | 'elastic' | 'extractive' | 'none';
  semantic: boolean;
  warnings: string[];
  elapsedMs: number;
  retrieved: number;
}
