export type SkinTone = 'FAIR' | 'LIGHT' | 'OLIVE' | 'MEDIUM_BROWN' | 'DARK_BROWN' | 'DEEP';
export type AssetStatus = 'TO_REVIEW' | 'APPROVED' | 'HOLD' | 'REJECTED';
export type Role = 'CREATOR' | 'REVIEWER' | 'ADMIN';

export interface SkinToneInfo {
  id: SkinTone;
  name: string;
  color: string;
}

export interface Event {
  id: string;
  name: string;
  startDate: string;
  endDate?: string | null;
  totalTarget: number;
  perToneTarget: number;
  tier: number;
  description?: string | null;
}

export interface Asset {
  id: string;
  title?: string | null;
  eventId: string;
  skinTone: SkinTone;
  status: AssetStatus;
  uploaderId: string;
  reviewerId?: string | null;
  sourceFileUrl: string;
  previewUrl: string;
  version: number;
  notesRefinement?: string | null;
  notesIdeas?: string | null;
  tags: string[];
  reasonRejected?: string | null;
  createdAt: string;
  updatedAt: string;
  uploader?: {
    name?: string | null;
    email: string;
  };
  reviewer?: {
    name?: string | null;
    email: string;
  };
  event?: Event;
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
}