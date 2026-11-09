import type { Interest } from './taxonomy';

export interface Room {
  id: string;
  name: string;
  capacity: number;
}

export interface Event {
  id: string;
  name: string;
  slug: string;
  venue: string;
  description: string;
  startsAt: string;
  endsAt: string;
  rooms: Room[];
  createdAt: string;
}

export interface Speaker {
  name: string;
  title: string;
  company: string;
  bio: string;
  photoUrl: string;
  linkedin: string;
  github: string;
}

export interface Talk {
  id: string;
  eventId: string;
  title: string;
  abstract: string;
  tags: string[];
  /** Room numbers this talk occupies. The primary room is first. */
  rooms: string[];
  track: string;
  startsAt: string;
  endsAt: string;
  speaker: Speaker;
  /** Concatenated text behind the `semantic_text` field. Absent when the e5 model is unavailable. */
  semantic?: string;
  createdAt: string;
}

export interface UserLinks {
  linkedin?: string;
  github?: string;
  resumeText?: string;
}

export interface User {
  id: string;
  name: string;
  headline: string;
  summary: string;
  interests: Interest[];
  /** Tags inferred from LinkedIn/GitHub/resume by `lib/ai.ts`. */
  derivedTags: string[];
  /** Seed-only grouping label, used to sanity-check matching during the demo. */
  cluster?: string;
  avatarSeed: string;
  isSeeded: boolean;
  links: UserLinks;
  profileText: string;
  semantic?: string;
  createdAt: string;
}

export type AttendanceState = 'saved' | 'checked_in';

export interface Attendance {
  id: string;
  userId: string;
  talkId: string;
  eventId: string;
  room: string;
  state: AttendanceState;
  at: string;
}

/** A talk plus the reason it was recommended. */
export interface RankedTalk {
  talk: Talk;
  /** 0-100, normalised for display. */
  score: number;
  matchedInterests: string[];
  /** Which retrievers contributed, for the "why" line and for debugging. */
  signals: { tags: boolean; keyword: boolean; semantic: boolean };
  attendeeCount?: number;
}

/** A person plus why they are worth meeting. */
export interface RankedPerson {
  user: User;
  score: number;
  sharedInterests: string[];
  sharedTalks: Talk[];
  rationale?: string;
}

/** "N people like you are attending this talk." */
export interface SimilarAttendance {
  talk: Talk;
  peerCount: number;
  peers: User[];
}

export interface RoomLoad {
  room: Room;
  count: number;
  /** Share of capacity, 0-1, clamped. */
  utilisation: number;
  nowPlaying?: Talk;
}

export interface TrendingTalk {
  talk: Talk;
  recent: number;
  previous: number;
  /** recent - previous. Ranking by velocity surfaces what is heating up now. */
  velocity: number;
}
