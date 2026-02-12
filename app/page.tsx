'use client';
import Image from 'next/image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Check, Pause, X, Clock, Calendar, AlertCircle, ChevronRight, ArrowRight } from 'lucide-react';
import { INITIAL_EVENTS, OVERALL_GOAL, SKIN_TONES } from '@/lib/constants';
import { supabase } from '@/lib/supabaseClient';
import type { AssetStatus, SkinTone } from '@/types';
import type { Session } from '@supabase/supabase-js';

type View = 'dashboard' | 'queue' | 'events' | 'asset-detail' | 'text-signoff';
type Role = 'creator' | 'reviewer';

type UiAsset = {
  id: string;
  title: string;
  eventId: string;
  skinTone: SkinTone;
  status: AssetStatus;
  uploader: string;
  reviewer?: string | null;
  createdAt: string;
  updatedAt?: string;
  version: number;
  notesRefinement?: string;
  notesIdeas?: string;
  previewColor: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaStorage?: 'inline' | 'object';
  fileName?: string;
  fileSize?: number;
};

type TextItem = {
  id: string;
  title: string;
  body: string;
  category: string;
  status: AssetStatus;
  author: string;
  reviewer?: string | null;
  createdAt: string;
  updatedAt?: string;
  tags: string[];
  reviewNotes?: string;
  groupId?: string;
  sectionId?: string;
};

type TextGroup = {
  id: string;
  name: string;
  description?: string;
  eventId?: string | null;
  createdAt: string;
  updatedAt?: string;
};

type TextSection = {
  id: string;
  groupId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
};

type ActivityAction = 'CREATED' | 'STATUS_CHANGED' | 'COMMENT';
type ActivitySubject = 'asset' | 'text';

type ActivityEntry = {
  id: string;
  subjectType: ActivitySubject;
  subjectId: string;
  action: ActivityAction;
  actor: string;
  timestamp: string;
  fromStatus?: AssetStatus | null;
  toStatus?: AssetStatus | null;
  comment?: string;
};

type NotificationSettings = {
  enabled: boolean;
  slackWebhookUrl: string;
  notifyOnNew: boolean;
  notifyOnApproved: boolean;
  notifyOnHold: boolean;
  notifyOnRejected: boolean;
};

type EventRecord = {
  id: string;
  name: string;
  startDate: string;
  endDate?: string | null;
  totalTarget: number;
  perToneTarget: number;
  tier: number;
  description?: string | null;
};

const STORAGE_KEY = 'gif-you-assets';
const TEXT_STORAGE_KEY = 'gif-you-texts';
const TEXT_GROUPS_STORAGE_KEY = 'gif-you-text-groups';
const TEXT_SECTIONS_STORAGE_KEY = 'gif-you-text-sections';
const EVENT_STORAGE_KEY = 'gif-you-events';
const ACTIVITY_STORAGE_KEY = 'gif-you-activity';
const NOTIFICATIONS_STORAGE_KEY = 'gif-you-notifications';
const MAX_INLINE_BYTES = 2 * 1024 * 1024;
const AUTH_RESEND_SECONDS = 30;
const R2_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? '';
const TEXT_CATEGORIES = ['Idea', 'Prompt', 'Copy', 'Script', 'Caption', 'Notes'];
const TEXT_SNIPPET_LENGTH = 180;
const UNASSIGNED_GROUP_ID = 'unassigned';
const UNASSIGNED_SECTION_ID = 'unassigned-section';
const ALL_TONE_ID: SkinTone = 'ALL';
const TAG_BADGE_STYLES: Record<string, string> = {
  funny: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  general: 'bg-rose-100 text-rose-700 border-rose-200'
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  slackWebhookUrl: '',
  notifyOnNew: true,
  notifyOnApproved: true,
  notifyOnHold: false,
  notifyOnRejected: true
};

const STATUS_LABELS: Record<AssetStatus, string> = {
  TO_REVIEW: 'To Review',
  APPROVED: 'Approved',
  HOLD: 'Hold',
  REJECTED: 'Rejected'
};

const STATUS_STYLES: Record<AssetStatus, string> = {
  TO_REVIEW: 'bg-blue-100 text-blue-700 border-blue-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  HOLD: 'bg-amber-100 text-amber-700 border-amber-200',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-200'
};

const ASSET_STATUSES: AssetStatus[] = ['TO_REVIEW', 'APPROVED', 'HOLD', 'REJECTED'];

const LEGACY_STATUS_MAP: Record<string, AssetStatus> = {
  'To Review': 'TO_REVIEW',
  Approved: 'APPROVED',
  Hold: 'HOLD',
  Rejected: 'REJECTED',
  TO_REVIEW: 'TO_REVIEW',
  APPROVED: 'APPROVED',
  HOLD: 'HOLD',
  REJECTED: 'REJECTED'
};

const LEGACY_TONE_MAP: Record<string, SkinTone> = {
  fair: 'FAIR',
  light: 'LIGHT',
  olive: 'OLIVE',
  'medium-brown': 'MEDIUM_BROWN',
  'dark-brown': 'DARK_BROWN',
  deep: 'DEEP',
  all: 'ALL',
  'all-tones': 'ALL',
  neutral: 'ALL',
  'tone-neutral': 'ALL',
  FAIR: 'FAIR',
  LIGHT: 'LIGHT',
  OLIVE: 'OLIVE',
  MEDIUM_BROWN: 'MEDIUM_BROWN',
  DARK_BROWN: 'DARK_BROWN',
  DEEP: 'DEEP',
  ALL: 'ALL'
};

const normalizeStatus = (value: unknown): AssetStatus | null => {
  if (typeof value !== 'string') return null;
  return LEGACY_STATUS_MAP[value] ?? null;
};

const normalizeTone = (value: unknown): SkinTone | null => {
  if (typeof value !== 'string') return null;
  return LEGACY_TONE_MAP[value] ?? null;
};

const normalizeStoredAssets = (input: unknown): UiAsset[] => {
  if (!Array.isArray(input)) return [];

  return input
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const data = raw as Record<string, unknown>;
      const status = normalizeStatus(data.status);
      const skinTone = normalizeTone(data.skinTone ?? data.skin_tone);
      const eventId = typeof data.eventId === 'string'
        ? data.eventId
        : typeof data.event_id === 'string'
        ? data.event_id
        : '';

      if (!status || !skinTone || !eventId) return null;

      const title = typeof data.title === 'string' && data.title.trim().length > 0
        ? data.title.trim()
        : 'Untitled Asset';

      const createdAt = typeof data.createdAt === 'string'
        ? data.createdAt
        : typeof data.created_at === 'string'
        ? data.created_at
        : new Date().toISOString();

      const updatedAt = typeof data.updatedAt === 'string'
        ? data.updatedAt
        : typeof data.updated_at === 'string'
        ? data.updated_at
        : undefined;

      const previewColor = typeof data.previewColor === 'string'
        ? data.previewColor
        : typeof data.preview_color === 'string'
        ? data.preview_color
        : skinTone === ALL_TONE_ID
        ? '#94a3b8'
        : SKIN_TONES.find(tone => tone.id === skinTone)?.color ?? '#ccc';

      const rawMediaUrl = typeof data.mediaUrl === 'string'
        ? data.mediaUrl
        : typeof data.media_url === 'string'
        ? data.media_url
        : undefined;
      const mediaType = typeof data.mediaType === 'string'
        ? data.mediaType
        : typeof data.media_type === 'string'
        ? data.media_type
        : undefined;
      const rawMediaStorage = typeof data.mediaStorage === 'string'
        ? data.mediaStorage
        : typeof data.media_storage === 'string'
        ? data.media_storage
        : undefined;
      const mediaStorage = rawMediaStorage === 'inline' || rawMediaStorage === 'object'
        ? rawMediaStorage
        : rawMediaUrl?.startsWith('data:')
        ? 'inline'
        : undefined;
      const mediaUrl = mediaStorage === 'object' && rawMediaUrl?.startsWith('blob:')
        ? undefined
        : rawMediaUrl;
      const fileName = typeof data.fileName === 'string'
        ? data.fileName
        : typeof data.file_name === 'string'
        ? data.file_name
        : undefined;
      const fileSize = typeof data.fileSize === 'number'
        ? data.fileSize
        : typeof data.file_size === 'number'
        ? data.file_size
        : undefined;

      const notesRefinement = typeof data.notesRefinement === 'string'
        ? data.notesRefinement
        : typeof data.notes_refinement === 'string'
        ? data.notes_refinement
        : '';

      const notesIdeas = typeof data.notesIdeas === 'string'
        ? data.notesIdeas
        : typeof data.notes_ideas === 'string'
        ? data.notes_ideas
        : '';

      const uploader = typeof data.uploader === 'string' ? data.uploader : 'Creator Team';
      const reviewer = typeof data.reviewer === 'string' ? data.reviewer : null;
      const version = typeof data.version === 'number' ? data.version : 1;

      return {
        id: typeof data.id === 'string' ? data.id : `asset-${eventId}-${skinTone}-${Date.now()}`,
        title,
        eventId,
        skinTone,
        status,
        uploader,
        reviewer,
        createdAt,
        updatedAt,
        version,
        notesRefinement,
        notesIdeas,
        previewColor,
        mediaUrl,
        mediaType,
        mediaStorage,
        fileName,
        fileSize
      };
    })
    .filter((asset): asset is UiAsset => Boolean(asset));
};

const normalizeStoredTextItems = (input: unknown): TextItem[] => {
  if (!Array.isArray(input)) return [];

  return input
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const data = raw as Record<string, unknown>;
      const status = normalizeStatus(data.status);
      if (!status) return null;

      const rawTitle = typeof data.title === 'string' ? data.title.trim() : '';
      const rawBody = typeof data.body === 'string'
        ? data.body
        : typeof data.content === 'string'
        ? data.content
        : '';

      if (!rawTitle && !rawBody) return null;

      const category = typeof data.category === 'string' && data.category.trim().length > 0
        ? data.category.trim()
        : 'Idea';
      const tags = Array.isArray(data.tags)
        ? data.tags.filter((tag): tag is string => typeof tag === 'string')
        : typeof data.tags === 'string'
        ? data.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : [];
      const createdAt = typeof data.createdAt === 'string'
        ? data.createdAt
        : typeof data.created_at === 'string'
        ? data.created_at
        : new Date().toISOString();
      const updatedAt = typeof data.updatedAt === 'string'
        ? data.updatedAt
        : typeof data.updated_at === 'string'
        ? data.updated_at
        : undefined;
      const author = typeof data.author === 'string' ? data.author : 'Creator Team';
      const reviewer = typeof data.reviewer === 'string' ? data.reviewer : null;
      const reviewNotes = typeof data.reviewNotes === 'string'
        ? data.reviewNotes
        : typeof data.review_notes === 'string'
        ? data.review_notes
        : '';
      const groupId = typeof data.groupId === 'string'
        ? data.groupId
        : typeof data.group_id === 'string'
        ? data.group_id
        : undefined;
      const sectionId = typeof data.sectionId === 'string'
        ? data.sectionId
        : typeof data.section_id === 'string'
        ? data.section_id
        : undefined;

      const title = rawTitle || rawBody.split('\n')[0]?.slice(0, 60).trim() || 'Untitled idea';

      return {
        id: typeof data.id === 'string' ? data.id : `text-${Date.now()}`,
        title,
        body: rawBody,
        category,
        status,
        author,
        reviewer,
        createdAt,
        updatedAt,
        tags,
        reviewNotes,
        groupId,
        sectionId
      };
    })
    .filter((item): item is TextItem => Boolean(item));
};

const normalizeStoredTextGroups = (input: unknown): TextGroup[] => {
  if (!Array.isArray(input)) return [];

  return input
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const data = raw as Record<string, unknown>;
      const rawName = typeof data.name === 'string' ? data.name.trim() : '';
      if (!rawName) return null;

      const description = typeof data.description === 'string' ? data.description : '';
      const eventId = typeof data.eventId === 'string'
        ? data.eventId
        : typeof data.event_id === 'string'
        ? data.event_id
        : null;
      const createdAt = typeof data.createdAt === 'string'
        ? data.createdAt
        : typeof data.created_at === 'string'
        ? data.created_at
        : new Date().toISOString();
      const updatedAt = typeof data.updatedAt === 'string'
        ? data.updatedAt
        : typeof data.updated_at === 'string'
        ? data.updated_at
        : undefined;

      return {
        id: typeof data.id === 'string' ? data.id : `group-${Date.now()}`,
        name: rawName,
        description,
        eventId,
        createdAt,
        updatedAt
      };
    })
    .filter((group): group is TextGroup => Boolean(group));
};

const normalizeStoredTextSections = (input: unknown): TextSection[] => {
  if (!Array.isArray(input)) return [];

  return input
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const data = raw as Record<string, unknown>;
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const groupId = typeof data.groupId === 'string'
        ? data.groupId
        : typeof data.group_id === 'string'
        ? data.group_id
        : '';
      if (!name || !groupId) return null;

      const description = typeof data.description === 'string' ? data.description : '';
      const createdAt = typeof data.createdAt === 'string'
        ? data.createdAt
        : typeof data.created_at === 'string'
        ? data.created_at
        : new Date().toISOString();
      const updatedAt = typeof data.updatedAt === 'string'
        ? data.updatedAt
        : typeof data.updated_at === 'string'
        ? data.updated_at
        : undefined;

      return {
        id: typeof data.id === 'string' ? data.id : `section-${Date.now()}`,
        groupId,
        name,
        description,
        createdAt,
        updatedAt
      };
    })
    .filter((section): section is TextSection => Boolean(section));
};

const normalizeStoredEvents = (input: unknown): EventRecord[] => {
  if (!Array.isArray(input)) return [];

  return input
    .map((raw, index) => {
      if (!raw || typeof raw !== 'object') return null;
      const data = raw as Record<string, unknown>;
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const startDate = typeof data.startDate === 'string'
        ? data.startDate
        : typeof data.start_date === 'string'
        ? data.start_date
        : '';
      if (!name || !startDate) return null;

      const totalTarget = Number.parseInt(String(data.totalTarget ?? data.total_target ?? ''), 10);
      const perToneTarget = Number.parseInt(String(data.perToneTarget ?? data.per_tone_target ?? 0), 10);
      const tier = Number.parseInt(String(data.tier ?? ''), 10);
      if (!Number.isFinite(totalTarget) || !Number.isFinite(tier)) return null;

      return {
        id: typeof data.id === 'string' ? data.id : `event-${Date.now()}-${index}`,
        name,
        startDate,
        endDate: typeof data.endDate === 'string'
          ? data.endDate
          : typeof data.end_date === 'string'
          ? data.end_date
          : null,
        totalTarget,
        perToneTarget: Number.isFinite(perToneTarget) ? perToneTarget : 0,
        tier,
        description: typeof data.description === 'string' ? data.description : null
      };
    })
    .filter((event): event is EventRecord => Boolean(event));
};

const buildTextSnippet = (value: string) => (
  value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TEXT_SNIPPET_LENGTH)
);

const splitBulkImportLine = (line: string) => {
  const trimmed = line.trim();
  const delimiters = [' :: ', ' - ', ' | '];
  for (const delimiter of delimiters) {
    const index = trimmed.indexOf(delimiter);
    if (index > 0 && index < trimmed.length - delimiter.length) {
      const left = trimmed.slice(0, index).trim();
      const right = trimmed.slice(index + delimiter.length).trim();
      if (left && right) {
        return { title: left, body: right };
      }
    }
  }
  return { title: trimmed, body: '' };
};

const splitBulkImportEntries = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const blockSplit = trimmed
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);

  const rawEntries = blockSplit.length > 1
    ? blockSplit
    : trimmed
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

  return rawEntries
    .map(entry => {
      const lines = entry
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      if (lines.length === 0) return null;

      const [first, ...rest] = lines;
      const split = splitBulkImportLine(first);
      const restBody = rest.join('\n').trim();
      const combinedBody = [split.body, restBody].filter(Boolean).join('\n');

      return {
        title: split.title || first.trim(),
        body: combinedBody || split.title || first.trim()
      };
    })
    .filter((entry): entry is { title: string; body: string } => Boolean(entry));
};

const normalizeStoredActivity = (input: unknown): ActivityEntry[] => {
  if (!Array.isArray(input)) return [];

  return input
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const data = raw as Record<string, unknown>;
      const rawSubjectType = typeof data.subjectType === 'string'
        ? data.subjectType
        : typeof data.subject_type === 'string'
        ? data.subject_type
        : '';
      const subjectType = rawSubjectType === 'asset' || rawSubjectType === 'text'
        ? rawSubjectType
        : null;
      const action = data.action === 'CREATED'
        || data.action === 'STATUS_CHANGED'
        || data.action === 'COMMENT'
        ? data.action
        : null;
      if (!subjectType || !action) return null;

      const subjectId = typeof data.subjectId === 'string'
        ? data.subjectId
        : typeof data.subject_id === 'string'
        ? data.subject_id
        : '';
      const actor = typeof data.actor === 'string' ? data.actor : '';
      const timestamp = typeof data.timestamp === 'string'
        ? data.timestamp
        : typeof data.created_at === 'string'
        ? data.created_at
        : '';
      if (!subjectId || !actor || !timestamp) return null;

      return {
        id: typeof data.id === 'string' ? data.id : `activity-${Date.now()}`,
        subjectType,
        subjectId,
        action,
        actor,
        timestamp,
        fromStatus: normalizeStatus(data.fromStatus ?? data.from_status) ?? null,
        toStatus: normalizeStatus(data.toStatus ?? data.to_status) ?? null,
        comment: typeof data.comment === 'string' ? data.comment : ''
      };
    })
    .filter((entry): entry is ActivityEntry => Boolean(entry));
};

const readFileAsDataUrl = (file: File) => (
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  })
);

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const formatBytes = (bytes: number) => {
  if (bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const formatCountdown = (seconds: number) => {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const formatAuthError = (message: string) => {
  if (message.toLowerCase().includes('email not confirmed')) {
    return 'Email not confirmed. In Supabase, mark the user as confirmed or disable email confirmation.';
  }
  if (message.toLowerCase().includes('invalid login credentials')) {
    return 'Invalid email or password.';
  }
  if (message.toLowerCase().includes('rate limit')) {
    return 'Too many attempts. Wait a bit before trying again.';
  }
  return message;
};

const isLikelySlackWebhook = (value: string) => (
  /^https:\/\/hooks\.slack(?:-gov)?\.com\/services\/.+/i.test(value.trim())
);

const normalizeTagValue = (tag: string) => tag.trim().toLowerCase();
const getTagBadgeClass = (tag: string) => (
  TAG_BADGE_STYLES[normalizeTagValue(tag)] ?? 'bg-blue-50 text-blue-700 border-blue-200'
);

const sanitizeFileName = (value: string) => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
);

const buildR2PublicUrl = (key: string) => {
  if (!R2_PUBLIC_BASE_URL) return '';
  return `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
};

const uploadFileToR2 = async (file: File, eventId: string, token?: string) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch('/api/r2/presign', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      eventId
    })
  });

  if (!response.ok) {
    throw new Error('Unable to prepare upload.');
  }

  const payload = await response.json() as { url?: string; key?: string; publicUrl?: string };
  if (!payload.url) {
    throw new Error('Missing upload URL.');
  }

  const uploadResponse = await fetch(payload.url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });

  if (!uploadResponse.ok) {
    throw new Error('Upload failed.');
  }

  const publicUrl = payload.publicUrl || (payload.key ? buildR2PublicUrl(payload.key) : '');
  if (!publicUrl) {
    throw new Error('Missing public asset URL.');
  }

  return publicUrl;
};

const fetchAssetsFromApi = async (token?: string) => {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/assets', { cache: 'no-store', headers });
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeStoredAssets(payload.assets ?? payload);
  } catch (error) {
    console.log('Asset fetch failed:', error);
    return null;
  }
};

const saveAssetsToApi = async (assets: UiAsset[], token?: string) => {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/assets', {
      method: 'POST',
      headers,
      body: JSON.stringify({ assets })
    });
    return response.ok;
  } catch (error) {
    console.log('Asset save failed:', error);
    return false;
  }
};

const deleteAssetFromApi = async (assetId: string, token?: string) => {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`/api/assets/${assetId}`, {
      method: 'DELETE',
      headers
    });
    return response.ok;
  } catch (error) {
    console.log('Asset delete failed:', error);
    return false;
  }
};

const fetchEventsFromApi = async (token?: string) => {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/events', { headers });
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeStoredEvents(payload.events ?? payload);
  } catch (error) {
    console.log('Event fetch failed:', error);
    return null;
  }
};

const saveEventsToApi = async (events: EventRecord[], token?: string) => {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/events', {
      method: 'POST',
      headers,
      body: JSON.stringify({ events })
    });
    return response.ok;
  } catch (error) {
    console.log('Event save failed:', error);
    return false;
  }
};

const fetchTextGroupsFromApi = async (token?: string) => {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/text-groups', { headers, cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeStoredTextGroups(payload.groups ?? payload);
  } catch (error) {
    console.log('Text groups fetch failed:', error);
    return null;
  }
};

const saveTextGroupsToApi = async (groups: TextGroup[], token?: string) => {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/text-groups', {
      method: 'POST',
      headers,
      body: JSON.stringify({ groups })
    });
    return response.ok;
  } catch (error) {
    console.log('Text groups save failed:', error);
    return false;
  }
};

const deleteTextGroupFromApi = async (groupId: string, token?: string) => {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`/api/text-groups/${groupId}`, {
      method: 'DELETE',
      headers
    });
    return response.ok;
  } catch (error) {
    console.log('Text group delete failed:', error);
    return false;
  }
};

const fetchTextSectionsFromApi = async (token?: string) => {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/text-sections', { headers, cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeStoredTextSections(payload.sections ?? payload);
  } catch (error) {
    console.log('Text sections fetch failed:', error);
    return null;
  }
};

const saveTextSectionsToApi = async (sections: TextSection[], token?: string) => {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/text-sections', {
      method: 'POST',
      headers,
      body: JSON.stringify({ sections })
    });
    return response.ok;
  } catch (error) {
    console.log('Text sections save failed:', error);
    return false;
  }
};

const deleteTextSectionFromApi = async (sectionId: string, token?: string) => {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`/api/text-sections/${sectionId}`, {
      method: 'DELETE',
      headers
    });
    return response.ok;
  } catch (error) {
    console.log('Text section delete failed:', error);
    return false;
  }
};

const fetchTextItemsFromApi = async (token?: string) => {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/text-items', { headers, cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeStoredTextItems(payload.items ?? payload);
  } catch (error) {
    console.log('Text items fetch failed:', error);
    return null;
  }
};

const saveTextItemsToApi = async (items: TextItem[], token?: string) => {
  const attempt = async (authToken?: string) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    const response = await fetch('/api/text-items', {
      method: 'POST',
      headers,
      body: JSON.stringify({ items })
    });
    return response;
  };

  try {
    let authToken = token || (await getAuthToken(null));
    let response = await attempt(authToken);
    if (response.status === 401) {
      const { data } = await supabase.auth.refreshSession();
      authToken = data.session?.access_token || (await getAuthToken(null));
      response = await attempt(authToken);
    }
    return response.ok;
  } catch (error) {
    console.log('Text items save failed:', error);
    return false;
  }
};

const refreshTextItemsFromApi = async (token?: string) => {
  if (!token) return null;
  const latest = await fetchTextItemsFromApi(token);
  if (!latest) return null;
  return latest;
};

const deleteTextItemFromApi = async (itemId: string, token?: string) => {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`/api/text-items/${itemId}`, {
      method: 'DELETE',
      headers
    });
    return response.ok;
  } catch (error) {
    console.log('Text item delete failed:', error);
    return false;
  }
};

const fetchActivityFromApi = async (token?: string) => {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/activity', { headers });
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizeStoredActivity(payload.activity ?? payload);
  } catch (error) {
    console.log('Activity fetch failed:', error);
    return null;
  }
};

const saveActivityEntriesToApi = async (activity: ActivityEntry[], token?: string) => {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/activity', {
      method: 'POST',
      headers,
      body: JSON.stringify({ activity })
    });
    return response.ok;
  } catch (error) {
    console.log('Activity save failed:', error);
    return false;
  }
};

const fetchRoleFromApi = async (token?: string) => {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch('/api/role', { headers });
    if (!response.ok) return null;
    const payload = await response.json();
    if (payload?.role !== 'creator' && payload?.role !== 'reviewer') return null;
    return { role: payload.role as Role, locked: Boolean(payload.locked) };
  } catch (error) {
    console.log('Role fetch failed:', error);
    return null;
  }
};

const buildId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const buildAssetId = () => buildId('asset');

const getAuthToken = async (session: Session | null) => {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
  } catch {
    // fall through
  }
  return session?.access_token ?? '';
};

const buildSeedEventId = (event: { name: string; startDate: string }, index: number) => {
  const slug = event.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const date = event.startDate.split('T')[0] ?? event.startDate;
  return `seed-${slug}-${date}-${index}`;
};

const buildSeedEvents = (): EventRecord[] => (
  INITIAL_EVENTS.map((event, index) => ({
    id: typeof event.id === 'string' ? event.id : buildSeedEventId(event, index),
    name: event.name,
    startDate: event.startDate,
    endDate: event.endDate ?? null,
    totalTarget: event.totalTarget,
    perToneTarget: event.perToneTarget ?? 0,
    tier: event.tier,
    description: event.description ?? null
  }))
);

// Generate mock assets
const generateMockAssets = (): UiAsset[] => {
  const assets: UiAsset[] = [];
  const eventSlice = INITIAL_EVENTS.slice(0, 12);

  eventSlice.forEach(event => {
    SKIN_TONES.forEach(tone => {
      const count = Math.floor(Math.random() * 3) + 2;
      for (let i = 0; i < count; i++) {
        const status = ASSET_STATUSES[Math.floor(Math.random() * ASSET_STATUSES.length)];
        assets.push({
          id: `${event.id}-${tone.id}-${i}`,
          title: `${event.name} - ${tone.name} - Variation ${i + 1}`,
          eventId: event.id,
          skinTone: tone.id,
          status,
          uploader: 'Creator Team',
          reviewer: status !== 'TO_REVIEW' ? 'Lead Reviewer' : null,
          createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
          version: 1,
          notesRefinement: status === 'HOLD' ? 'Adjust timing on the bounce animation' : '',
          notesIdeas: '',
          previewColor: tone.color
        });
      }
    });
  });

  return assets;
};

const generateMockTextGroups = (): TextGroup[] => {
  const now = Date.now();
  const christmasEvent = INITIAL_EVENTS.find(event => event.name === 'Christmas');
  const halloweenEvent = INITIAL_EVENTS.find(event => event.name === 'Halloween');

  const base = [
    {
      name: 'Christmas Prompts',
      description: 'Prompt ideation for the Christmas collection.',
      eventId: christmasEvent?.id ?? null
    },
    {
      name: 'Halloween Concepts',
      description: 'Text ideas for spooky season.',
      eventId: halloweenEvent?.id ?? null
    },
    {
      name: 'General Idea Bank',
      description: 'Loose ideas not tied to any event yet.',
      eventId: null
    }
  ] as const;

  return base.map((item, index) => ({
    id: `group-${now}-${index}`,
    name: item.name,
    description: item.description,
    eventId: item.eventId,
    createdAt: new Date(Date.now() - index * 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  }));
};

const generateMockTextSections = (groups: TextGroup[]): TextSection[] => {
  const now = Date.now();
  const groupLookup = new Map(groups.map(group => [group.name, group.id]));
  const base = [
    {
      groupName: 'Christmas Prompts',
      name: 'Christmas Countdown Ideas',
      description: 'Short daily prompt ideas leading up to Christmas.'
    },
    {
      groupName: 'Christmas Prompts',
      name: 'Christmas Eve Ideas',
      description: 'Last-minute Christmas Eve prompts and captions.'
    },
    {
      groupName: 'Halloween Concepts',
      name: 'Costume Prompts',
      description: 'Ideas focused on costume swaps and reveals.'
    }
  ] as const;

  return base
    .map((item, index) => {
      const groupId = groupLookup.get(item.groupName);
      if (!groupId) return null;
      return {
        id: `section-${now}-${index}`,
        groupId,
        name: item.name,
        description: item.description,
        createdAt: new Date(Date.now() - index * 3 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString()
      };
    })
    .filter((section): section is TextSection => Boolean(section));
};

const generateMockTextItems = (groups: TextGroup[], sections: TextSection[]): TextItem[] => {
  const now = Date.now();
  const groupLookup = new Map(groups.map(group => [group.name, group.id]));
  const sectionLookup = new Map(
    sections.map(section => [`${section.groupId}:${section.name}`, section.id])
  );
  const base = [
    {
      title: 'Holiday campaign punchlines',
      body: 'Short, snappy punchlines for the holiday GIF collection. Keep it warm and upbeat.',
      category: 'Copy',
      status: 'TO_REVIEW',
      groupName: 'Christmas Prompts',
      sectionName: 'Christmas Countdown Ideas'
    },
    {
      title: 'Prompt ideas: celebrations',
      body: 'Create 100 prompt ideas centered on community celebrations, with inclusive language and a clear action.',
      category: 'Prompt',
      status: 'TO_REVIEW',
      groupName: 'General Idea Bank'
    },
    {
      title: 'Eid greeting concepts',
      body: 'List greeting ideas that feel modern and minimalist. Focus on light, geometry, and gentle motion.',
      category: 'Idea',
      status: 'HOLD',
      reviewNotes: 'Need more variety in tone: friendly, formal, playful.',
      groupName: 'General Idea Bank'
    },
    {
      title: 'Back-to-school headline options',
      body: 'Collect headline options for the back-to-school collection. Use energetic language and short lines.',
      category: 'Copy',
      status: 'APPROVED',
      groupName: 'General Idea Bank'
    },
    {
      title: 'Onboarding welcome text',
      body: 'Welcome line for new creators. Keep it short and friendly, highlight the workflow in one sentence.',
      category: 'Script',
      status: 'TO_REVIEW',
      groupName: 'General Idea Bank'
    },
    {
      title: 'Black History Month visual notes',
      body: 'Notes on visual symbolism, color palettes, and respectful phrasing for BHM content ideas.',
      category: 'Notes',
      status: 'TO_REVIEW',
      groupName: 'General Idea Bank'
    }
  ] as const;

  return base.map((item, index) => ({
    id: `text-${now}-${index}`,
    title: item.title,
    body: item.body,
    category: item.category,
    status: item.status,
    author: 'Creator Team',
    reviewer: item.status === 'TO_REVIEW' ? null : 'Lead Reviewer',
    createdAt: new Date(Date.now() - index * 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: item.status === 'TO_REVIEW' ? undefined : new Date().toISOString(),
    tags: [],
    reviewNotes: item.reviewNotes ?? '',
    groupId: groupLookup.get(item.groupName) ?? undefined,
    sectionId: item.sectionName && groupLookup.get(item.groupName)
      ? sectionLookup.get(`${groupLookup.get(item.groupName)}:${item.sectionName}`) ?? undefined
      : undefined
  }));
};

const App = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [currentRole, setCurrentRole] = useState<Role>('creator');
  const [roleLocked, setRoleLocked] = useState(false);
  const [events, setEvents] = useState<EventRecord[]>(INITIAL_EVENTS);
  const [assets, setAssets] = useState<UiAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [assetNavIds, setAssetNavIds] = useState<string[]>([]);
  const selectedAsset = useMemo(
    () => assets.find(asset => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'magic' | 'password'>('password');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [authCooldown, setAuthCooldown] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingText, setIsSavingText] = useState(false);
  const [isTestingSlack, setIsTestingSlack] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [batchDeletingAssets, setBatchDeletingAssets] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsSyncError, setAssetsSyncError] = useState('');
  const [eventsLoading, setEventsLoading] = useState(true);
  const [textLoading, setTextLoading] = useState(true);
  const [textSyncError, setTextSyncError] = useState('');
  const [activityLoading, setActivityLoading] = useState(true);
  const uploadLockRef = useRef(false);
  const textSaveLockRef = useRef(false);
  const textGroupItemsRef = useRef<HTMLDivElement | null>(null);
  const [devUser, setDevUser] = useState<{ email?: string | null; user_metadata?: { full_name?: string | null } } | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityEntry[]>([]);
  const [filters, setFilters] = useState<{
    status: AssetStatus | '';
    eventId: string;
    skinTone: SkinTone | '';
  }>({
    status: 'TO_REVIEW',
    eventId: '',
    skinTone: ''
  });
  const [uploadModal, setUploadModal] = useState(false);
  const [batchUploadMode, setBatchUploadMode] = useState(false);
  const [singleUploadMode, setSingleUploadMode] = useState(false);
  const [newAsset, setNewAsset] = useState<{
    title: string;
    eventId: string;
    skinTones: SkinTone[];
    files: File[];
  }>({
    title: '',
    eventId: '',
    skinTones: [],
    files: []
  });
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventModalExpanded, setEventModalExpanded] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventStatusFilter, setEventStatusFilter] = useState<AssetStatus | ''>('');
  const [downloadState, setDownloadState] = useState<{ total: number; current: number } | null>(null);
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [textGroups, setTextGroups] = useState<TextGroup[]>([]);
  const [textSections, setTextSections] = useState<TextSection[]>([]);
  const [textFilters, setTextFilters] = useState<{
    status: AssetStatus | '';
    category: string;
    query: string;
    groupId: string;
    eventId: string;
    sectionId: string;
  }>({
    status: 'TO_REVIEW',
    category: '',
    query: '',
    groupId: '',
    eventId: '',
    sectionId: ''
  });
  const [selectedTextIds, setSelectedTextIds] = useState<string[]>([]);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [textGroupViewerOpen, setTextGroupViewerOpen] = useState(false);
  const [textGroupViewerExpanded, setTextGroupViewerExpanded] = useState(false);
  const [selectedTextGroupId, setSelectedTextGroupId] = useState<string | null>(null);
  const [textGroupViewerStatus, setTextGroupViewerStatus] = useState<AssetStatus | ''>('');
  const [textGroupViewerQuery, setTextGroupViewerQuery] = useState('');
  const [textGroupViewerSectionId, setTextGroupViewerSectionId] = useState<string>('');
  const [eventEditorOpen, setEventEditorOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS
  );
  const [textDraft, setTextDraft] = useState<{
    title: string;
    body: string;
    category: string;
    tags: string;
    status: AssetStatus;
    reviewNotes: string;
    groupId: string;
    sectionId: string;
  }>({
    title: '',
    body: '',
    category: '',
    tags: '',
    status: 'TO_REVIEW',
    reviewNotes: '',
    groupId: '',
    sectionId: ''
  });
  const [groupDraft, setGroupDraft] = useState<{
    name: string;
    description: string;
    eventId: string;
  }>({
    name: '',
    description: '',
    eventId: ''
  });
  const [sectionDraft, setSectionDraft] = useState<{
    name: string;
    description: string;
    groupId: string;
  }>({
    name: '',
    description: '',
    groupId: ''
  });
  const [eventDraft, setEventDraft] = useState<{
    name: string;
    startDate: string;
    endDate: string;
    totalTarget: string;
    perToneTarget: string;
    tier: string;
    description: string;
  }>({
    name: '',
    startDate: '',
    endDate: '',
    totalTarget: '',
    perToneTarget: '',
    tier: '',
    description: ''
  });
  const [bulkImportDraft, setBulkImportDraft] = useState<{
    text: string;
    category: string;
    tags: string;
    status: AssetStatus;
    reviewNotes: string;
    groupId: string;
    sectionId: string;
  }>({
    text: '',
    category: '',
    tags: '',
    status: 'TO_REVIEW',
    reviewNotes: '',
    groupId: '',
    sectionId: ''
  });
  const [textCommentDraft, setTextCommentDraft] = useState('');
  const [assetCommentDraft, setAssetCommentDraft] = useState('');
  const [reviewAction, setReviewAction] = useState<AssetStatus | ''>('');
  const [reviewNotes, setReviewNotes] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const cleanAuthParams = () => {
      const paramsToClear = [
        'code',
        'type',
        'access_token',
        'refresh_token',
        'provider_token',
        'expires_in',
        'expires_at',
        'error',
        'error_description'
      ];
      let changed = false;
      paramsToClear.forEach((param) => {
        if (url.searchParams.has(param)) {
          url.searchParams.delete(param);
          changed = true;
        }
      });

      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;
      if (hash) {
        const hashParams = new URLSearchParams(hash);
        let hashChanged = false;
        paramsToClear.forEach((param) => {
          if (hashParams.has(param)) {
            hashParams.delete(param);
            hashChanged = true;
          }
        });
        if (hashChanged) {
          const nextHash = hashParams.toString();
          const nextUrl = `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ''}`;
          window.history.replaceState({}, '', nextUrl);
          return;
        }
      }

      if (changed) {
        window.history.replaceState({}, '', url.toString());
      }
    };

    const code = url.searchParams.get('code');
    if (!code) {
      cleanAuthParams();
      return;
    }

    supabase.auth.exchangeCodeForSession(code)
      .then(() => {
        cleanAuthParams();
      })
      .catch((error) => {
        console.log('Auth code exchange failed:', error);
        cleanAuthParams();
      });
  }, []);

  useEffect(() => {
    let isMounted = true;
    setAuthLoading(true);

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        setSession(data.session ?? null);
        setAuthLoading(false);
        if (data.session?.user) {
          // actor label now derived from session email
        }
      })
      .catch((error) => {
        console.log('Auth session load failed:', error);
        if (isMounted) setAuthLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
      if (nextSession?.user) {
        // actor label now derived from session email
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authCooldown <= 0) return;
    const timer = setTimeout(() => {
      setAuthCooldown(prev => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [authCooldown]);

  useEffect(() => {
    if (authLoading) return;
    if (devUser) {
      setRoleLocked(false);
      return;
    }
    if (!session) {
      setRoleLocked(false);
      return;
    }

    let isMounted = true;
    const loadRole = async () => {
      const authToken = await getAuthToken(session);
      if (!authToken) return;
      const roleData = await fetchRoleFromApi(authToken);
      if (!roleData || !isMounted) return;
      setRoleLocked(roleData.locked);
      if (roleData.locked) {
        setCurrentRole(roleData.role);
      }
    };
    void loadRole();
    return () => {
      isMounted = false;
    };
  }, [authLoading, devUser, session]);

  useEffect(() => {
    if (authLoading) return;
    let isMounted = true;
    const loadEventData = async () => {
      setEventsLoading(true);
      const finish = () => {
        if (isMounted) setEventsLoading(false);
      };

      if (devUser) {
        let storedEvents: string | null = null;

        try {
          storedEvents = window.localStorage.getItem(EVENT_STORAGE_KEY);
        } catch {
          storedEvents = null;
        }

        if (storedEvents) {
          try {
            const parsed = JSON.parse(storedEvents);
            const normalized = normalizeStoredEvents(parsed);
            if (normalized.length > 0) {
              if (isMounted) setEvents(normalized);
              finish();
              return;
            }
          } catch {
            // fall through to defaults
          }
        }

        if (isMounted) setEvents(INITIAL_EVENTS);
        try {
          window.localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(INITIAL_EVENTS));
        } catch {
          // ignore storage failures (private mode, quota, etc.)
        }
        finish();
        return;
      }

      const authToken = await getAuthToken(session);
      if (authToken) {
        const remoteEvents = await fetchEventsFromApi(authToken);
        if (remoteEvents !== null) {
          if (remoteEvents.length === 0) {
            const seededEvents = buildSeedEvents();
            await saveEventsToApi(seededEvents, authToken);
            if (isMounted) setEvents(seededEvents);
          } else if (isMounted) {
            setEvents(remoteEvents);
          }
          finish();
          return;
        }
      } else if (isMounted) {
        setEvents([]);
        finish();
        return;
      }

      let storedEvents: string | null = null;

      try {
        storedEvents = window.localStorage.getItem(EVENT_STORAGE_KEY);
      } catch {
        storedEvents = null;
      }

      if (storedEvents) {
        try {
          const parsed = JSON.parse(storedEvents);
          const normalized = normalizeStoredEvents(parsed);
          if (normalized.length > 0) {
            if (isMounted) setEvents(normalized);
            finish();
            return;
          }
        } catch {
          // fall through to defaults
        }
      }

      if (isMounted) setEvents(INITIAL_EVENTS);
      try {
        window.localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(INITIAL_EVENTS));
      } catch {
        // ignore storage failures (private mode, quota, etc.)
      }
      finish();
    };

    void loadEventData();
    return () => {
      isMounted = false;
    };
  }, [authLoading, devUser, session, session?.access_token]);

  useEffect(() => {
    let storedNotifications: string | null = null;

    try {
      storedNotifications = window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    } catch {
      storedNotifications = null;
    }

    if (storedNotifications) {
      try {
        const parsed = JSON.parse(storedNotifications) as Partial<NotificationSettings>;
        setNotificationSettings({
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...parsed
        });
      } catch {
        setNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
      }
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let isMounted = true;
    const loadData = async () => {
      setAssetsLoading(true);
      setAssetsSyncError('');
      const finish = () => {
        if (isMounted) setAssetsLoading(false);
      };

      if (devUser) {
        let storedAssets: string | null = null;
        try {
          storedAssets = window.localStorage.getItem(STORAGE_KEY);
        } catch {
          storedAssets = null;
        }

        if (storedAssets) {
          try {
            const parsed = JSON.parse(storedAssets);
            const normalized = normalizeStoredAssets(parsed);
            if (normalized.length > 0) {
              if (isMounted) setAssets(normalized);
              finish();
              return;
            }
          } catch {
            // fall through to regenerate
          }
        }

        const initial = generateMockAssets();
        if (isMounted) setAssets(initial);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        } catch {
          // ignore storage failures (private mode, quota, etc.)
        }
        finish();
        return;
      }

      const authToken = await getAuthToken(session);
      if (authToken) {
        const remoteAssets = await fetchAssetsFromApi(authToken);
        if (remoteAssets !== null) {
          if (isMounted) setAssets(remoteAssets);
          finish();
          return;
        }
        if (isMounted) setAssetsSyncError('Unable to load team assets. Showing local cache.');
      } else if (isMounted) {
        setAssets([]);
        finish();
        return;
      }

      let storedAssets: string | null = null;
      try {
        storedAssets = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        storedAssets = null;
      }

      if (storedAssets) {
        try {
          const parsed = JSON.parse(storedAssets);
          const normalized = normalizeStoredAssets(parsed);
          if (normalized.length > 0) {
            if (isMounted) setAssets(normalized);
            finish();
            return;
          }
        } catch {
          // fall through to regenerate
        }
      }

      const initial = generateMockAssets();
      if (isMounted) setAssets(initial);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      } catch {
        // ignore storage failures (private mode, quota, etc.)
      }
      finish();
    };

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [authLoading, devUser, session, session?.access_token]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
    } catch (error) {
      console.log('Storage save skipped:', error);
    }
  }, [assets]);

  useEffect(() => {
    if (activityLogs.length > 0) {
      try {
        window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(activityLogs));
      } catch (error) {
        console.log('Activity storage save skipped:', error);
      }
    }
  }, [activityLogs]);

  useEffect(() => {
    try {
      window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notificationSettings));
    } catch (error) {
      console.log('Notification storage save skipped:', error);
    }
  }, [notificationSettings]);

  useEffect(() => {
    if (events.length > 0) {
      try {
        window.localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(events));
      } catch (error) {
        console.log('Event storage save skipped:', error);
      }
    }
  }, [events]);

  useEffect(() => {
    if (authLoading) return;
    let isMounted = true;
    const loadTextData = async () => {
      setTextLoading(true);
      setTextSyncError('');
      const finish = () => {
        if (isMounted) setTextLoading(false);
      };

      if (devUser) {
        let storedGroups: string | null = null;
        let storedSections: string | null = null;
        let storedTexts: string | null = null;

        try {
          storedGroups = window.localStorage.getItem(TEXT_GROUPS_STORAGE_KEY);
          storedSections = window.localStorage.getItem(TEXT_SECTIONS_STORAGE_KEY);
          storedTexts = window.localStorage.getItem(TEXT_STORAGE_KEY);
        } catch {
          storedGroups = null;
          storedSections = null;
          storedTexts = null;
        }

        let groups: TextGroup[] = [];
        let sections: TextSection[] = [];
        let items: TextItem[] = [];

        if (storedGroups) {
          try {
            const parsed = JSON.parse(storedGroups);
            groups = normalizeStoredTextGroups(parsed);
          } catch {
            groups = [];
          }
        }

        if (storedSections) {
          try {
            const parsed = JSON.parse(storedSections);
            sections = normalizeStoredTextSections(parsed);
          } catch {
            sections = [];
          }
        }

        if (storedTexts) {
          try {
            const parsed = JSON.parse(storedTexts);
            items = normalizeStoredTextItems(parsed);
          } catch {
            items = [];
          }
        }

        if (groups.length === 0) {
          groups = generateMockTextGroups();
          try {
            window.localStorage.setItem(TEXT_GROUPS_STORAGE_KEY, JSON.stringify(groups));
          } catch {
            // ignore storage failures (private mode, quota, etc.)
          }
        }

        if (sections.length === 0) {
          sections = generateMockTextSections(groups);
          try {
            window.localStorage.setItem(TEXT_SECTIONS_STORAGE_KEY, JSON.stringify(sections));
          } catch {
            // ignore storage failures (private mode, quota, etc.)
          }
        }

        if (items.length === 0) {
          items = generateMockTextItems(groups, sections);
          try {
            window.localStorage.setItem(TEXT_STORAGE_KEY, JSON.stringify(items));
          } catch {
            // ignore storage failures (private mode, quota, etc.)
          }
        }

        if (isMounted) {
          setTextGroups(groups);
          setTextSections(sections);
          setTextItems(items);
        }
        finish();
        return;
      }

      const authToken = await getAuthToken(session);
      if (authToken) {
        const [groups, sections, items] = await Promise.all([
          fetchTextGroupsFromApi(authToken),
          fetchTextSectionsFromApi(authToken),
          fetchTextItemsFromApi(authToken)
        ]);
        if (groups && sections && items) {
          if (isMounted) {
            setTextGroups(groups);
            setTextSections(sections);
            setTextItems(items);
          }
          finish();
          return;
        }
        if (isMounted) {
          setTextSyncError('Unable to load team text items. Please refresh.');
        }
        finish();
        return;
      } else if (isMounted) {
        setTextGroups([]);
        setTextSections([]);
        setTextItems([]);
        finish();
        return;
      }

      let storedGroups: string | null = null;
      let storedSections: string | null = null;
      let storedTexts: string | null = null;

      try {
        storedGroups = window.localStorage.getItem(TEXT_GROUPS_STORAGE_KEY);
        storedSections = window.localStorage.getItem(TEXT_SECTIONS_STORAGE_KEY);
        storedTexts = window.localStorage.getItem(TEXT_STORAGE_KEY);
      } catch {
        storedGroups = null;
        storedSections = null;
        storedTexts = null;
      }

      let groups: TextGroup[] = [];
      let sections: TextSection[] = [];
      let items: TextItem[] = [];

      if (storedGroups) {
        try {
          const parsed = JSON.parse(storedGroups);
          groups = normalizeStoredTextGroups(parsed);
        } catch {
          groups = [];
        }
      }

      if (storedSections) {
        try {
          const parsed = JSON.parse(storedSections);
          sections = normalizeStoredTextSections(parsed);
        } catch {
          sections = [];
        }
      }

      if (storedTexts) {
        try {
          const parsed = JSON.parse(storedTexts);
          items = normalizeStoredTextItems(parsed);
        } catch {
          items = [];
        }
      }

      if (groups.length === 0 || sections.length === 0 || items.length === 0) {
        groups = groups.length > 0 ? groups : generateMockTextGroups();
        sections = sections.length > 0 ? sections : generateMockTextSections(groups);
        items = items.length > 0 ? items : generateMockTextItems(groups, sections);
      }

      if (isMounted) {
        setTextGroups(groups);
        setTextSections(sections);
        setTextItems(items);
      }
      finish();
    };

    void loadTextData();
    return () => {
      isMounted = false;
    };
  }, [authLoading, devUser, session, session?.access_token]);

  useEffect(() => {
    if (textItems.length > 0) {
      try {
        window.localStorage.setItem(TEXT_STORAGE_KEY, JSON.stringify(textItems));
      } catch (error) {
        console.log('Text storage save skipped:', error);
      }
    }
  }, [textItems]);

  useEffect(() => {
    if (authLoading) return;
    let isMounted = true;
    const loadActivity = async () => {
      setActivityLoading(true);
      const finish = () => {
        if (isMounted) setActivityLoading(false);
      };

      if (devUser) {
        let storedActivity: string | null = null;
        try {
          storedActivity = window.localStorage.getItem(ACTIVITY_STORAGE_KEY);
        } catch {
          storedActivity = null;
        }
        if (storedActivity) {
          try {
            const parsed = JSON.parse(storedActivity);
            if (isMounted) setActivityLogs(normalizeStoredActivity(parsed));
          } catch {
            if (isMounted) setActivityLogs([]);
          }
        } else if (isMounted) {
          setActivityLogs([]);
        }
        finish();
        return;
      }

      const authToken = await getAuthToken(session);
      if (authToken) {
        const remoteActivity = await fetchActivityFromApi(authToken);
        if (remoteActivity !== null) {
          if (isMounted) setActivityLogs(remoteActivity);
          finish();
          return;
        }
      } else if (isMounted) {
        setActivityLogs([]);
        finish();
        return;
      }

      let storedActivity: string | null = null;
      try {
        storedActivity = window.localStorage.getItem(ACTIVITY_STORAGE_KEY);
      } catch {
        storedActivity = null;
      }
      if (storedActivity) {
        try {
          const parsed = JSON.parse(storedActivity);
          if (isMounted) setActivityLogs(normalizeStoredActivity(parsed));
        } catch {
          if (isMounted) setActivityLogs([]);
        }
      } else if (isMounted) {
        setActivityLogs([]);
      }
      finish();
    };

    void loadActivity();
    return () => {
      isMounted = false;
    };
  }, [authLoading, devUser, session, session?.access_token]);

  useEffect(() => {
    if (textGroups.length > 0) {
      try {
        window.localStorage.setItem(TEXT_GROUPS_STORAGE_KEY, JSON.stringify(textGroups));
      } catch (error) {
        console.log('Text groups storage save skipped:', error);
      }
    }
  }, [textGroups]);

  useEffect(() => {
    if (textSections.length > 0) {
      try {
        window.localStorage.setItem(TEXT_SECTIONS_STORAGE_KEY, JSON.stringify(textSections));
      } catch (error) {
        console.log('Text sections storage save skipped:', error);
      }
    }
  }, [textSections]);

  const stats = useMemo(() => ({
    toReview: assets.filter(asset => asset.status === 'TO_REVIEW').length,
    approved: assets.filter(asset => asset.status === 'APPROVED').length,
    hold: assets.filter(asset => asset.status === 'HOLD').length,
    rejected: assets.filter(asset => asset.status === 'REJECTED').length
  }), [assets]);

  const textStats = useMemo(() => ({
    toReview: textItems.filter(item => item.status === 'TO_REVIEW').length,
    approved: textItems.filter(item => item.status === 'APPROVED').length,
    hold: textItems.filter(item => item.status === 'HOLD').length,
    rejected: textItems.filter(item => item.status === 'REJECTED').length
  }), [textItems]);

  const textCategoryOptions = useMemo(() => {
    const categories = new Set(TEXT_CATEGORIES);
    textItems.forEach(item => {
      if (item.category) categories.add(item.category);
    });
    return Array.from(categories);
  }, [textItems]);
  const textTagPresets = useMemo(() => ['funny', 'general'], []);

  const sortedTextGroups = useMemo(() => (
    [...textGroups].sort((a, b) => a.name.localeCompare(b.name))
  ), [textGroups]);

  const bulkImportCount = useMemo(
    () => splitBulkImportEntries(bulkImportDraft.text).length,
    [bulkImportDraft.text]
  );

  const isDevMode = process.env.NODE_ENV !== 'production';
  const activeUser = devUser ?? session?.user ?? null;
  const allTonesSelected = newAsset.skinTones.length === SKIN_TONES.length;

  const actorLabel = useMemo(() => {
    const sessionUser = activeUser;
    if (sessionUser?.email) return sessionUser.email;
    return currentRole === 'reviewer' ? 'Reviewer' : 'Creator';
  }, [currentRole, activeUser]);
  const authCooldownLabel = useMemo(() => formatCountdown(authCooldown), [authCooldown]);
  const authCooldownRatio = useMemo(() => (
    authCooldown > 0 ? authCooldown / AUTH_RESEND_SECONDS : 0
  ), [authCooldown]);
  const dataLoading = assetsLoading || eventsLoading || textLoading || activityLoading;
  const parsedTextDraftTags = useMemo(() => (
    textDraft.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)
  ), [textDraft.tags]);

  const eventLookup = useMemo(() => new Map(events.map(event => [event.id, event])), [events]);
  const toneLookup = useMemo(() => new Map(SKIN_TONES.map(tone => [tone.id, tone])), []);
  const getToneMeta = (toneId: SkinTone) => {
    const tone = toneLookup.get(toneId);
    if (tone) return tone;
    if (toneId === ALL_TONE_ID) {
      return { id: ALL_TONE_ID, name: 'All tones', color: '#94a3b8' };
    }
    return { id: toneId, name: 'Tone', color: '#94a3b8' };
  };
  const textGroupLookup = useMemo(
    () => new Map(textGroups.map(group => [group.id, group])),
    [textGroups]
  );
  const textSectionLookup = useMemo(
    () => new Map(textSections.map(section => [section.id, section])),
    [textSections]
  );
  const textSectionsByGroup = useMemo(() => {
    const map = new Map<string, TextSection[]>();
    textSections.forEach(section => {
      const existing = map.get(section.groupId) ?? [];
      existing.push(section);
      map.set(section.groupId, existing);
    });
    map.forEach((sections, groupId) => {
      map.set(groupId, [...sections].sort((a, b) => a.name.localeCompare(b.name)));
    });
    return map;
  }, [textSections]);
  const sortedTextSections = useMemo(() => (
    [...textSections].sort((a, b) => a.name.localeCompare(b.name))
  ), [textSections]);
  const filterSectionOptions = useMemo(() => {
    if (textFilters.groupId === UNASSIGNED_GROUP_ID) return [];
    if (textFilters.groupId) {
      return textSectionsByGroup.get(textFilters.groupId) ?? [];
    }
    return sortedTextSections;
  }, [textFilters.groupId, textSectionsByGroup, sortedTextSections]);
  const selectedEvent = useMemo(
    () => (selectedEventId ? eventLookup.get(selectedEventId) ?? null : null),
    [eventLookup, selectedEventId]
  );
  const eventAssets = useMemo(
    () => (selectedEventId ? assets.filter(asset => asset.eventId === selectedEventId) : []),
    [assets, selectedEventId]
  );
  const eventStatusCounts = useMemo(() => {
    const counts: Record<AssetStatus, number> = {
      TO_REVIEW: 0,
      APPROVED: 0,
      HOLD: 0,
      REJECTED: 0
    };
    eventAssets.forEach(asset => {
      counts[asset.status] += 1;
    });
    return counts;
  }, [eventAssets]);
  const filteredEventAssets = useMemo(() => {
    const list = eventStatusFilter
      ? eventAssets.filter(asset => asset.status === eventStatusFilter)
      : eventAssets;

    return [...list].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [eventAssets, eventStatusFilter]);
  const approvedEventAssets = useMemo(
    () => eventAssets.filter(asset => asset.status === 'APPROVED' && asset.mediaUrl),
    [eventAssets]
  );
  const selectedDraftGroup = useMemo(
    () => (textDraft.groupId ? textGroupLookup.get(textDraft.groupId) ?? null : null),
    [textDraft.groupId, textGroupLookup]
  );
  const selectedDraftSection = useMemo(
    () => (textDraft.sectionId ? textSectionLookup.get(textDraft.sectionId) ?? null : null),
    [textDraft.sectionId, textSectionLookup]
  );
  const draftGroupSections = useMemo(() => (
    textDraft.groupId ? textSectionsByGroup.get(textDraft.groupId) ?? [] : []
  ), [textDraft.groupId, textSectionsByGroup]);
  const bulkGroupSections = useMemo(() => (
    bulkImportDraft.groupId ? textSectionsByGroup.get(bulkImportDraft.groupId) ?? [] : []
  ), [bulkImportDraft.groupId, textSectionsByGroup]);

  const textGroupStatsById = useMemo(() => {
    const counts = new Map<string, { total: number; statuses: Record<AssetStatus, number> }>();
    textItems.forEach(item => {
      const groupId = item.groupId ?? '';
      if (!groupId) return;
      const entry = counts.get(groupId) ?? {
        total: 0,
        statuses: { TO_REVIEW: 0, APPROVED: 0, HOLD: 0, REJECTED: 0 }
      };
      entry.total += 1;
      entry.statuses[item.status] += 1;
      counts.set(groupId, entry);
    });
    return counts;
  }, [textItems]);

  const textSectionStatsById = useMemo(() => {
    const counts = new Map<string, { total: number; statuses: Record<AssetStatus, number> }>();
    textItems.forEach(item => {
      if (!item.sectionId) return;
      const entry = counts.get(item.sectionId) ?? {
        total: 0,
        statuses: { TO_REVIEW: 0, APPROVED: 0, HOLD: 0, REJECTED: 0 }
      };
      entry.total += 1;
      entry.statuses[item.status] += 1;
      counts.set(item.sectionId, entry);
    });
    return counts;
  }, [textItems]);

  const textGroupsByEvent = useMemo(() => {
    const map = new Map<string, TextGroup[]>();
    textGroups.forEach(group => {
      if (!group.eventId) return;
      const existing = map.get(group.eventId) ?? [];
      existing.push(group);
      map.set(group.eventId, existing);
    });
    return map;
  }, [textGroups]);

  const selectedEventTextGroups = useMemo(() => {
    if (!selectedEventId) return [];
    return textGroupsByEvent.get(selectedEventId) ?? [];
  }, [selectedEventId, textGroupsByEvent]);

  const selectedViewerGroup = useMemo(() => {
    if (!selectedTextGroupId) return null;
    if (selectedTextGroupId === UNASSIGNED_GROUP_ID) {
      return {
        id: UNASSIGNED_GROUP_ID,
        name: 'Unassigned',
        description: 'Text items not linked to a group yet.',
        eventId: null,
        createdAt: '',
        updatedAt: ''
      } satisfies TextGroup;
    }
    return textGroupLookup.get(selectedTextGroupId) ?? null;
  }, [selectedTextGroupId, textGroupLookup]);

  const groupViewerItems = useMemo(() => {
    if (!selectedTextGroupId) return [];
    if (selectedTextGroupId === UNASSIGNED_GROUP_ID) {
      return textItems.filter(item => !item.groupId);
    }
    return textItems.filter(item => item.groupId === selectedTextGroupId);
  }, [selectedTextGroupId, textItems]);

  const groupViewerSections = useMemo(() => {
    if (!selectedTextGroupId || selectedTextGroupId === UNASSIGNED_GROUP_ID) return [];
    return textSectionsByGroup.get(selectedTextGroupId) ?? [];
  }, [selectedTextGroupId, textSectionsByGroup]);

  const groupViewerUnassignedSectionCount = useMemo(
    () => groupViewerItems.filter(item => !item.sectionId).length,
    [groupViewerItems]
  );

  const groupViewerStatusCounts = useMemo(() => {
    const counts: Record<AssetStatus, number> = {
      TO_REVIEW: 0,
      APPROVED: 0,
      HOLD: 0,
      REJECTED: 0
    };
    groupViewerItems.forEach(item => {
      counts[item.status] += 1;
    });
    return counts;
  }, [groupViewerItems]);

  const filteredGroupViewerItems = useMemo(() => {
    const query = textGroupViewerQuery.trim().toLowerCase();
    const list = groupViewerItems.filter(item => {
      if (textGroupViewerStatus && item.status !== textGroupViewerStatus) return false;
      if (textGroupViewerSectionId) {
        if (textGroupViewerSectionId === UNASSIGNED_SECTION_ID) {
          if (item.sectionId) return false;
        } else if (item.sectionId !== textGroupViewerSectionId) {
          return false;
        }
      }
      if (!query) return true;
      const haystack = [
        item.title,
        item.body,
        item.category,
        item.tags.join(' ')
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });

    return [...list].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [groupViewerItems, textGroupViewerQuery, textGroupViewerStatus, textGroupViewerSectionId]);

  const groupedViewerItems = useMemo(() => {
    const map = new Map<string, TextItem[]>();
    filteredGroupViewerItems.forEach(item => {
      const key = item.sectionId ?? UNASSIGNED_SECTION_ID;
      const existing = map.get(key) ?? [];
      existing.push(item);
      map.set(key, existing);
    });
    return map;
  }, [filteredGroupViewerItems]);

  const buildDownloadName = (asset: UiAsset, eventName?: string) => {
    const nameSegments = [
      eventName ?? eventLookup.get(asset.eventId)?.name ?? 'event',
      getToneMeta(asset.skinTone).name,
      asset.title || 'asset'
    ];
    const safeBase = sanitizeFileName(nameSegments.join(' ')) || asset.id;
    const extension = asset.mediaType === 'video/mp4'
      ? 'mp4'
      : asset.mediaType === 'image/gif'
      ? 'gif'
      : 'bin';
    return `${safeBase}.${extension}`;
  };

  const downloadAssetMedia = async (asset: UiAsset, fileName: string) => {
    if (!asset.mediaUrl) return;
    try {
      const response = await fetch(asset.mediaUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.log('Download failed, using direct link.', error);
      const anchor = document.createElement('a');
      anchor.href = asset.mediaUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  };

  const handleDownloadApproved = async () => {
    if (!selectedEvent || approvedEventAssets.length === 0) return;

    setDownloadState({ total: approvedEventAssets.length, current: 0 });
    for (let i = 0; i < approvedEventAssets.length; i += 1) {
      const asset = approvedEventAssets[i];
      const filename = buildDownloadName(asset, selectedEvent.name);
      await downloadAssetMedia(asset, filename);
      setDownloadState({ total: approvedEventAssets.length, current: i + 1 });
      await delay(200);
    }
    await delay(400);
    setDownloadState(null);
  };

  useEffect(() => {
    if (currentView === 'asset-detail' && !selectedAsset) {
      setCurrentView('queue');
    }
  }, [currentView, selectedAsset]);

  useEffect(() => {
    if (!eventModalOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEventModalOpen(false);
        setEventModalExpanded(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [eventModalOpen]);

  useEffect(() => {
    if (!textGroupViewerOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTextGroupViewer();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [textGroupViewerOpen]);

  const openEventModal = (eventId: string) => {
    setSelectedEventId(eventId);
    setEventStatusFilter('');
    setEventModalExpanded(false);
    setEventModalOpen(true);
  };

  const closeEventModal = () => {
    setEventModalOpen(false);
    setEventModalExpanded(false);
    setSelectedEventId(null);
  };

  const openTextGroupView = (groupId?: string, eventId?: string) => {
    setCurrentView('text-signoff');
    setTextFilters(prev => ({
      ...prev,
      groupId: groupId ?? '',
      eventId: eventId ?? '',
      sectionId: ''
    }));
    closeEventModal();
    closeTextGroupViewer();
  };

  const startUploadForEvent = (eventId: string) => {
    setNewAsset(prev => ({ ...prev, eventId }));
    setBatchUploadMode(true);
    setUploadModal(true);
    setEventModalOpen(false);
    setEventModalExpanded(false);
  };

  const handleUpload = async () => {
    if (uploadLockRef.current) return;
    if (!newAsset.eventId || newAsset.files.length === 0) return;

    const effectiveSkinTones = newAsset.skinTones.length > 0
      ? newAsset.skinTones
      : (batchUploadMode ? [ALL_TONE_ID] : []);
    if (effectiveSkinTones.length === 0) return;

    const allowedFiles = newAsset.files
      .filter(file => file.type === 'image/gif' || file.type === 'video/mp4')
      .slice(0, singleUploadMode ? 1 : undefined);
    const skipped = newAsset.files.length - allowedFiles.length;

    if (allowedFiles.length === 0) {
      alert('Please upload GIF or MP4 files only.');
      return;
    }
    if (skipped > 0) {
      alert(`Skipped ${skipped} file(s) that were not GIF or MP4.`);
    }

    const authToken = await getAuthToken(session);
    if (!R2_PUBLIC_BASE_URL || !authToken) {
      alert('Cloud storage is required for team uploads. Please sign in and configure R2 before uploading.');
      return;
    }

    uploadLockRef.current = true;
    setIsUploading(true);
    try {
      const createdAt = new Date().toISOString();
      const actor = actorLabel;
      const selectedTones = [...effectiveSkinTones];

      const assetsToAdd: UiAsset[] = [];
      let uploadFailures = 0;

      for (let fileIndex = 0; fileIndex < allowedFiles.length; fileIndex += 1) {
        const file = allowedFiles[fileIndex];
        let mediaUrl = '';
        try {
          mediaUrl = await uploadFileToR2(file, newAsset.eventId, authToken);
        } catch (error) {
          uploadFailures += 1;
          console.log('Remote upload failed, skipping file.', error);
          continue;
        }

        for (const toneId of selectedTones) {
          const mediaStorage: 'inline' | 'object' = 'object';
          const titleBase = newAsset.title?.trim();
          const tone = getToneMeta(toneId);
          const toneLabel = selectedTones.length > 1 && toneId !== ALL_TONE_ID ? ` - ${tone.name}` : '';
          const titleSuffix = allowedFiles.length > 1 ? `#${fileIndex + 1}` : '';
          const title = titleBase
            ? `${titleBase} ${titleSuffix}`.trim() + toneLabel
            : `${file.name.replace(/\\.[^/.]+$/, '') || 'New Asset'}${toneLabel}`;

          assetsToAdd.push({
            id: buildAssetId(),
            title,
            eventId: newAsset.eventId,
            skinTone: toneId,
            status: 'TO_REVIEW',
            uploader: actor,
            reviewer: null,
            createdAt,
            version: 1,
            notesRefinement: '',
            notesIdeas: '',
            previewColor: tone.color ?? '#ccc',
            mediaUrl,
            mediaType: file.type,
            mediaStorage,
            fileName: file.name,
            fileSize: file.size
          });
        }
      }

      if (assetsToAdd.length === 0) {
        alert('Upload failed. No files were saved to cloud storage.');
        return;
      }

      if (uploadFailures > 0) {
        alert(`Uploaded ${assetsToAdd.length} assets. ${uploadFailures} file(s) failed to upload to cloud storage.`);
      }

      setAssets(prev => [...assetsToAdd, ...prev]);
      const saved = await saveAssetsToApi(assetsToAdd, authToken);
      if (!saved) {
        alert('Assets saved locally but could not sync to the team feed.');
      }

      const activityEntries = assetsToAdd.map(asset => buildActivityEntry({
        subjectType: 'asset',
        subjectId: asset.id,
        action: 'CREATED',
        actor,
        toStatus: 'TO_REVIEW'
      }));
      addActivityEntries(activityEntries);
      if (shouldNotifyOnNew()) {
        const eventName = eventLookup.get(newAsset.eventId)?.name ?? 'event';
        const message = `${actor} uploaded ${assetsToAdd.length} new asset(s) for ${eventName}. Status: ${STATUS_LABELS.TO_REVIEW}.`;
        void sendSlackNotification(message);
      }

      setUploadModal(false);
      setBatchUploadMode(false);
      setNewAsset({ title: '', eventId: '', skinTones: [], files: [] });
    } finally {
      uploadLockRef.current = false;
      setIsUploading(false);
    }
  };

  const handleReviewAction = async (assetId: string, action: AssetStatus, notes = '') => {
    const current = assets.find(asset => asset.id === assetId);
    const actor = actorLabel;
    const cleanedNotes = notes.trim();
    const updatedAt = new Date().toISOString();
    setAssets(prev => prev.map(asset => {
      if (asset.id === assetId) {
        return {
          ...asset,
          status: action,
          reviewer: actor,
          notesRefinement: action === 'HOLD' ? cleanedNotes : asset.notesRefinement,
          updatedAt
        };
      }
      return asset;
    }));
    addActivityEntries([
      buildActivityEntry({
        subjectType: 'asset',
        subjectId: assetId,
        action: 'STATUS_CHANGED',
        actor,
        fromStatus: current?.status ?? null,
        toStatus: action,
        comment: cleanedNotes
      })
    ]);
    if (shouldNotifyForStatus(action)) {
      const eventName = current ? eventLookup.get(current.eventId)?.name ?? 'event' : 'event';
      const message = `${actor} set ${current?.title ?? 'an asset'} (${eventName}) to ${STATUS_LABELS[action]}.`;
      void sendSlackNotification(message);
    }
    const authToken = await getAuthToken(session);
    if (authToken && current) {
      const updatedAsset: UiAsset = {
        ...current,
        status: action,
        reviewer: actor,
        notesRefinement: action === 'HOLD' ? cleanedNotes : current.notesRefinement,
        updatedAt
      };
      const synced = await saveAssetsToApi([updatedAsset], authToken);
      if (!synced) {
        alert('Update saved locally but could not sync to the team feed.');
      }
    } else {
      alert('Sign in to sync approvals to the team feed.');
    }
    setSelectedAssetId(null);
  };

  const handleToneUpdate = async (assetId: string, skinTone: SkinTone) => {
    const current = assets.find(asset => asset.id === assetId);
    if (!current) return;
    const tone = getToneMeta(skinTone);
    const updatedAt = new Date().toISOString();
    const updatedAsset: UiAsset = {
      ...current,
      skinTone,
      previewColor: tone.color ?? current.previewColor,
      updatedAt
    };

    setAssets(prev => prev.map(asset => (asset.id === assetId ? updatedAsset : asset)));
    const authToken = await getAuthToken(session);
    if (authToken) {
      const synced = await saveAssetsToApi([updatedAsset], authToken);
      if (!synced) {
        alert('Update saved locally but could not sync to the team feed.');
      }
    } else {
      alert('Sign in to sync tone updates to the team feed.');
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (deletingAssetId) return;
    const asset = assets.find(item => item.id === assetId);
    if (!asset) return;
    const confirmed = window.confirm(`Delete "${asset.title}"? This removes it for everyone.`);
    if (!confirmed) return;

    setDeletingAssetId(assetId);
    setAssets(prev => prev.filter(item => item.id !== assetId));
    setActivityLogs(prev => prev.filter(entry => !(entry.subjectType === 'asset' && entry.subjectId === assetId)));
    setSelectedAssetId(null);
    setCurrentView('queue');

    try {
      const authToken = await getAuthToken(session);
      if (authToken) {
        const deleted = await deleteAssetFromApi(assetId, authToken);
        if (!deleted) {
          alert('Deleted locally but could not sync to the team feed.');
        }
      } else {
        alert('Sign in to delete assets from the team feed.');
      }
    } finally {
      setDeletingAssetId(null);
    }
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds(prev => (
      prev.includes(assetId) ? prev.filter(id => id !== assetId) : [...prev, assetId]
    ));
  };

  const handleSelectAllAssets = () => {
    const allIds = filteredAssets.map(asset => asset.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedAssetIds.includes(id));
    setSelectedAssetIds(allSelected ? [] : allIds);
  };

  const handleBatchDeleteAssets = async () => {
    if (batchDeletingAssets || selectedAssetIds.length === 0) return;
    const confirmed = window.confirm(`Delete ${selectedAssetIds.length} assets? This removes them for everyone.`);
    if (!confirmed) return;

    setBatchDeletingAssets(true);
    const idsToDelete = new Set(selectedAssetIds);
    setAssets(prev => prev.filter(asset => !idsToDelete.has(asset.id)));
    setActivityLogs(prev => prev.filter(entry => !(entry.subjectType === 'asset' && idsToDelete.has(entry.subjectId))));
    setSelectedAssetIds([]);

    const authToken = await getAuthToken(session);
    if (authToken) {
      const results = await Promise.all(selectedAssetIds.map(id => deleteAssetFromApi(id, authToken)));
      if (results.some(result => !result)) {
        alert('Some assets were removed locally but failed to sync to the team feed.');
      }
    } else {
      alert('Sign in to delete assets from the team feed.');
    }

    setBatchDeletingAssets(false);
  };

  const buildTextDraft = (item?: TextItem) => ({
    title: item?.title ?? '',
    body: item?.body ?? '',
    category: item?.category ?? '',
    tags: item?.tags?.join(', ') ?? '',
    status: item?.status ?? 'TO_REVIEW',
    reviewNotes: item?.reviewNotes ?? '',
    groupId: item?.groupId ?? '',
    sectionId: item?.sectionId ?? ''
  });

  const openTextEditor = (item?: TextItem, presetGroupId?: string, presetSectionId?: string) => {
    setEditingTextId(item?.id ?? null);
    const draft = buildTextDraft(item);
    const resolvedGroupId = item?.groupId ?? presetGroupId ?? draft.groupId;
    const resolvedSectionId = item?.sectionId ?? presetSectionId ?? draft.sectionId;
    const resolvedSection = resolvedSectionId ? textSectionLookup.get(resolvedSectionId) : null;
    const safeSectionId = resolvedSection && resolvedSection.groupId === resolvedGroupId
      ? resolvedSection.id
      : '';
    setTextDraft({
      ...draft,
      groupId: resolvedGroupId,
      sectionId: safeSectionId
    });
    setTextModalOpen(true);
  };

  const closeTextEditor = () => {
    setTextModalOpen(false);
    setEditingTextId(null);
    setTextDraft(buildTextDraft());
  };

  const buildGroupDraft = (group?: TextGroup, presetEventId?: string) => ({
    name: group?.name ?? '',
    description: group?.description ?? '',
    eventId: group?.eventId ?? presetEventId ?? ''
  });

  const openGroupEditor = (group?: TextGroup, presetEventId?: string) => {
    setEditingGroupId(group?.id ?? null);
    setGroupDraft(buildGroupDraft(group, presetEventId));
    setGroupModalOpen(true);
  };

  const closeGroupEditor = () => {
    setGroupModalOpen(false);
    setEditingGroupId(null);
    setGroupDraft(buildGroupDraft());
  };

  const buildSectionDraft = (section?: TextSection, presetGroupId?: string) => ({
    name: section?.name ?? '',
    description: section?.description ?? '',
    groupId: section?.groupId ?? presetGroupId ?? ''
  });

  const openSectionEditor = (section?: TextSection, presetGroupId?: string) => {
    setEditingSectionId(section?.id ?? null);
    setSectionDraft(buildSectionDraft(section, presetGroupId));
    setSectionModalOpen(true);
  };

  const closeSectionEditor = () => {
    setSectionModalOpen(false);
    setEditingSectionId(null);
    setSectionDraft(buildSectionDraft());
  };

  const buildEventDraft = (event?: EventRecord) => ({
    name: event?.name ?? '',
    startDate: event?.startDate ?? '',
    endDate: event?.endDate ?? '',
    totalTarget: event?.totalTarget?.toString() ?? '',
    perToneTarget: event?.perToneTarget?.toString() ?? '',
    tier: event?.tier?.toString() ?? '',
    description: event?.description ?? ''
  });

  const openEventEditor = (event?: EventRecord) => {
    setEditingEventId(event?.id ?? null);
    setEventDraft(buildEventDraft(event));
    setEventEditorOpen(true);
  };

  const closeEventEditor = () => {
    setEventEditorOpen(false);
    setEditingEventId(null);
    setEventDraft(buildEventDraft());
  };

  const handleAuthModeChange = (mode: 'magic' | 'password') => {
    setAuthMode(mode);
    if (mode === 'magic') {
      setLoginPassword('');
    }
    setAuthError('');
    setAuthMessage('');
  };

  const toggleTextDraftTag = (tag: string) => {
    setTextDraft(prev => {
      const normalized = normalizeTagValue(tag);
      const currentTags = prev.tags
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
      const exists = currentTags.some(entry => normalizeTagValue(entry) === normalized);
      const nextTags = exists
        ? currentTags.filter(entry => normalizeTagValue(entry) !== normalized)
        : [...currentTags, tag];
      return { ...prev, tags: nextTags.join(', ') };
    });
  };

  const toggleBulkTag = (tag: string) => {
    setBulkImportDraft(prev => {
      const normalized = normalizeTagValue(tag);
      const currentTags = prev.tags
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
      const exists = currentTags.some(entry => normalizeTagValue(entry) === normalized);
      const nextTags = exists
        ? currentTags.filter(entry => normalizeTagValue(entry) !== normalized)
        : [...currentTags, tag];
      return { ...prev, tags: nextTags.join(', ') };
    });
  };

  const handleMagicSignIn = async () => {
    const email = loginEmail.trim();
    if (!email) {
      setAuthError('Enter your email to continue.');
      return;
    }
    if (authCooldown > 0) {
      setAuthError(`Please wait ${formatCountdown(authCooldown)} before resending.`);
      return;
    }
    setAuthError('');
    setAuthMessage('');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          shouldCreateUser: false
        }
      });
      if (error) {
        setAuthError(formatAuthError(error.message));
        return;
      }
      setAuthMessage('Magic link sent. Check your inbox.');
      setAuthCooldown(AUTH_RESEND_SECONDS);
    } catch (error) {
      console.log('Auth sign-in failed:', error);
      setAuthError('Unable to send magic link. Try again.');
    }
  };

  const handlePasswordSignIn = async () => {
    const email = loginEmail.trim();
    if (!email || !loginPassword.trim()) {
      setAuthError('Enter your email and password to continue.');
      return;
    }
    setAuthError('');
    setAuthMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: loginPassword
      });
      if (error) {
        setAuthError(formatAuthError(error.message));
        return;
      }
      setAuthMessage('Signed in successfully.');
    } catch (error) {
      console.log('Password sign-in failed:', error);
      setAuthError('Unable to sign in. Check your credentials and try again.');
    }
  };

  const handleDevAccess = () => {
    if (!isDevMode) return;
    const email = loginEmail.trim() || 'dev@local.test';
    setDevUser({ email, user_metadata: { full_name: 'Local Dev' } });
    setAuthError('');
    setAuthMessage('');
  };

  const handleSignOut = async () => {
    if (devUser) {
      setDevUser(null);
      return;
    }
    try {
      await supabase.auth.signOut();
      setSession(null);
    } catch (error) {
      console.log('Sign out failed:', error);
    }
  };

  const addActivityEntries = (entries: ActivityEntry[]) => {
    if (entries.length === 0) return;
    setActivityLogs(prev => [...entries, ...prev]);
    if (devUser) return;
    void (async () => {
      const authToken = await getAuthToken(session);
      if (!authToken) return;
      const synced = await saveActivityEntriesToApi(entries, authToken);
      if (!synced) {
        console.log('Activity sync failed.');
      }
    })();
  };

  const buildActivityEntry = (entry: Omit<ActivityEntry, 'id' | 'timestamp'>): ActivityEntry => ({
    ...entry,
    id: buildId('activity'),
    timestamp: new Date().toISOString()
  });

  const shouldNotifyForStatus = (status: AssetStatus) => {
    if (!notificationSettings.enabled) return false;
    if (!notificationSettings.slackWebhookUrl.trim()) return false;
    if (status === 'APPROVED') return notificationSettings.notifyOnApproved;
    if (status === 'HOLD') return notificationSettings.notifyOnHold;
    if (status === 'REJECTED') return notificationSettings.notifyOnRejected;
    return false;
  };

  const shouldNotifyOnNew = () => (
    notificationSettings.enabled
    && notificationSettings.slackWebhookUrl.trim().length > 0
    && notificationSettings.notifyOnNew
  );

  const sendSlackNotification = async (message: string) => {
    if (!notificationSettings.enabled) {
      return { ok: false, error: 'Notifications are disabled.' } as const;
    }
    const webhook = notificationSettings.slackWebhookUrl.trim();
    if (!webhook) {
      return { ok: false, error: 'Missing Slack webhook URL.' } as const;
    }
    if (!isLikelySlackWebhook(webhook)) {
      return {
        ok: false,
        error: 'Use an Incoming Webhook URL (https://hooks.slack.com/services/...)'
      } as const;
    }
    try {
      const authToken = await getAuthToken(session);
      if (!authToken) {
        console.log('Slack notification skipped: missing auth token.');
        return { ok: false, error: 'Missing auth token. Sign in again and retry.' } as const;
      }
      const response = await fetch('/api/notifications/slack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          message,
          webhookUrl: webhook
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        console.log('Slack notification failed:', payload?.error ?? response.statusText);
        return { ok: false, error: payload?.error ?? 'Slack request failed.' } as const;
      }
      return { ok: true } as const;
    } catch (error) {
      console.log('Slack notification failed:', error);
      return { ok: false, error: 'Unable to reach Slack. Please try again.' } as const;
    }
  };

  const handleSlackTest = async () => {
    if (isTestingSlack) return;
    setIsTestingSlack(true);
    try {
      const timestamp = new Date().toLocaleString('en-US');
      const result = await sendSlackNotification(`Test notification from Gif You Signoff (${timestamp}).`);
      if (!result.ok) {
        alert(`Slack test failed: ${result.error}`);
        return;
      }
      alert('Slack test sent. If nothing appears, re-check your webhook URL.');
    } finally {
      setIsTestingSlack(false);
    }
  };

  const buildBulkImportDraft = (presetGroupId?: string, presetSectionId?: string) => ({
    text: '',
    category: '',
    tags: '',
    status: 'TO_REVIEW' as AssetStatus,
    reviewNotes: '',
    groupId: presetGroupId ?? '',
    sectionId: presetSectionId ?? ''
  });

  const openBulkImport = (presetGroupId?: string, presetSectionId?: string) => {
    setBulkImportDraft(buildBulkImportDraft(presetGroupId, presetSectionId));
    setBulkImportOpen(true);
  };

  const closeBulkImport = () => {
    setBulkImportOpen(false);
    setBulkImportDraft(buildBulkImportDraft());
  };

  const addCommentActivity = (subjectType: ActivitySubject, subjectId: string, comment: string) => {
    const trimmed = comment.trim();
    if (!trimmed) return;
    const entry = buildActivityEntry({
      subjectType,
      subjectId,
      action: 'COMMENT',
      actor: actorLabel,
      comment: trimmed
    });
    addActivityEntries([entry]);
  };

  const openTextGroupViewer = (groupId: string) => {
    setSelectedTextGroupId(groupId);
    setTextGroupViewerStatus('');
    setTextGroupViewerQuery('');
    setTextGroupViewerSectionId('');
    setTextGroupViewerExpanded(false);
    setTextGroupViewerOpen(true);
    closeEventModal();
  };

  const openTextGroupSection = (sectionId: string) => {
    const nextSectionId = textGroupViewerSectionId === sectionId ? '' : sectionId;
    setTextGroupViewerSectionId(nextSectionId);
    if (!nextSectionId || typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      textGroupItemsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const closeTextGroupViewer = () => {
    setSelectedTextGroupId(null);
    setTextGroupViewerStatus('');
    setTextGroupViewerQuery('');
    setTextGroupViewerSectionId('');
    setTextGroupViewerExpanded(false);
    setTextGroupViewerOpen(false);
  };

  const applyTextStatus = (ids: string[], status: AssetStatus, reviewNotes: string) => {
    const now = new Date().toISOString();
    const actor = actorLabel;
    const entries: ActivityEntry[] = [];
    const updatedItems = textItems
      .filter(item => ids.includes(item.id))
      .map(item => ({
        ...item,
        status,
        reviewer: status === 'TO_REVIEW' ? null : actor,
        reviewNotes: status === 'HOLD' || status === 'REJECTED' ? reviewNotes : '',
        updatedAt: now
      }));

    if (updatedItems.length === 0) {
      setTextSyncError('Unable to update text status. Please refresh and try again.');
      return;
    }

    setTextItems(prev => prev.map(item => {
      if (!ids.includes(item.id)) return item;

      entries.push(buildActivityEntry({
        subjectType: 'text',
        subjectId: item.id,
        action: 'STATUS_CHANGED',
        actor,
        fromStatus: item.status,
        toStatus: status,
        comment: reviewNotes ? reviewNotes.trim() : ''
      }));

      return updatedItems.find(updated => updated.id === item.id) ?? item;
    }));

    addActivityEntries(entries);
    if (!devUser && updatedItems.length > 0) {
      void (async () => {
        const authToken = await getAuthToken(session);
        const synced = await saveTextItemsToApi(updatedItems, authToken);
        if (!synced) {
          setTextSyncError('Unable to sync text updates. Please refresh.');
          return;
        }
        const refreshed = await refreshTextItemsFromApi(authToken || (await getAuthToken(null)));
        if (refreshed) {
          setTextItems(refreshed);
        }
      })();
    }
    if (shouldNotifyForStatus(status)) {
      const message = `${actor} updated ${ids.length} text item(s) to ${STATUS_LABELS[status]}.`;
      void sendSlackNotification(message);
    }
  };

  const openAssetDetail = (assetId: string, list: UiAsset[]) => {
    setSelectedAssetId(assetId);
    setAssetNavIds(list.map(asset => asset.id));
    setCurrentView('asset-detail');
  };

  const requestReviewNotes = (status: AssetStatus) => {
    if (status === 'HOLD') {
      return window.prompt('Add refinement notes (required):', '') ?? '';
    }
    if (status === 'REJECTED') {
      return window.prompt('Reason for rejection (required):', '') ?? '';
    }
    return '';
  };

  const handleTextStatusUpdate = (ids: string[], status: AssetStatus) => {
    if (currentRole !== 'reviewer') return;
    const reviewNotes = status === 'HOLD' || status === 'REJECTED'
      ? requestReviewNotes(status).trim()
      : '';
    if ((status === 'HOLD' || status === 'REJECTED') && !reviewNotes) return;
    applyTextStatus(ids, status, reviewNotes);
    setSelectedTextIds(prev => prev.filter(id => !ids.includes(id)));
  };

  const handleSaveText = async () => {
    if (textSaveLockRef.current) return;
    const title = textDraft.title.trim();
    const body = textDraft.body.trim();
    if (!title && !body) {
      alert('Add a title or body before saving.');
      return;
    }

    const category = textDraft.category.trim() || 'Idea';
    const tags = textDraft.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
    const groupId = textDraft.groupId || undefined;
    const section = textDraft.sectionId ? textSectionLookup.get(textDraft.sectionId) : null;
    const sectionId = groupId && section?.groupId === groupId ? section.id : undefined;
    const status = currentRole === 'reviewer' ? textDraft.status : 'TO_REVIEW';
    const reviewNotes = currentRole === 'reviewer' ? textDraft.reviewNotes.trim() : '';

    if ((status === 'HOLD' || status === 'REJECTED') && !reviewNotes) {
      alert('Add review notes for Hold or Rejected.');
      return;
    }

    const now = new Date().toISOString();
    const resolvedTitle = title || body.split('\n')[0]?.slice(0, 60).trim() || 'Untitled idea';

    const actor = actorLabel;
    textSaveLockRef.current = true;
    setIsSavingText(true);
    try {
      if (editingTextId) {
        const existing = textItems.find(item => item.id === editingTextId);
        let updatedItem: TextItem | null = null;
        setTextItems(prev => prev.map(item => {
          if (item.id !== editingTextId) return item;
          const updated: TextItem = {
            ...item,
            title: resolvedTitle,
            body,
            category,
            tags,
            groupId,
            sectionId,
            status,
            reviewer: status === 'TO_REVIEW' ? null : actor,
            reviewNotes: status === 'HOLD' || status === 'REJECTED' ? reviewNotes : '',
            updatedAt: now
          };
          updatedItem = updated;
          return updated;
        }));
        if (existing && existing.status !== status) {
          addActivityEntries([
            buildActivityEntry({
              subjectType: 'text',
              subjectId: existing.id,
              action: 'STATUS_CHANGED',
              actor,
              fromStatus: existing.status,
              toStatus: status,
              comment: reviewNotes ? reviewNotes.trim() : ''
            })
          ]);
          if (shouldNotifyForStatus(status)) {
            const message = `${actor} updated ${existing.title} to ${STATUS_LABELS[status]}.`;
            void sendSlackNotification(message);
          }
        }
        if (updatedItem && !devUser) {
          const authToken = await getAuthToken(session);
          const synced = await saveTextItemsToApi([updatedItem], authToken);
          if (!synced) {
            setTextSyncError('Unable to sync text updates. Please refresh.');
          }
        }
      } else {
        const newItem: TextItem = {
          id: buildId('text'),
          title: resolvedTitle,
          body,
          category,
          status,
          author: actor,
          reviewer: status === 'TO_REVIEW' ? null : actor,
          createdAt: now,
          updatedAt: now,
          tags,
          reviewNotes: status === 'HOLD' || status === 'REJECTED' ? reviewNotes : '',
          groupId,
          sectionId
        };
        setTextItems(prev => [newItem, ...prev]);
        addActivityEntries([
          buildActivityEntry({
            subjectType: 'text',
            subjectId: newItem.id,
            action: 'CREATED',
            actor,
            toStatus: status
          })
        ]);
        if (shouldNotifyOnNew()) {
          const groupName = groupId ? textGroupLookup.get(groupId)?.name ?? 'group' : 'Unassigned';
          const message = `${actor} added a new text item to ${groupName}. Status: ${STATUS_LABELS[status]}.`;
          void sendSlackNotification(message);
        }
        if (!devUser) {
          const authToken = await getAuthToken(session);
          const synced = await saveTextItemsToApi([newItem], authToken);
          if (!synced) {
            setTextSyncError('Unable to sync text updates. Please refresh.');
          }
        }
      }

      closeTextEditor();
    } finally {
      textSaveLockRef.current = false;
      setIsSavingText(false);
    }
  };

  const handleBulkImport = async () => {
    const entries = splitBulkImportEntries(bulkImportDraft.text);
    if (entries.length === 0) {
      alert('Paste at least one line or block to import.');
      return;
    }

    const category = bulkImportDraft.category.trim() || 'Idea';
    const tags = bulkImportDraft.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
    const groupId = bulkImportDraft.groupId || undefined;
    const section = bulkImportDraft.sectionId ? textSectionLookup.get(bulkImportDraft.sectionId) : null;
    const sectionId = groupId && section?.groupId === groupId ? section.id : undefined;
    const status = currentRole === 'reviewer' ? bulkImportDraft.status : 'TO_REVIEW';
    const reviewNotes = currentRole === 'reviewer' ? bulkImportDraft.reviewNotes.trim() : '';

    if ((status === 'HOLD' || status === 'REJECTED') && !reviewNotes) {
      alert('Add review notes for Hold or Rejected.');
      return;
    }

    const now = new Date().toISOString();
    const actor = actorLabel;
    const items: TextItem[] = entries.map((entry, index) => {
      const title = entry.title.trim();
      const body = entry.body.trim();
      const resolvedTitle = title || body.split('\n')[0]?.slice(0, 60).trim() || 'Untitled idea';
      const resolvedBody = body || title;
      return {
        id: buildId('text'),
        title: resolvedTitle,
        body: resolvedBody,
        category,
        status,
        author: actor,
        reviewer: status === 'TO_REVIEW' ? null : actor,
        createdAt: now,
        updatedAt: now,
        tags,
        reviewNotes: status === 'HOLD' || status === 'REJECTED' ? reviewNotes : '',
        groupId,
        sectionId
      };
    });

    setTextItems(prev => [...items, ...prev]);
    addActivityEntries(items.map(item => buildActivityEntry({
      subjectType: 'text',
      subjectId: item.id,
      action: 'CREATED',
      actor,
      toStatus: status
    })));
    if (shouldNotifyOnNew()) {
      const groupName = groupId ? textGroupLookup.get(groupId)?.name ?? 'group' : 'Unassigned';
      const message = `${actor} imported ${items.length} text item(s) into ${groupName}. Status: ${STATUS_LABELS[status]}.`;
      void sendSlackNotification(message);
    }
    if (!devUser) {
      const authToken = await getAuthToken(session);
      const synced = await saveTextItemsToApi(items, authToken);
      if (!synced) {
        setTextSyncError('Unable to sync text updates. Please refresh.');
      }
    }
    closeBulkImport();
  };

  const handleSaveGroup = async () => {
    const name = groupDraft.name.trim();
    if (!name) {
      alert('Group name is required.');
      return;
    }

    const description = groupDraft.description.trim();
    const eventId = groupDraft.eventId || null;
    const now = new Date().toISOString();
    let nextGroup: TextGroup | null = null;

    if (editingGroupId) {
      setTextGroups(prev => prev.map(group => {
        if (group.id !== editingGroupId) return group;
        const updated: TextGroup = {
          ...group,
          name,
          description,
          eventId,
          updatedAt: now
        };
        nextGroup = updated;
        return updated;
      }));
    } else {
      const newGroup: TextGroup = {
        id: buildId('group'),
        name,
        description,
        eventId,
        createdAt: now,
        updatedAt: now
      };
      setTextGroups(prev => [newGroup, ...prev]);
      nextGroup = newGroup;
    }

    closeGroupEditor();
    if (nextGroup && !devUser) {
      const authToken = await getAuthToken(session);
      if (authToken) {
        const synced = await saveTextGroupsToApi([nextGroup], authToken);
        if (!synced) {
          alert('Update saved locally but could not sync to the team feed.');
        }
      }
    }
  };

  const handleSaveSection = async () => {
    const name = sectionDraft.name.trim();
    if (!name) {
      alert('Section name is required.');
      return;
    }
    if (!sectionDraft.groupId) {
      alert('Section needs a text group.');
      return;
    }

    const description = sectionDraft.description.trim();
    const now = new Date().toISOString();
    let nextSection: TextSection | null = null;
    const updatedItems: TextItem[] = [];

    if (editingSectionId) {
      setTextSections(prev => prev.map(section => {
        if (section.id !== editingSectionId) return section;
        const updated: TextSection = {
          ...section,
          name,
          description,
          groupId: sectionDraft.groupId,
          updatedAt: now
        };
        nextSection = updated;
        return updated;
      }));
      setTextItems(prev => prev.map(item => (
        item.sectionId === editingSectionId
          ? (() => {
              const updated: TextItem = { ...item, groupId: sectionDraft.groupId, updatedAt: now };
              updatedItems.push(updated);
              return updated;
            })()
          : item
      )));
    } else {
      const newSection: TextSection = {
        id: buildId('section'),
        groupId: sectionDraft.groupId,
        name,
        description,
        createdAt: now,
        updatedAt: now
      };
      setTextSections(prev => [newSection, ...prev]);
      nextSection = newSection;
    }

    closeSectionEditor();
    if (nextSection && !devUser) {
      const authToken = await getAuthToken(session);
      if (authToken) {
        const synced = await saveTextSectionsToApi([nextSection], authToken);
        if (!synced) {
          alert('Update saved locally but could not sync to the team feed.');
        }
        if (updatedItems.length > 0) {
          const itemSynced = await saveTextItemsToApi(updatedItems, authToken);
          if (!itemSynced) {
            alert('Item updates saved locally but could not sync to the team feed.');
          }
        }
      }
    }
  };

  const handleDeleteSection = (sectionId: string) => {
    const section = textSectionLookup.get(sectionId);
    if (!section) return;
    const confirmed = window.confirm(
      'Remove this section? Text items inside will be unassigned.'
    );
    if (!confirmed) return;

    setTextSections(prev => prev.filter(item => item.id !== sectionId));
    setTextItems(prev => prev.map(item => (
      item.sectionId === sectionId ? { ...item, sectionId: undefined } : item
    )));
    if (textFilters.sectionId === sectionId) {
      setTextFilters(prev => ({ ...prev, sectionId: '' }));
    }
    if (textGroupViewerSectionId === sectionId) {
      setTextGroupViewerSectionId('');
    }
    if (!devUser) {
      void (async () => {
        const authToken = await getAuthToken(session);
        if (authToken) {
          const deleted = await deleteTextSectionFromApi(sectionId, authToken);
          if (!deleted) {
            alert('Delete saved locally but could not sync to the team feed.');
          }
        }
      })();
    }
  };

  const handleSaveEvent = async () => {
    const name = eventDraft.name.trim();
    const startDate = eventDraft.startDate.trim();
    const endDate = eventDraft.endDate.trim();
    if (!name || !startDate) {
      alert('Event name and start date are required.');
      return;
    }

    const totalTarget = Number.parseInt(eventDraft.totalTarget, 10);
    const perToneTargetRaw = Number.parseInt(eventDraft.perToneTarget, 10);
    const perToneTarget = Number.isFinite(perToneTargetRaw) ? perToneTargetRaw : 0;
    const tier = Number.parseInt(eventDraft.tier, 10);
    if (!Number.isFinite(totalTarget) || totalTarget <= 0) {
      alert('Total goal must be a positive number.');
      return;
    }
    if (!Number.isFinite(tier) || tier <= 0) {
      alert('Tier must be a positive number.');
      return;
    }

    const description = eventDraft.description.trim();
    let nextEvent: EventRecord | null = null;

    if (editingEventId) {
      setEvents(prev => prev.map(event => (
        event.id === editingEventId
          ? {
              ...event,
              name,
              startDate,
              endDate: endDate || null,
              totalTarget,
              perToneTarget,
              tier,
              description
            }
          : event
      )));
      const existing = events.find(event => event.id === editingEventId);
      if (existing) {
        nextEvent = {
          ...existing,
          name,
          startDate,
          endDate: endDate || null,
          totalTarget,
          perToneTarget,
          tier,
          description
        };
      }
    } else {
      const newEvent: EventRecord = {
        id: buildId('event'),
        name,
        startDate,
        endDate: endDate || null,
        totalTarget,
        perToneTarget,
        tier,
        description
      };
      setEvents(prev => [newEvent, ...prev]);
      nextEvent = newEvent;
    }

    closeEventEditor();
    if (nextEvent && !devUser) {
      const authToken = await getAuthToken(session);
      if (authToken) {
        const synced = await saveEventsToApi([nextEvent], authToken);
        if (!synced) {
          alert('Update saved locally but could not sync to the team feed.');
        }
      }
    }
  };

  const handleDeleteText = (itemId: string) => {
    if (!window.confirm('Remove this text item? This cannot be undone.')) return;
    setTextItems(prev => prev.filter(item => item.id !== itemId));
    setSelectedTextIds(prev => prev.filter(id => id !== itemId));
    setActivityLogs(prev => prev.filter(entry => !(entry.subjectType === 'text' && entry.subjectId === itemId)));
    if (!devUser) {
      void (async () => {
        const authToken = await getAuthToken(session);
        if (authToken) {
          const deleted = await deleteTextItemFromApi(itemId, authToken);
          if (!deleted) {
            alert('Delete saved locally but could not sync to the team feed.');
          }
        }
      })();
    }
  };

  const handleDeleteGroup = (groupId: string) => {
    const group = textGroupLookup.get(groupId);
    if (!group) return;
    const confirmed = window.confirm(
      'Remove this text group? Items inside will become unassigned.'
    );
    if (!confirmed) return;

    const sectionIds = new Set(
      textSections.filter(section => section.groupId === groupId).map(section => section.id)
    );

    setTextGroups(prev => prev.filter(item => item.id !== groupId));
    setTextSections(prev => prev.filter(section => section.groupId !== groupId));
    setTextItems(prev => prev.map(item => (
      item.groupId === groupId ? { ...item, groupId: undefined, sectionId: undefined } : item
    )));
    if (textFilters.groupId === groupId) {
      setTextFilters(prev => ({ ...prev, groupId: '' }));
    }
    if (textFilters.sectionId && sectionIds.has(textFilters.sectionId)) {
      setTextFilters(prev => ({ ...prev, sectionId: '' }));
    }
    if (selectedTextGroupId === groupId) {
      closeTextGroupViewer();
    }
    if (!devUser) {
      void (async () => {
        const authToken = await getAuthToken(session);
        if (authToken) {
          const deleted = await deleteTextGroupFromApi(groupId, authToken);
          if (!deleted) {
            alert('Delete saved locally but could not sync to the team feed.');
          }
        }
      })();
    }
  };

  const toggleTextSelection = (id: string) => {
    setSelectedTextIds(prev => (
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    ));
  };

  const toggleSelectAllTextItems = () => {
    if (filteredTextItems.length === 0) return;
    const allSelected = filteredTextItems.every(item => selectedTextIds.includes(item.id));
    setSelectedTextIds(allSelected ? [] : filteredTextItems.map(item => item.id));
  };

  useEffect(() => {
    if (selectedTextIds.length === 0) return;
    const validIds = new Set(textItems.map(item => item.id));
    setSelectedTextIds(prev => prev.filter(id => validIds.has(id)));
  }, [textItems, selectedTextIds.length]);

  useEffect(() => {
    setAssetCommentDraft('');
  }, [selectedAssetId]);

  useEffect(() => {
    setTextCommentDraft('');
  }, [editingTextId]);

  useEffect(() => {
    setReviewAction('');
    setReviewNotes('');
  }, [selectedAssetId]);

  const formatActivityTime = (timestamp: string) => (
    new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  );

  const describeActivity = (entry: ActivityEntry) => {
    if (entry.action === 'CREATED') {
      return `Created - status ${entry.toStatus ? STATUS_LABELS[entry.toStatus] : 'set'}`;
    }
    if (entry.action === 'STATUS_CHANGED') {
      const from = entry.fromStatus ? STATUS_LABELS[entry.fromStatus] : 'Unknown';
      const to = entry.toStatus ? STATUS_LABELS[entry.toStatus] : 'Unknown';
      return `Status changed from ${from} to ${to}`;
    }
    return 'Comment';
  };

  const filteredAssets = useMemo(() => {
    const list = assets.filter(asset => {
      if (filters.status && asset.status !== filters.status) return false;
      if (filters.eventId && asset.eventId !== filters.eventId) return false;
      if (filters.skinTone && asset.skinTone !== filters.skinTone && asset.skinTone !== ALL_TONE_ID) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [assets, filters]);

  useEffect(() => {
    if (selectedAssetIds.length === 0) return;
    const visibleIds = new Set(filteredAssets.map(asset => asset.id));
    setSelectedAssetIds(prev => prev.filter(id => visibleIds.has(id)));
  }, [filteredAssets, selectedAssetIds.length]);

  const selectedAssetActivity = useMemo(() => (
    selectedAssetId
      ? activityLogs.filter(entry => entry.subjectType === 'asset' && entry.subjectId === selectedAssetId)
      : []
  ), [activityLogs, selectedAssetId]);

  const selectedTextActivity = useMemo(() => (
    editingTextId
      ? activityLogs.filter(entry => entry.subjectType === 'text' && entry.subjectId === editingTextId)
      : []
  ), [activityLogs, editingTextId]);

  const filteredTextItems = useMemo(() => {
    const query = textFilters.query.trim().toLowerCase();
    const list = textItems.filter(item => {
      if (textFilters.status && item.status !== textFilters.status) return false;
      if (textFilters.category && item.category !== textFilters.category) return false;
      if (textFilters.groupId) {
        if (textFilters.groupId === UNASSIGNED_GROUP_ID) {
          if (item.groupId) return false;
        } else if (item.groupId !== textFilters.groupId) {
          return false;
        }
      }
      if (textFilters.sectionId) {
        if (textFilters.sectionId === UNASSIGNED_SECTION_ID) {
          if (item.sectionId) return false;
        } else if (item.sectionId !== textFilters.sectionId) {
          return false;
        }
      }
      if (textFilters.eventId) {
        const group = item.groupId ? textGroupLookup.get(item.groupId) : null;
        if (!group || group.eventId !== textFilters.eventId) return false;
      }
      if (!query) return true;

      const haystack = [
        item.title,
        item.body,
        item.category,
        item.tags.join(' ')
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });

    return [...list].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [textItems, textFilters, textGroupLookup]);

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EVENT_WINDOW_DAYS = 30;

const toDateOrNull = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getEventTiming = (event: { startDate: string; endDate?: string | null }) => {
  const now = new Date();
  const start = toDateOrNull(event.startDate);
  const end = toDateOrNull(event.endDate ?? null);
  if (!start) return { daysUntil: Number.POSITIVE_INFINITY, isOngoing: false };

  const daysUntil = Math.ceil((start.getTime() - now.getTime()) / DAY_MS);
  if (end) {
    const isOngoing = now >= start && now <= end;
    return { daysUntil, isOngoing };
  }

  const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / DAY_MS);
  const isOngoing = daysSinceStart >= 0 && daysSinceStart <= DEFAULT_EVENT_WINDOW_DAYS;
  return { daysUntil, isOngoing };
};

  const upcomingEventChoices = useMemo(() => (
    events
      .map(event => {
        const timing = getEventTiming(event);
        return { ...event, daysUntil: timing.daysUntil, isOngoing: timing.isOngoing };
      })
      .filter(event => event.isOngoing || event.daysUntil >= 0)
      .sort((a, b) => {
        if (a.isOngoing && !b.isOngoing) return -1;
        if (!a.isOngoing && b.isOngoing) return 1;
        return a.daysUntil - b.daysUntil;
      })
      .slice(0, 5)
  ), [events]);

  const getUpcomingEvents = () => (
    events
      .map(event => {
        const approvedCount = assets.filter(asset => asset.eventId === event.id && asset.status === 'APPROVED').length;
        const timing = getEventTiming(event);
        return {
          ...event,
          daysUntil: timing.daysUntil,
          isOngoing: timing.isOngoing,
          approved: approvedCount,
          progress: (approvedCount / event.totalTarget) * 100
        };
      })
      .filter(event => event.isOngoing || (event.daysUntil > 0 && event.daysUntil <= 90))
      .sort((a, b) => {
        if (a.isOngoing && !b.isOngoing) return -1;
        if (!a.isOngoing && b.isOngoing) return 1;
        return a.daysUntil - b.daysUntil;
      })
      .slice(0, 6)
  );

  // Dashboard View
  const renderDashboardView = () => {
    const upcomingEvents = getUpcomingEvents();
    const totalApproved = stats.approved;
    const overallProgress = (totalApproved / OVERALL_GOAL) * 100;

    return (
      <div className="space-y-8">
        {/* Hero Stats */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-8 text-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-3xl font-bold mb-2">Content Pipeline</h2>
              <p className="text-blue-100 mb-6">Your review workflow at a glance</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                  <div className="text-4xl font-bold">{stats.toReview}</div>
                  <div className="text-sm text-blue-100 mt-1">Awaiting Review</div>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                  <div className="text-4xl font-bold">{stats.approved}</div>
                  <div className="text-sm text-blue-100 mt-1">Approved</div>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                  <div className="text-4xl font-bold">{stats.hold}</div>
                  <div className="text-sm text-blue-100 mt-1">On Hold</div>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                  <div className="text-4xl font-bold">{totalApproved}</div>
                  <div className="text-sm text-blue-100 mt-1">Total Approved</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <div className="bg-white/10 backdrop-blur rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Overall Progress</span>
                  <span className="text-2xl font-bold">{overallProgress.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-3 mb-4">
                  <div 
                    className="bg-white h-3 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(overallProgress, 100)}%` }}
                  ></div>
                </div>
                <div className="text-sm text-blue-100">
                  {totalApproved.toLocaleString()} of {OVERALL_GOAL.toLocaleString()} assets approved across all events
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Events */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-2xl font-bold text-gray-900">Upcoming & Ongoing Events</h3>
            <button 
              onClick={() => setCurrentView('events')}
              className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
            >
              View All <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingEvents.map(event => {
              const urgency = event.daysUntil < 30 ? 'urgent' : event.daysUntil < 60 ? 'warning' : 'normal';

              return (
                <div 
                  key={event.id} 
                  className="bg-white rounded-xl border-2 border-gray-200 p-6 hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer group"
                  onClick={() => openEventModal(event.id)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h4 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                        {event.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-500">
                          {new Date(event.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                      urgency === 'urgent' ? 'bg-red-100 text-red-700' :
                      urgency === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {event.isOngoing ? 'Ongoing' : `${event.daysUntil}d`}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600 font-medium">Progress</span>
                        <span className="font-bold text-gray-900">{event.approved} / {event.totalTarget}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            event.progress >= 100 ? 'bg-green-500' :
                            event.progress >= 75 ? 'bg-blue-500' :
                            event.progress >= 50 ? 'bg-yellow-500' : 'bg-red-400'
                          }`}
                          style={{ width: `${Math.min(event.progress, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex gap-1.5">
                      {SKIN_TONES.map(tone => {
                        const count = assets.filter(asset => asset.eventId === event.id && asset.skinTone === tone.id && asset.status === 'APPROVED').length;
                        return (
                          <div 
                            key={tone.id} 
                            className="flex-1 h-6 rounded flex items-center justify-center text-white text-xs font-bold"
                            style={{ backgroundColor: tone.color }}
                            title={`${tone.name}: ${count}`}
                          >
                            {count}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Pending Review</h3>
            </div>
            {assets.filter(asset => asset.status === 'TO_REVIEW').slice(0, 4).map(asset => (
              <div 
                key={asset.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer mb-2 transition-colors"
                onClick={() => openAssetDetail(asset.id, assets.filter(item => item.status === 'TO_REVIEW'))}
              >
                <AssetPreview asset={asset} className="w-12 h-12 rounded-lg" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">{asset.title}</div>
                  <div className="text-xs text-gray-500">
                    {eventLookup.get(asset.eventId)?.name}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            ))}
            {stats.toReview === 0 && (
              <div className="text-center py-8 text-gray-400">
                <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">All caught up!</p>
              </div>
            )}
            {stats.toReview > 4 && (
              <button 
                onClick={() => setCurrentView('queue')}
                className="w-full mt-2 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-colors"
              >
                View all {stats.toReview} items
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">On Hold</h3>
            </div>
            {assets.filter(asset => asset.status === 'HOLD').slice(0, 4).map(asset => (
              <div 
                key={asset.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-yellow-50 cursor-pointer mb-2 transition-colors"
                onClick={() => openAssetDetail(asset.id, assets.filter(item => item.status === 'HOLD'))}
              >
                <AssetPreview asset={asset} className="w-12 h-12 rounded-lg" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">{asset.title}</div>
                  <div className="text-xs text-gray-500 truncate">{asset.notesRefinement}</div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            ))}
            {stats.hold === 0 && (
              <div className="text-center py-8 text-gray-400">
                <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No items on hold</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Review Queue View
  const renderReviewQueueView = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
        <div className="flex flex-wrap gap-3">
          <select 
            className="px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as AssetStatus | '' })}
          >
            <option value="">All Statuses</option>
            {ASSET_STATUSES.map(status => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          <select 
            className="px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors"
            value={filters.eventId}
            onChange={(e) => setFilters({ ...filters, eventId: e.target.value })}
          >
            <option value="">All Events</option>
            {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>

          <select 
            className="px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors"
            value={filters.skinTone}
            onChange={(e) => setFilters({ ...filters, skinTone: e.target.value as SkinTone | '' })}
          >
            <option value="">All Skin Tones</option>
            {SKIN_TONES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          {(filters.status || filters.eventId || filters.skinTone) && (
            <button 
              onClick={() => setFilters({ status: '', eventId: '', skinTone: '' })}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-bold text-gray-900">{filteredAssets.length} Assets</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSelectAllAssets}
              className="rounded-full border-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300"
            >
              {filteredAssets.length > 0 && filteredAssets.every(asset => selectedAssetIds.includes(asset.id))
                ? 'Clear selection'
                : 'Select all'}
            </button>
            {selectedAssetIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-full border-2 border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                {selectedAssetIds.length} selected
                <button
                  onClick={handleBatchDeleteAssets}
                  disabled={batchDeletingAssets}
                  className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:bg-rose-300"
                >
                  {batchDeletingAssets ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setSelectedAssetIds([])}
                  className="rounded-full border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:border-rose-300"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAssets.map(asset => (
            <div 
              key={asset.id} 
              className="relative border-2 border-gray-200 rounded-xl p-4 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer group"
              onClick={() => openAssetDetail(asset.id, filteredAssets)}
            >
              <label
                className="absolute left-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-200 bg-white shadow-sm"
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={selectedAssetIds.includes(asset.id)}
                  onChange={() => toggleAssetSelection(asset.id)}
                />
              </label>
              <AssetPreview asset={asset} className="w-full h-40 rounded-lg mb-3 group-hover:scale-105 transition-transform" />
              <div className="space-y-2">
                <div className="font-semibold text-sm text-gray-900 truncate">{asset.title}</div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 truncate">{eventLookup.get(asset.eventId)?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded" style={{ backgroundColor: asset.previewColor }}></div>
                  <span className="text-xs text-gray-500">{getToneMeta(asset.skinTone).name}</span>
                </div>
                <StatusBadge status={asset.status} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Asset Detail View
  const renderAssetDetailView = () => {
    if (!selectedAsset) return null;
    const assetNavIndex = assetNavIds.indexOf(selectedAsset.id);
    const hasPrev = assetNavIndex > 0;
    const hasNext = assetNavIndex >= 0 && assetNavIndex < assetNavIds.length - 1;

    const handleSubmitReview = async () => {
      if (!reviewAction) return;
      if (reviewAction === 'HOLD' && !reviewNotes.trim()) {
        alert('Please provide refinement notes for Hold status');
        return;
      }
      if (reviewAction === 'REJECTED' && !reviewNotes.trim()) {
        alert('Please provide a reason for rejection');
        return;
      }
      await handleReviewAction(selectedAsset.id, reviewAction, reviewNotes);
      setReviewAction('');
      setReviewNotes('');
    };

    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button 
            onClick={() => setCurrentView('queue')}
            className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
          >
            Back to Queue
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => hasPrev && setSelectedAssetId(assetNavIds[assetNavIndex - 1])}
              disabled={!hasPrev}
              className="rounded-full border-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => hasNext && setSelectedAssetId(assetNavIds[assetNavIndex + 1])}
              disabled={!hasNext}
              className="rounded-full border-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
            {assetNavIndex >= 0 && (
              <span className="text-xs text-gray-500">
                {assetNavIndex + 1} / {assetNavIds.length}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border-2 border-gray-200 p-8">
              <AssetPreview asset={selectedAsset} className="w-full h-96 rounded-xl mb-6 shadow-inner" large />
              <h2 className="text-3xl font-bold text-gray-900">{selectedAsset.title}</h2>
            </div>

            {currentRole === 'reviewer' && selectedAsset.status === 'TO_REVIEW' && (
              <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
                <h3 className="text-lg font-bold mb-4">Review Actions</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <button 
                      onClick={() => setReviewAction('APPROVED')}
                      className={`py-4 px-4 rounded-xl border-2 transition-all font-medium ${
                        reviewAction === 'APPROVED' 
                          ? 'border-green-500 bg-green-50 text-green-700 shadow-lg scale-105' 
                          : 'border-gray-200 hover:border-green-300 hover:bg-green-50'
                      }`}
                    >
                      <Check className="w-6 h-6 mx-auto mb-2" />
                      Approve
                    </button>
                    <button 
                      onClick={() => setReviewAction('HOLD')}
                      className={`py-4 px-4 rounded-xl border-2 transition-all font-medium ${
                        reviewAction === 'HOLD' 
                          ? 'border-yellow-500 bg-yellow-50 text-yellow-700 shadow-lg scale-105' 
                          : 'border-gray-200 hover:border-yellow-300 hover:bg-yellow-50'
                      }`}
                    >
                      <Pause className="w-6 h-6 mx-auto mb-2" />
                      Hold
                    </button>
                    <button 
                      onClick={() => setReviewAction('REJECTED')}
                      className={`py-4 px-4 rounded-xl border-2 transition-all font-medium ${
                        reviewAction === 'REJECTED' 
                          ? 'border-red-500 bg-red-50 text-red-700 shadow-lg scale-105' 
                          : 'border-gray-200 hover:border-red-300 hover:bg-red-50'
                      }`}
                    >
                      <X className="w-6 h-6 mx-auto mb-2" />
                      Reject
                    </button>
                  </div>

                  {(reviewAction === 'HOLD' || reviewAction === 'REJECTED') && (
                    <textarea
                      placeholder={reviewAction === 'HOLD' ? 'Describe refinements needed...' : 'Reason for rejection...'}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                      rows="4"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                    />
                  )}

                  {reviewAction && (
                    <button 
                      onClick={handleSubmitReview}
                      className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-colors"
                    >
                      Submit Review
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
              <h3 className="font-bold text-lg mb-4">Details</h3>
              <div className="space-y-4 text-sm">
                <div>
                  <div className="text-gray-500 mb-1">Status</div>
                  <StatusBadge status={selectedAsset.status} />
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Event</div>
                  <div className="font-semibold text-gray-900">{eventLookup.get(selectedAsset.eventId)?.name}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Skin Tone</div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-lg shadow-sm"
                      style={{ backgroundColor: getToneMeta(selectedAsset.skinTone).color }}
                    ></div>
                    <span className="font-semibold text-gray-900">{getToneMeta(selectedAsset.skinTone).name}</span>
                  </div>
                  {currentRole === 'creator' && (
                    <select
                      className="mt-3 w-full rounded-lg border-2 border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 focus:border-blue-500 focus:outline-none"
                      value={selectedAsset.skinTone}
                      onChange={(e) => handleToneUpdate(selectedAsset.id, e.target.value as SkinTone)}
                    >
                      <option value={ALL_TONE_ID}>All tones</option>
                      {SKIN_TONES.map(tone => (
                        <option key={tone.id} value={tone.id}>{tone.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <div className="text-gray-500 mb-1">Uploaded by</div>
                  <div className="font-semibold text-gray-900">{selectedAsset.uploader}</div>
                </div>
                {selectedAsset.reviewer && (
                  <div>
                    <div className="text-gray-500 mb-1">Reviewed by</div>
                    <div className="font-semibold text-gray-900">{selectedAsset.reviewer}</div>
                  </div>
                )}
                {selectedAsset.fileName && (
                  <div>
                    <div className="text-gray-500 mb-1">File</div>
                    <div className="font-semibold text-gray-900">{selectedAsset.fileName}</div>
                  </div>
                )}
                <div>
                  <div className="text-gray-500 mb-1">Created</div>
                  <div className="font-semibold text-gray-900">{new Date(selectedAsset.createdAt).toLocaleString()}</div>
                </div>
              </div>
            </div>

            {selectedAsset.mediaStorage === 'object' && !selectedAsset.mediaUrl && (
              <div className="bg-amber-50 rounded-xl border-2 border-amber-200 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-amber-900 mb-1">Preview unavailable</div>
                    <p className="text-sm text-amber-800">Re-upload this file to restore the preview.</p>
                  </div>
                </div>
              </div>
            )}

            {selectedAsset.notesRefinement && (
              <div className="bg-yellow-50 rounded-xl border-2 border-yellow-200 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-yellow-900 mb-1">Refinements Needed</div>
                    <p className="text-sm text-yellow-800">{selectedAsset.notesRefinement}</p>
                  </div>
                </div>
              </div>
            )}

              <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
                <h3 className="font-bold text-lg mb-4">Activity & comments</h3>
              {selectedAssetActivity.length === 0 ? (
                <p className="text-sm text-gray-500">No activity yet.</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {selectedAssetActivity.map(entry => (
                    <div key={entry.id} className="rounded-lg border border-gray-200 px-3 py-2">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="font-semibold text-gray-700">{entry.actor}</span>
                        <span>{formatActivityTime(entry.timestamp)}</span>
                      </div>
                      <div className="mt-1 text-sm text-gray-700">{describeActivity(entry)}</div>
                      {entry.comment && (
                        <div className="mt-2 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600">
                          {entry.comment}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 space-y-3">
                <textarea
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                  rows={3}
                  value={assetCommentDraft}
                  onChange={(e) => setAssetCommentDraft(e.target.value)}
                  placeholder="Add a comment for this asset..."
                />
                <button
                  onClick={() => {
                    if (!selectedAsset) return;
                    addCommentActivity('asset', selectedAsset.id, assetCommentDraft);
                    setAssetCommentDraft('');
                  }}
                  disabled={!assetCommentDraft.trim()}
                  className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Add comment
                </button>
              </div>

              <button
                onClick={() => void handleDeleteAsset(selectedAsset.id)}
                disabled={deletingAssetId === selectedAsset.id}
                className="w-full rounded-xl border-2 border-rose-200 px-4 py-3 text-sm font-semibold text-rose-600 hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingAssetId === selectedAsset.id ? 'Deleting...' : 'Delete asset'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Events View
  const renderEventsView = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-indigo-600 to-blue-500 rounded-2xl p-8 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold mb-2">{events.length} Events</h2>
            <p className="text-blue-100">Track progress across all your content events</p>
          </div>
          <button
            onClick={() => openEventEditor()}
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            Add event
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map(event => {
          const eventAssets = assets.filter(asset => asset.eventId === event.id && asset.status === 'APPROVED');
          const progress = (eventAssets.length / event.totalTarget) * 100;
          const timing = getEventTiming(event);
          const daysUntil = timing.daysUntil;
          const isOngoing = timing.isOngoing;
          
          const toneCounts = SKIN_TONES.map(tone => ({
            tone,
            count: eventAssets.filter(asset => asset.skinTone === tone.id).length
          }));

          return (
            <div
              key={event.id}
              className="bg-white rounded-xl border-2 border-gray-200 p-6 hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer"
              onClick={() => openEventModal(event.id)}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">{event.name}</h3>
                  {event.description && (
                    <p className="text-xs text-gray-500 mt-1">{event.description}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                    isOngoing ? 'bg-blue-100 text-blue-700' :
                    daysUntil < 0 ? 'bg-gray-100 text-gray-500' :
                    daysUntil < 30 ? 'bg-red-100 text-red-700' :
                    daysUntil < 90 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {isOngoing ? 'Ongoing' : (daysUntil < 0 ? 'Past' : `${daysUntil}d`)}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={(eventClick) => {
                        eventClick.stopPropagation();
                        openEventEditor(event);
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(eventClick) => {
                        eventClick.stopPropagation();
                        startUploadForEvent(event.id);
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      Batch upload
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-600 font-medium">Overall Progress</span>
                    <span className="font-bold text-gray-900">{eventAssets.length} / {event.totalTarget}</span>
                    </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full transition-all ${
                        progress >= 100 ? 'bg-green-500' :
                        progress >= 75 ? 'bg-blue-500' :
                        progress >= 50 ? 'bg-yellow-500' : 'bg-red-400'
                      }`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-600 font-medium mb-2">Coverage by Tone</div>
                  <div className="grid grid-cols-6 gap-2">
                    {toneCounts.map(({ tone, count }) => (
                      <div key={tone.id} className="text-center">
                        <div 
                          className="h-8 rounded flex items-center justify-center text-white text-xs font-bold mb-1"
                          style={{ backgroundColor: tone.color }}
                          title={tone.name}
                        >
                          {count}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderTextSignOffView = () => {
    const selectedCount = selectedTextIds.length;
    const allVisibleSelected = filteredTextItems.length > 0
      && filteredTextItems.every(item => selectedTextIds.includes(item.id));
    const unassignedCount = textItems.filter(item => !item.groupId).length;

    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-8 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-blue-100">Text sign-off</p>
            <h2 className="text-3xl font-bold">Ideas + prompts hub</h2>
            <p className="mt-2 text-blue-100">
              Draft, edit, and approve text briefs in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => openBulkImport()}
              className="rounded-xl border-2 border-white/70 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Bulk import
            </button>
            <button
              onClick={() => openTextEditor()}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              New text item
            </button>
          </div>
        </div>
      </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border-2 border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">To review</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{textStats.toReview}</p>
          </div>
          <div className="rounded-xl border-2 border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Approved</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{textStats.approved}</p>
          </div>
          <div className="rounded-xl border-2 border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Hold</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{textStats.hold}</p>
          </div>
          <div className="rounded-xl border-2 border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Rejected</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{textStats.rejected}</p>
          </div>
        </div>

        <div className="rounded-2xl border-2 border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Text groups</p>
              <h3 className="text-lg font-bold text-gray-900">Organize ideas into folders</h3>
            </div>
            <button
              onClick={() => openGroupEditor()}
              className="rounded-xl border-2 border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:border-blue-300"
            >
              New group
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedTextGroups.map(group => {
              const stats = textGroupStatsById.get(group.id);
              const event = group.eventId ? eventLookup.get(group.eventId) : null;
              const sections = textSectionsByGroup.get(group.id) ?? [];
              return (
                <div
                  key={group.id}
                  className="rounded-xl border-2 border-gray-200 bg-gray-50/60 p-4 transition-all hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer"
                  onClick={() => openTextGroupViewer(group.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-bold text-gray-900">{group.name}</h4>
                      <p className="text-xs text-gray-500">
                        {event ? `Linked to ${event.name}` : 'No event linked'}
                      </p>
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteGroup(group.id);
                      }}
                      className="text-xs font-semibold text-gray-400 hover:text-rose-600"
                    >
                      Delete
                    </button>
                  </div>
                  {group.description && (
                    <p className="mt-2 text-xs text-gray-500">{group.description}</p>
                  )}
                  {sections.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sections.slice(0, 3).map(section => (
                        <span key={section.id} className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-gray-600">
                          {section.name}
                        </span>
                      ))}
                      {sections.length > 3 && (
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-gray-400">
                          +{sections.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-gray-600">
                    <span className="rounded-full bg-gray-100 px-2 py-1">
                      {stats?.total ?? 0} items
                    </span>
                    {ASSET_STATUSES.map(status => (
                      <span key={status} className="rounded-full bg-gray-100 px-2 py-1">
                        {STATUS_LABELS[status]} {stats?.statuses[status] ?? 0}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        openTextGroupViewer(group.id);
                      }}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Open group
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        openGroupEditor(group);
                      }}
                      className="rounded-lg border-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        openTextEditor(undefined, group.id);
                      }}
                      className="rounded-lg border-2 border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:border-blue-300"
                    >
                      Add text
                    </button>
                  </div>
                </div>
              );
            })}

            <div
              className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-4 transition-all hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer"
              onClick={() => openTextGroupViewer(UNASSIGNED_GROUP_ID)}
            >
              <h4 className="text-base font-bold text-gray-900">Unassigned</h4>
              <p className="text-xs text-gray-500">Text items not in a group yet.</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-gray-600">
                <span className="rounded-full bg-gray-100 px-2 py-1">
                  {unassignedCount} items
                </span>
              </div>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  openTextGroupViewer(UNASSIGNED_GROUP_ID);
                }}
                className="mt-3 rounded-lg border-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300"
              >
                Open unassigned
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border-2 border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={toggleSelectAllTextItems}
              className="rounded-lg border-2 border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:border-gray-300"
            >
              {allVisibleSelected ? 'Clear selection' : 'Select visible'}
            </button>

            <select
              className="px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors"
              value={textFilters.status}
              onChange={(e) => setTextFilters({ ...textFilters, status: e.target.value as AssetStatus | '' })}
            >
              <option value="">All Statuses</option>
              {ASSET_STATUSES.map(status => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>

            <select
              className="px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors"
              value={textFilters.category}
              onChange={(e) => setTextFilters({ ...textFilters, category: e.target.value })}
            >
              <option value="">All Categories</option>
              {textCategoryOptions.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>

            <select
              className="px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors"
              value={textFilters.groupId}
              onChange={(e) => setTextFilters({ ...textFilters, groupId: e.target.value, sectionId: '' })}
            >
              <option value="">All Groups</option>
              <option value={UNASSIGNED_GROUP_ID}>Unassigned</option>
              {sortedTextGroups.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>

            <select
              className="px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors"
              value={textFilters.sectionId}
              onChange={(e) => setTextFilters({ ...textFilters, sectionId: e.target.value })}
              disabled={textFilters.groupId === UNASSIGNED_GROUP_ID}
            >
              <option value="">All Sections</option>
              <option value={UNASSIGNED_SECTION_ID}>Unassigned</option>
              {filterSectionOptions.map(section => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>

            <select
              className="px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors"
              value={textFilters.eventId}
              onChange={(e) => setTextFilters(prev => ({
                ...prev,
                eventId: e.target.value,
                groupId: '',
                sectionId: ''
              }))}
            >
              <option value="">All Events</option>
              {events.map(event => (
                <option key={event.id} value={event.id}>{event.name}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Search text, tags, or category..."
              className="min-w-[220px] flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors"
              value={textFilters.query}
              onChange={(e) => setTextFilters({ ...textFilters, query: e.target.value })}
            />

            {(textFilters.status || textFilters.category || textFilters.query || textFilters.groupId || textFilters.eventId || textFilters.sectionId) && (
              <button
                onClick={() => setTextFilters({ status: 'TO_REVIEW', category: '', query: '', groupId: '', eventId: '', sectionId: '' })}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Reset filters
              </button>
            )}
          </div>

          {currentRole === 'reviewer' && selectedCount > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-blue-100 bg-blue-50 px-4 py-3">
              <span className="text-sm font-semibold text-blue-700">{selectedCount} selected</span>
              <button
                onClick={() => handleTextStatusUpdate(selectedTextIds, 'APPROVED')}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Approve
              </button>
              <button
                onClick={() => handleTextStatusUpdate(selectedTextIds, 'HOLD')}
                className="rounded-lg border-2 border-yellow-200 px-3 py-1.5 text-xs font-semibold text-yellow-700 hover:border-yellow-300"
              >
                Hold
              </button>
              <button
                onClick={() => handleTextStatusUpdate(selectedTextIds, 'REJECTED')}
                className="rounded-lg border-2 border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:border-rose-300"
              >
                Reject
              </button>
              <button
                onClick={() => handleTextStatusUpdate(selectedTextIds, 'TO_REVIEW')}
                className="rounded-lg border-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300"
              >
                Back to review
              </button>
              <button
                onClick={() => setSelectedTextIds([])}
                className="ml-auto text-xs font-semibold text-blue-700 hover:text-blue-800"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {filteredTextItems.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-10 text-center">
              <p className="text-sm font-semibold text-gray-600">No text items match these filters yet.</p>
              <button
                onClick={() => openTextEditor()}
                className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Create the first one
              </button>
            </div>
          )}

          {filteredTextItems.map(item => {
            const group = item.groupId ? textGroupLookup.get(item.groupId) : null;
            const section = item.sectionId ? textSectionLookup.get(item.sectionId) : null;
            const event = group?.eventId ? eventLookup.get(group.eventId) : null;
            return (
              <div key={item.id} className="rounded-2xl border-2 border-gray-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                      checked={selectedTextIds.includes(item.id)}
                      onChange={() => toggleTextSelection(item.id)}
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                          {item.category}
                        </span>
                        {group && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                            {group.name}
                          </span>
                        )}
                        {section && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                            {section.name}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {item.author} - {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {event && <span className="ml-2 text-blue-600">- {event.name}</span>}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={item.status} />
                </div>

                <p className="mt-3 text-sm text-gray-600">
                  {buildTextSnippet(item.body) || 'No description yet.'}
                </p>

                {item.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.tags.map(tag => (
                      <span
                        key={tag}
                        className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${getTagBadgeClass(tag)}`}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {item.reviewNotes && (item.status === 'HOLD' || item.status === 'REJECTED') && (
                  <div className="mt-4 rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    <span className="font-semibold">Reviewer note:</span> {item.reviewNotes}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => openTextEditor(item)}
                    className="rounded-lg border-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-300"
                  >
                    Open & edit
                  </button>
                  <button
                    onClick={() => handleDeleteText(item.id)}
                    className="rounded-lg border-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:border-rose-200 hover:text-rose-600"
                  >
                    Remove
                  </button>

                  {currentRole === 'reviewer' && (
                    <>
                      <button
                        onClick={() => handleTextStatusUpdate([item.id], 'APPROVED')}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleTextStatusUpdate([item.id], 'HOLD')}
                        className="rounded-lg border-2 border-yellow-200 px-3 py-1.5 text-xs font-semibold text-yellow-700 hover:border-yellow-300"
                      >
                        Hold
                      </button>
                      <button
                        onClick={() => handleTextStatusUpdate([item.id], 'REJECTED')}
                        className="rounded-lg border-2 border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:border-rose-300"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTextGroupViewer = () => {
    if (!textGroupViewerOpen || !selectedViewerGroup) return null;

    const isUnassigned = selectedViewerGroup.id === UNASSIGNED_GROUP_ID;
    const event = selectedViewerGroup.eventId ? eventLookup.get(selectedViewerGroup.eventId) : null;
    const statusTotals = ASSET_STATUSES.map(status => ({
      status,
      count: groupViewerStatusCounts[status]
    }));
    const totalItems = groupViewerItems.length;
    const hasSectionGrouping = !textGroupViewerSectionId
      && (groupViewerSections.length > 0 || groupViewerUnassignedSectionCount > 0);

    const renderGroupViewerItem = (item: TextItem) => (
      <div key={item.id} className="rounded-2xl border-2 border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                {item.category}
              </span>
              {item.sectionId && textSectionLookup.get(item.sectionId) && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  {textSectionLookup.get(item.sectionId)?.name}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {item.author} - {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
          <StatusBadge status={item.status} />
        </div>

        <p className="mt-3 text-sm text-gray-600">
          {buildTextSnippet(item.body) || 'No description yet.'}
        </p>

        {item.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.tags.map(tag => (
              <span
                key={tag}
                className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${getTagBadgeClass(tag)}`}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {item.reviewNotes && (item.status === 'HOLD' || item.status === 'REJECTED') && (
          <div className="mt-4 rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <span className="font-semibold">Reviewer note:</span> {item.reviewNotes}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => openTextEditor(item)}
            className="rounded-lg border-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-300"
          >
            Open & edit
          </button>
          <button
            onClick={() => handleDeleteText(item.id)}
            className="rounded-lg border-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:border-rose-200 hover:text-rose-600"
          >
            Remove
          </button>

          {currentRole === 'reviewer' && (
            <>
              <button
                onClick={() => handleTextStatusUpdate([item.id], 'APPROVED')}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Approve
              </button>
              <button
                onClick={() => handleTextStatusUpdate([item.id], 'HOLD')}
                className="rounded-lg border-2 border-yellow-200 px-3 py-1.5 text-xs font-semibold text-yellow-700 hover:border-yellow-300"
              >
                Hold
              </button>
              <button
                onClick={() => handleTextStatusUpdate([item.id], 'REJECTED')}
                className="rounded-lg border-2 border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:border-rose-300"
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>
    );

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={closeTextGroupViewer}
      >
        <div
          className={`bg-white shadow-2xl modal-pop flex flex-col ${
            textGroupViewerExpanded
              ? 'w-full h-full rounded-none'
              : 'w-full max-w-5xl max-h-[85vh] rounded-2xl'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Text group</p>
              <h2 className="text-2xl font-bold text-gray-900">{selectedViewerGroup.name}</h2>
              <div className="mt-1 text-sm text-gray-500">
                {event ? `Linked to ${event.name}` : 'No event linked'}
                <span className="ml-3 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                  {totalItems} items
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => openTextEditor(undefined, isUnassigned ? undefined : selectedViewerGroup.id)}
                className="rounded-xl border-2 border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:border-blue-300"
              >
                Add text
              </button>
              <button
                onClick={() => openBulkImport(
                  isUnassigned ? undefined : selectedViewerGroup.id,
                  textGroupViewerSectionId && textGroupViewerSectionId !== UNASSIGNED_SECTION_ID
                    ? textGroupViewerSectionId
                    : undefined
                )}
                className="rounded-xl border-2 border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:border-blue-300"
              >
                Bulk import
              </button>
              {!isUnassigned && (
                <button
                  onClick={() => openGroupEditor(selectedViewerGroup)}
                  className="rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-gray-300"
                >
                  Edit group
                </button>
              )}
              {!isUnassigned && (
                <button
                  onClick={() => handleDeleteGroup(selectedViewerGroup.id)}
                  className="rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-rose-200 hover:text-rose-600"
                >
                  Delete group
                </button>
              )}
              <button
                onClick={() => openTextGroupView(isUnassigned ? UNASSIGNED_GROUP_ID : selectedViewerGroup.id, event?.id)}
                className="rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-gray-300"
              >
                Open in Text Sign-Off
              </button>
              <button
                onClick={() => setTextGroupViewerExpanded(prev => !prev)}
                className="rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-gray-300"
              >
                {textGroupViewerExpanded ? 'Exit full screen' : 'Full screen'}
              </button>
              <button
                onClick={closeTextGroupViewer}
                className="rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-gray-300"
              >
                Close
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {selectedViewerGroup.description && (
              <div className="rounded-2xl border-2 border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-600">
                {selectedViewerGroup.description}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
              <div className="rounded-2xl border-2 border-gray-200 bg-gray-50/80 p-5">
                <div className="flex items-center justify-between text-sm font-semibold text-gray-600">
                  <span>Status breakdown</span>
                  <span className="text-gray-900">{totalItems} total</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  {statusTotals.map(({ status, count }) => (
                    <button
                      key={status}
                      onClick={() => setTextGroupViewerStatus(status)}
                      className={`flex items-center justify-between rounded-xl border-2 px-3 py-2 text-left ${
                        textGroupViewerStatus === status
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="font-semibold">{STATUS_LABELS[status]}</span>
                      <span className="text-xs font-bold">{count}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setTextGroupViewerStatus('')}
                    className={`col-span-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold ${
                      textGroupViewerStatus === ''
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    All items ({totalItems})
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border-2 border-gray-200 bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Search</p>
                <input
                  type="text"
                  value={textGroupViewerQuery}
                  onChange={(e) => setTextGroupViewerQuery(e.target.value)}
                  placeholder="Search title, tags, or body..."
                  className="mt-3 w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium focus:border-blue-500 focus:outline-none"
                />
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
                  <span>Tip:</span>
                  <span>Search supports category + tags.</span>
                </div>
              </div>
            </div>

            {!isUnassigned && (
              <div className="rounded-2xl border-2 border-gray-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Sections</p>
                    <h3 className="text-lg font-bold text-gray-900">Organize within the group</h3>
                  </div>
                  <button
                    onClick={() => openSectionEditor(undefined, selectedViewerGroup.id)}
                    className="rounded-xl border-2 border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:border-blue-300"
                  >
                    New section
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => setTextGroupViewerSectionId('')}
                    className={`rounded-full border-2 px-3 py-1 text-xs font-semibold ${
                      textGroupViewerSectionId === ''
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    All sections ({totalItems})
                  </button>
                  <button
                    onClick={() => openTextGroupSection(UNASSIGNED_SECTION_ID)}
                    className={`rounded-full border-2 px-3 py-1 text-xs font-semibold ${
                      textGroupViewerSectionId === UNASSIGNED_SECTION_ID
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Unassigned ({groupViewerUnassignedSectionCount})
                  </button>
                  {groupViewerSections.map(section => {
                    const stats = textSectionStatsById.get(section.id);
                    return (
                      <button
                        key={section.id}
                        onClick={() => openTextGroupSection(section.id)}
                        className={`rounded-full border-2 px-3 py-1 text-xs font-semibold ${
                          textGroupViewerSectionId === section.id
                            ? 'border-blue-400 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                        title={section.description || section.name}
                      >
                        {section.name} ({stats?.total ?? 0})
                      </button>
                    );
                  })}
                </div>

                {groupViewerSections.length === 0 && (
                  <p className="mt-4 text-sm text-gray-500">No sections yet. Add one to organize ideas.</p>
                )}

                {groupViewerSections.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {groupViewerSections.map(section => {
                      const stats = textSectionStatsById.get(section.id);
                      return (
                        <div key={section.id} className="rounded-xl border-2 border-gray-200 bg-gray-50/60 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{section.name}</div>
                              {section.description && (
                                <div className="text-xs text-gray-500 mt-1">{section.description}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>{stats?.total ?? 0} items</span>
                              <button
                                onClick={() => openTextGroupSection(section.id)}
                                className="text-xs font-semibold text-gray-600 hover:text-gray-900"
                              >
                                Open
                              </button>
                              <button
                                onClick={() => openTextEditor(undefined, selectedViewerGroup.id, section.id)}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                              >
                                Add text
                              </button>
                              <button
                                onClick={() => openSectionEditor(section, selectedViewerGroup.id)}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteSection(section.id)}
                                className="text-xs font-semibold text-gray-400 hover:text-rose-600"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4" ref={textGroupItemsRef}>
              {textGroupViewerSectionId && textGroupViewerSectionId !== UNASSIGNED_SECTION_ID && (
                <div className="rounded-2xl border-2 border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Open section</p>
                      <h3 className="text-lg font-bold text-gray-900">
                        {textSectionLookup.get(textGroupViewerSectionId)?.name ?? 'Section'}
                      </h3>
                      {textSectionLookup.get(textGroupViewerSectionId)?.description && (
                        <p className="text-xs text-gray-500">
                          {textSectionLookup.get(textGroupViewerSectionId)?.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openTextEditor(undefined, selectedViewerGroup.id, textGroupViewerSectionId)}
                        className="rounded-full border-2 border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:border-blue-300"
                      >
                        Add text
                      </button>
                      <button
                        onClick={() => openBulkImport(selectedViewerGroup.id, textGroupViewerSectionId)}
                        className="rounded-full border-2 border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:border-gray-300"
                      >
                        Bulk import
                      </button>
                      <button
                        onClick={() => setTextGroupViewerSectionId('')}
                        className="rounded-full border-2 border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:border-gray-300"
                      >
                        Collapse section
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {filteredGroupViewerItems.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-10 text-center">
                  <p className="text-sm font-semibold text-gray-600">No text items match this filter.</p>
                  <button
                    onClick={() => openTextEditor(
                      undefined,
                      isUnassigned ? undefined : selectedViewerGroup.id,
                      textGroupViewerSectionId && textGroupViewerSectionId !== UNASSIGNED_SECTION_ID
                        ? textGroupViewerSectionId
                        : undefined
                    )}
                    className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Add a text item
                  </button>
                </div>
              ) : hasSectionGrouping ? (
                <>
                  {groupViewerSections.map(section => {
                    const sectionItems = groupedViewerItems.get(section.id) ?? [];
                    if (sectionItems.length === 0) return null;
                    return (
                      <div key={section.id} className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-base font-bold text-gray-900">{section.name}</h3>
                            {section.description && (
                              <p className="text-xs text-gray-500">{section.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                              {sectionItems.length} items
                            </span>
                            <button
                              onClick={() => openTextEditor(undefined, selectedViewerGroup.id, section.id)}
                              className="rounded-full border-2 border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:border-blue-300"
                            >
                              Add text
                            </button>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {sectionItems.map(renderGroupViewerItem)}
                        </div>
                      </div>
                    );
                  })}
                  {groupViewerUnassignedSectionCount > 0 && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-base font-bold text-gray-900">Unassigned</h3>
                          <p className="text-xs text-gray-500">Items without a section.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                            {groupViewerUnassignedSectionCount} items
                          </span>
                          {!isUnassigned && (
                            <button
                              onClick={() => openTextEditor(undefined, selectedViewerGroup.id)}
                              className="rounded-full border-2 border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:border-gray-300"
                            >
                              Add text
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {(groupedViewerItems.get(UNASSIGNED_SECTION_ID) ?? []).map(renderGroupViewerItem)}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                filteredGroupViewerItems.map(renderGroupViewerItem)
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderEventModal = () => {
    if (!eventModalOpen || !selectedEvent) return null;

    const timing = getEventTiming(selectedEvent);
    const daysUntil = timing.daysUntil;
    const isOngoing = timing.isOngoing;
    const approvedCount = eventStatusCounts.APPROVED;
    const progress = (approvedCount / selectedEvent.totalTarget) * 100;
    const statusTotals = ASSET_STATUSES.map(status => ({
      status,
      count: eventStatusCounts[status]
    }));
    const downloadLabel = downloadState
      ? `Downloading ${downloadState.current}/${downloadState.total}`
      : `Download approved (${approvedEventAssets.length})`;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={closeEventModal}
      >
        <div
          className={`bg-white shadow-2xl modal-pop flex flex-col ${
            eventModalExpanded
              ? 'w-full h-full rounded-none'
              : 'w-full max-w-6xl max-h-[85vh] rounded-2xl'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Event overview</p>
              <h2 className="text-2xl font-bold text-gray-900">{selectedEvent.name}</h2>
              <div className="mt-1 text-sm text-gray-500">
                {new Date(selectedEvent.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                <span className="ml-3 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                  {isOngoing ? 'Ongoing' : (daysUntil < 0 ? 'Past' : `${daysUntil} days out`)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentRole === 'creator' && (
                <button
                  onClick={() => startUploadForEvent(selectedEvent.id)}
                  className="rounded-xl border-2 border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 hover:border-blue-400 hover:text-blue-700"
                >
                  Batch upload to event
                </button>
              )}
              <button
                onClick={() => openEventEditor(selectedEvent)}
                className="rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-800"
              >
                Edit event
              </button>
              {approvedEventAssets.length > 0 && (
                <button
                  onClick={() => void handleDownloadApproved()}
                  disabled={Boolean(downloadState)}
                  className="rounded-xl border-2 border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:border-blue-300 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {downloadLabel}
                </button>
              )}
              <button
                onClick={() => setEventModalExpanded(prev => !prev)}
                className="rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-800"
              >
                {eventModalExpanded ? 'Exit full screen' : 'Full screen'}
              </button>
              <button
                onClick={closeEventModal}
                className="rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-800"
              >
                Close
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
              <div className="rounded-2xl border-2 border-gray-200 bg-gray-50/80 p-5">
                <div className="flex items-center justify-between text-sm font-semibold text-gray-600">
                  <span>Approved progress</span>
                  <span className="text-gray-900">{approvedCount} / {selectedEvent.totalTarget}</span>
                </div>
                <div className="mt-3 h-3 w-full rounded-full bg-gray-200">
                  <div
                    className="h-3 rounded-full bg-blue-600 transition-all"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 text-sm text-gray-500">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Tier</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">Tier {selectedEvent.tier}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border-2 border-gray-200 bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Status split</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {statusTotals.map(({ status, count }) => (
                    <button
                      key={status}
                      onClick={() => setEventStatusFilter(status)}
                      className={`flex items-center justify-between rounded-xl border-2 px-3 py-2 text-left ${
                        eventStatusFilter === status
                          ? 'border-blue-400 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="font-semibold">{STATUS_LABELS[status]}</span>
                      <span className="text-xs font-bold">{count}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setEventStatusFilter('')}
                    className={`col-span-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold ${
                      eventStatusFilter === ''
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    All assets ({eventAssets.length})
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">
                  {filteredEventAssets.length} assets
                </h3>
                {eventStatusFilter && (
                  <button
                    onClick={() => setEventStatusFilter('')}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Clear filter
                  </button>
                )}
              </div>

              {filteredEventAssets.length === 0 ? (
                <div className="mt-6 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-10 text-center">
                  <p className="text-sm font-semibold text-gray-600">No assets for this event yet.</p>
                  {currentRole === 'creator' && (
                    <button
                      onClick={() => startUploadForEvent(selectedEvent.id)}
                      className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Upload the first asset
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredEventAssets.map(asset => {
                    const fileLabel = asset.mediaType === 'video/mp4'
                      ? 'MP4'
                      : asset.mediaType === 'image/gif'
                      ? 'GIF'
                      : 'No media';
                    return (
                      <div
                        key={asset.id}
                        className="rounded-2xl border-2 border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-lg transition-all cursor-pointer"
                        onClick={() => {
                          openAssetDetail(asset.id, filteredEventAssets);
                          closeEventModal();
                        }}
                      >
                        <AssetPreview asset={asset} className="h-36 w-full rounded-xl" />
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-900 truncate">{asset.title}</p>
                            <StatusBadge status={asset.status} />
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{getToneMeta(asset.skinTone).name}</span>
                            <span>{fileLabel}</span>
                          </div>
                          {!asset.mediaUrl && asset.mediaStorage === 'object' && (
                            <p className="text-xs text-amber-600">Preview needs re-upload.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Text groups</h3>
                  <p className="text-sm text-gray-500">Prompt ideas and copy linked to this event.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openTextGroupView(undefined, selectedEvent.id)}
                    className="rounded-xl border-2 border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-gray-300"
                  >
                    View all text
                  </button>
                  <button
                    onClick={() => openGroupEditor(undefined, selectedEvent.id)}
                    className="rounded-xl border-2 border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:border-blue-300"
                  >
                    New text group
                  </button>
                </div>
              </div>

              {selectedEventTextGroups.length === 0 ? (
                <div className="mt-4 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
                  <p className="text-sm font-semibold text-gray-600">No text groups linked yet.</p>
                  <button
                    onClick={() => openGroupEditor(undefined, selectedEvent.id)}
                    className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Create the first group
                  </button>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {selectedEventTextGroups.map(group => {
                    const stats = textGroupStatsById.get(group.id);
                    return (
                      <div
                        key={group.id}
                        className="rounded-2xl border-2 border-gray-200 bg-white p-4 transition-all hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer"
                        onClick={() => openTextGroupViewer(group.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-base font-bold text-gray-900">{group.name}</h4>
                            <p className="text-xs text-gray-500">{group.description || 'No description yet.'}</p>
                          </div>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteGroup(group.id);
                            }}
                            className="text-xs font-semibold text-gray-400 hover:text-rose-600"
                          >
                            Delete
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-gray-600">
                          <span className="rounded-full bg-gray-100 px-2 py-1">
                            {stats?.total ?? 0} items
                          </span>
                          {ASSET_STATUSES.map(status => (
                            <span key={status} className="rounded-full bg-gray-100 px-2 py-1">
                              {STATUS_LABELS[status]} {stats?.statuses[status] ?? 0}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              openTextGroupViewer(group.id);
                            }}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            Open group
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              openTextEditor(undefined, group.id);
                            }}
                            className="rounded-lg border-2 border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:border-blue-300"
                          >
                            Add text
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              openGroupEditor(group, selectedEvent.id);
                            }}
                            className="rounded-lg border-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-300"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="rounded-2xl border-2 border-gray-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-gray-600">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!activeUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border-2 border-blue-100 bg-white p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl"></div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">GIF YOU</h1>
              <p className="text-xs text-gray-500 font-medium">Sign-Off System</p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-gray-900">Sign in</h2>
          <p className="text-sm text-gray-500 mt-1">
            Sign in with your team email + password.
          </p>

          <div className="mt-6 space-y-4">
            <input
              type="email"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="you@team.com"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />
            <input
              type="password"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
            {authError && (
              <p className="text-sm text-rose-600 font-semibold">{authError}</p>
            )}
            {authMessage && (
              <p className="text-sm text-blue-600 font-semibold">{authMessage}</p>
            )}
            <div className="space-y-2">
              <button
                onClick={() => void handlePasswordSignIn()}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Sign in
              </button>
              <p className="text-xs text-gray-500">
                Need a password? Set it in Supabase &gt; Authentication &gt; Users.
              </p>
            </div>
            {isDevMode && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                <div className="flex items-center justify-between gap-3">
                  <span>Local demo session (dev only)</span>
                  <button
                    onClick={handleDevAccess}
                    className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-gray-400"
                  >
                    Use local access
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b-2 border-gray-200 shadow-sm md:sticky md:top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl"></div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">GIF YOU</h1>
                  <span className="text-xs text-gray-500 font-medium">Sign-Off System</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <div className="text-[11px] font-semibold text-gray-500 md:text-xs md:max-w-[220px] truncate">
                Signed in as {activeUser?.email ?? 'team member'}
              </div>
              <select 
                className="px-4 py-2 border-2 border-gray-200 rounded-xl text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors w-full md:w-auto"
                value={currentRole}
                onChange={(e) => setCurrentRole(e.target.value as Role)}
                disabled={roleLocked}
              >
                <option value="creator">Creator View</option>
                <option value="reviewer">Reviewer View</option>
              </select>
              {roleLocked && (
                <span className="text-[11px] font-semibold text-gray-400">Role locked</span>
              )}
              
              <button
                onClick={() => setNotificationsOpen(true)}
                className="px-4 py-2 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-800 transition-colors w-full md:w-auto"
              >
                Notifications
              </button>
              <button
                onClick={() => void handleSignOut()}
                className="px-4 py-2 border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-gray-300 hover:text-gray-800 transition-colors w-full md:w-auto"
              >
                Sign out
              </button>
              
              {currentRole === 'creator' && (
                <button 
                  onClick={() => {
                    setBatchUploadMode(false);
                    setSingleUploadMode(false);
                    setUploadModal(true);
                  }}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-colors shadow-sm w-full md:w-auto"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload</span>
                </button>
              )}
            </div>
          </div>

          <nav className="mt-4 flex gap-2 overflow-x-auto pb-2 md:pb-0">
            <NavButton 
              active={currentView === 'dashboard'} 
              onClick={() => setCurrentView('dashboard')}
            >
              Dashboard
            </NavButton>
            <NavButton 
              active={currentView === 'queue'} 
              onClick={() => setCurrentView('queue')}
            >
              Review Queue
            </NavButton>
            <NavButton 
              active={currentView === 'events'} 
              onClick={() => setCurrentView('events')}
            >
              Events
            </NavButton>
            <NavButton
              active={currentView === 'text-signoff'}
              onClick={() => setCurrentView('text-signoff')}
            >
              Text Sign-Off
            </NavButton>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 page-fade">
        {dataLoading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <div className="rounded-2xl border-2 border-blue-100 bg-white px-6 py-5 text-center shadow-sm">
              <p className="text-sm font-semibold text-gray-600">Loading shared workspace...</p>
            </div>
          </div>
        ) : (
          <>
            {(assetsSyncError || textSyncError) && (
              <div className="mb-4 space-y-2">
                {assetsSyncError && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {assetsSyncError}
                  </div>
                )}
                {textSyncError && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {textSyncError}
                  </div>
                )}
              </div>
            )}
            {currentView === 'dashboard' && renderDashboardView()}
            {currentView === 'queue' && renderReviewQueueView()}
            {currentView === 'events' && renderEventsView()}
            {currentView === 'text-signoff' && renderTextSignOffView()}
            {currentView === 'asset-detail' && renderAssetDetailView()}
          </>
        )}
      </main>

      {/* Upload Modal */}
      {uploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-bold">Upload Assets</h2>
                <button
                  onClick={() => {
                    setBatchUploadMode(prev => {
                      const next = !prev;
                      if (next) setSingleUploadMode(false);
                      return next;
                    });
                  }}
                  className={`rounded-full border-2 px-3 py-1 text-xs font-semibold transition-colors ${
                    batchUploadMode
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {batchUploadMode ? 'Quick batch on' : 'Quick batch off'}
                </button>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {batchUploadMode
                  ? 'Skip details now and organize after the upload.'
                  : 'Add details now or switch to quick batch.'}
              </p>
              {!batchUploadMode && (
                <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-gray-600">
                  <span className="uppercase tracking-[0.2em] text-gray-400">Mode</span>
                  <button
                    onClick={() => setSingleUploadMode(true)}
                    className={`rounded-full border-2 px-2.5 py-1 ${
                      singleUploadMode
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    Single
                  </button>
                  <button
                    onClick={() => setSingleUploadMode(false)}
                    className={`rounded-full border-2 px-2.5 py-1 ${
                      !singleUploadMode
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    Multi
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {!batchUploadMode && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Title (optional)</label>
                  <input 
                    type="text"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                    value={newAsset.title}
                    onChange={(e) => setNewAsset({...newAsset, title: e.target.value})}
                    placeholder="Asset title"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Event *</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {upcomingEventChoices.map(event => {
                    const selected = newAsset.eventId === event.id;
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => setNewAsset({ ...newAsset, eventId: event.id })}
                        className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
                          selected
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-700 hover:border-blue-200'
                        }`}
                      >
                        <div className="text-sm font-semibold">{event.name}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(event.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {event.isOngoing ? 'Ongoing' : `${event.daysUntil}d`}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-gray-400">All events</span>
                  <select
                    className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-sm"
                    value={newAsset.eventId}
                    onChange={(e) => setNewAsset({ ...newAsset, eventId: e.target.value })}
                  >
                    <option value="">Select event</option>
                    {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              </div>

              {batchUploadMode ? (
                <div className="rounded-xl border-2 border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  Batch mode uploads one item per file and tags it as “All tones” (no duplicates). You can refine tones later.
                  <button
                    type="button"
                    onClick={() => setBatchUploadMode(false)}
                    className="ml-2 underline text-blue-800"
                  >
                    Choose tones now
                  </button>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Skin Tones *</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setNewAsset(prev => ({
                        ...prev,
                        skinTones: allTonesSelected ? [] : SKIN_TONES.map(tone => tone.id)
                      }))}
                      className={`rounded-full border-2 px-3 py-1 text-xs font-semibold transition-colors ${
                        allTonesSelected
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      All tones
                    </button>
                    {newAsset.skinTones.length > 0 && !allTonesSelected && (
                      <span className="text-xs text-gray-500 self-center">
                        {newAsset.skinTones.length} selected
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {SKIN_TONES.map(tone => {
                      const selected = newAsset.skinTones.includes(tone.id);
                      return (
                        <button
                          key={tone.id}
                          type="button"
                          onClick={() => setNewAsset(prev => {
                            const exists = prev.skinTones.includes(tone.id);
                            const skinTones = exists
                              ? prev.skinTones.filter(id => id !== tone.id)
                              : [...prev.skinTones, tone.id];
                            return { ...prev, skinTones };
                          })}
                          className={`flex flex-col items-center gap-2 min-w-[70px] rounded-xl border-2 px-3 py-2 transition-all ${
                            selected
                              ? 'border-gray-900 text-gray-900'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          <span
                            className={`h-10 w-10 rounded-full shadow-inner ${selected ? 'ring-2 ring-gray-900 ring-offset-2' : 'ring-1 ring-white/60'}`}
                            style={{ backgroundColor: tone.color }}
                          ></span>
                          <span className="text-[11px] font-semibold leading-tight text-center">{tone.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <label className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer block">
                <input
                  type="file"
                  accept="image/gif,video/mp4"
                  multiple={!singleUploadMode}
                  className="hidden"
                  onChange={(e) => setNewAsset({ ...newAsset, files: Array.from(e.target.files ?? []) })}
                />
                <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                <p className="text-sm font-medium text-gray-600">
                  {newAsset.files.length > 0 ? `${newAsset.files.length} file(s) ready` : 'Click to browse for files'}
                </p>
                <p className="text-xs text-gray-400 mt-1">GIF or MP4; select multiple files for batch uploads</p>
                {!R2_PUBLIC_BASE_URL && (
                  <p className="text-xs text-amber-600 mt-2">
                    Cloud storage is required. Configure R2 to upload for the team.
                  </p>
                )}
                {R2_PUBLIC_BASE_URL && !session?.access_token && (
                  <p className="text-xs text-amber-600 mt-2">
                    Sign in to enable cloud uploads for the team.
                  </p>
                )}
                {newAsset.files.length > 0 && (
                  <div className="mt-4 space-y-1 text-xs text-gray-500">
                    {newAsset.files.slice(0, 4).map(file => (
                      <div key={file.name} className="flex items-center justify-between">
                        <span className="truncate">{file.name}</span>
                        <span className="ml-2 shrink-0">{formatBytes(file.size)}</span>
                      </div>
                    ))}
                    {newAsset.files.length > 4 && (
                      <div className="text-[11px] text-gray-400">+{newAsset.files.length - 4} more files</div>
                    )}
                  </div>
                )}
              </label>
            </div>

            <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex gap-3">
              <button 
                  onClick={() => {
                    setUploadModal(false);
                    setBatchUploadMode(false);
                    setSingleUploadMode(false);
                    setNewAsset({ title: '', eventId: '', skinTones: [], files: [] });
                  }}
                className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => void handleUpload()}
                disabled={isUploading || !newAsset.eventId || newAsset.files.length === 0 || (!batchUploadMode && newAsset.skinTones.length === 0)}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {isUploading ? 'Uploading...' : `Upload ${newAsset.files.length > 1 ? `${newAsset.files.length} files` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {textModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">
                  {editingTextId ? 'Edit text item' : 'New text item'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Add ideas, prompts, or copy drafts for review.
                </p>
              </div>
              <button
                onClick={closeTextEditor}
                className="rounded-lg border-2 border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 hover:border-gray-300"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Title</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  value={textDraft.title}
                  onChange={(e) => setTextDraft({ ...textDraft, title: e.target.value })}
                  placeholder="Short, descriptive title"
                />
              </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Category</label>
                  <input
                    list="text-category-options"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                    value={textDraft.category}
                    onChange={(e) => setTextDraft({ ...textDraft, category: e.target.value })}
                    placeholder="Idea, Prompt, Copy..."
                  />
                  <datalist id="text-category-options">
                    {textCategoryOptions.map(category => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Tags</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                      value={textDraft.tags}
                      onChange={(e) => setTextDraft({ ...textDraft, tags: e.target.value })}
                      placeholder="comma separated"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {textTagPresets.map(tag => {
                        const selected = parsedTextDraftTags.some(entry => normalizeTagValue(entry) === tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTextDraftTag(tag)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                              selected
                                ? getTagBadgeClass(tag)
                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Text group</label>
                <select
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  value={textDraft.groupId}
                  onChange={(e) => setTextDraft({ ...textDraft, groupId: e.target.value, sectionId: '' })}
                >
                  <option value="">Unassigned</option>
                  {sortedTextGroups.map(group => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
                {selectedDraftGroup?.eventId && (
                  <p className="mt-2 text-xs text-blue-600">
                    Linked to {eventLookup.get(selectedDraftGroup.eventId)?.name ?? 'event'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Section</label>
                <select
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors disabled:bg-gray-50"
                  value={textDraft.sectionId}
                  onChange={(e) => setTextDraft({ ...textDraft, sectionId: e.target.value })}
                  disabled={!textDraft.groupId}
                >
                  <option value="">Unassigned</option>
                  {draftGroupSections.map(section => (
                    <option key={section.id} value={section.id}>{section.name}</option>
                  ))}
                </select>
                {textDraft.groupId && draftGroupSections.length === 0 && (
                  <p className="mt-2 text-xs text-gray-500">No sections yet. Add one in the group view.</p>
                )}
                {selectedDraftSection && (
                  <p className="mt-2 text-xs text-gray-500">{selectedDraftSection.description}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Text</label>
                <textarea
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  rows={8}
                  value={textDraft.body}
                  onChange={(e) => setTextDraft({ ...textDraft, body: e.target.value })}
                  placeholder="Drop the full idea, prompt list, or copy draft here..."
                />
              </div>

              {editingTextId && (
                <div className="rounded-xl border-2 border-gray-200 bg-gray-50/60 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900">Activity & comments</h3>
                    <span className="text-xs text-gray-500">
                      {selectedTextActivity.length} entries
                    </span>
                  </div>

                  {selectedTextActivity.length === 0 ? (
                    <p className="text-sm text-gray-500">No activity yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedTextActivity.map(entry => (
                        <div key={entry.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                          <div className="flex items-center justify-between text-[11px] text-gray-500">
                            <span className="font-semibold text-gray-700">{entry.actor}</span>
                            <span>{formatActivityTime(entry.timestamp)}</span>
                          </div>
                          <div className="mt-1 text-sm text-gray-700">{describeActivity(entry)}</div>
                          {entry.comment && (
                            <div className="mt-2 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600">
                              {entry.comment}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <textarea
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                      rows={3}
                      value={textCommentDraft}
                      onChange={(e) => setTextCommentDraft(e.target.value)}
                      placeholder="Add a comment for this text item..."
                    />
                    <button
                      onClick={() => {
                        addCommentActivity('text', editingTextId, textCommentDraft);
                        setTextCommentDraft('');
                      }}
                      disabled={!textCommentDraft.trim()}
                      className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Add comment
                    </button>
                  </div>
                </div>
              )}

              {currentRole === 'reviewer' && (
                <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Review status</label>
                    <select
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors"
                      value={textDraft.status}
                      onChange={(e) => setTextDraft({ ...textDraft, status: e.target.value as AssetStatus })}
                    >
                      {ASSET_STATUSES.map(status => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(textDraft.status === 'HOLD' || textDraft.status === 'REJECTED') && (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        {textDraft.status === 'HOLD' ? 'Refinement notes *' : 'Rejection reason *'}
                      </label>
                      <textarea
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                        rows={3}
                        value={textDraft.reviewNotes}
                        onChange={(e) => setTextDraft({ ...textDraft, reviewNotes: e.target.value })}
                        placeholder={textDraft.status === 'HOLD' ? 'What needs to change?' : 'Why was it rejected?'}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeTextEditor}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveText}
                  disabled={isSavingText}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isSavingText ? 'Saving...' : (editingTextId ? 'Save changes' : 'Create item')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {groupModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-8 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">
                  {editingGroupId ? 'Edit text group' : 'New text group'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Organize prompt batches or copy ideas into folders.
                </p>
              </div>
              <button
                onClick={closeGroupEditor}
                className="rounded-lg border-2 border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 hover:border-gray-300"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Group name *</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  value={groupDraft.name}
                  onChange={(e) => setGroupDraft({ ...groupDraft, name: e.target.value })}
                  placeholder="Christmas prompts"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                <textarea
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  rows={3}
                  value={groupDraft.description}
                  onChange={(e) => setGroupDraft({ ...groupDraft, description: e.target.value })}
                  placeholder="What is this group for?"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Link to event (optional)</label>
                <select
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  value={groupDraft.eventId}
                  onChange={(e) => setGroupDraft({ ...groupDraft, eventId: e.target.value })}
                >
                  <option value="">No event</option>
                  {events.map(event => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeGroupEditor}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveGroup}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-colors"
                >
                  {editingGroupId ? 'Save group' : 'Create group'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sectionModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-8 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">
                  {editingSectionId ? 'Edit section' : 'New section'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Break a text group into smaller lists.
                </p>
              </div>
              <button
                onClick={closeSectionEditor}
                className="rounded-lg border-2 border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 hover:border-gray-300"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Section name *</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  value={sectionDraft.name}
                  onChange={(e) => setSectionDraft({ ...sectionDraft, name: e.target.value })}
                  placeholder="Christmas Eve Ideas"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                <textarea
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  rows={3}
                  value={sectionDraft.description}
                  onChange={(e) => setSectionDraft({ ...sectionDraft, description: e.target.value })}
                  placeholder="Optional context for this section"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Text group *</label>
                <select
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  value={sectionDraft.groupId}
                  onChange={(e) => setSectionDraft({ ...sectionDraft, groupId: e.target.value })}
                >
                  <option value="">Select a group</option>
                  {sortedTextGroups.map(group => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeSectionEditor}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSection}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-colors"
                >
                  {editingSectionId ? 'Save section' : 'Create section'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {notificationsOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-8 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Notifications</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Configure Slack alerts for review status changes.
                </p>
              </div>
              <button
                onClick={() => setNotificationsOpen(false)}
                className="rounded-lg border-2 border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 hover:border-gray-300"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={notificationSettings.enabled}
                  onChange={(e) => setNotificationSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                />
                Enable notifications
              </label>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Slack webhook URL</label>
                <input
                  id="slack-webhook-url"
                  name="slackWebhookUrl"
                  type="url"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  value={notificationSettings.slackWebhookUrl}
                  onChange={(e) => setNotificationSettings(prev => ({ ...prev, slackWebhookUrl: e.target.value }))}
                  placeholder="https://hooks.slack.com/services/..."
                />
                <p className="mt-2 text-xs text-gray-500">
                  Uses a Slack incoming webhook and is sent from the server (no browser CORS issues).
                </p>
                {notificationSettings.slackWebhookUrl.trim().length > 0 && !isLikelySlackWebhook(notificationSettings.slackWebhookUrl) && (
                  <p className="mt-2 text-xs text-rose-600">
                    Invalid format. This must be a Slack Incoming Webhook URL, not a channel link.
                  </p>
                )}
                <button
                  onClick={() => void handleSlackTest()}
                  disabled={
                    isTestingSlack
                    || !notificationSettings.enabled
                    || !notificationSettings.slackWebhookUrl.trim()
                    || !isLikelySlackWebhook(notificationSettings.slackWebhookUrl)
                  }
                  className="mt-3 rounded-lg border-2 border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isTestingSlack ? 'Sending test...' : 'Send test message'}
                </button>
              </div>

              <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4 space-y-3">
                <p className="text-sm font-bold text-gray-900">Trigger settings</p>
                <label className="flex items-center gap-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={notificationSettings.notifyOnNew}
                    onChange={(e) => setNotificationSettings(prev => ({ ...prev, notifyOnNew: e.target.checked }))}
                  />
                  New items need review
                </label>
                <label className="flex items-center gap-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={notificationSettings.notifyOnApproved}
                    onChange={(e) => setNotificationSettings(prev => ({ ...prev, notifyOnApproved: e.target.checked }))}
                  />
                  Approved
                </label>
                <label className="flex items-center gap-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={notificationSettings.notifyOnHold}
                    onChange={(e) => setNotificationSettings(prev => ({ ...prev, notifyOnHold: e.target.checked }))}
                  />
                  Hold
                </label>
                <label className="flex items-center gap-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={notificationSettings.notifyOnRejected}
                    onChange={(e) => setNotificationSettings(prev => ({ ...prev, notifyOnRejected: e.target.checked }))}
                  />
                  Rejected
                </label>
              </div>

              <button
                onClick={() => setNotificationsOpen(false)}
                className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {eventEditorOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-8 max-w-xl w-full shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">
                  {editingEventId ? 'Edit event' : 'New event'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Update event dates and asset goals.
                </p>
              </div>
              <button
                onClick={closeEventEditor}
                className="rounded-lg border-2 border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 hover:border-gray-300"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Event name *</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  value={eventDraft.name}
                  onChange={(e) => setEventDraft({ ...eventDraft, name: e.target.value })}
                  placeholder="Christmas"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Start date *</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                    value={eventDraft.startDate}
                    onChange={(e) => setEventDraft({ ...eventDraft, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">End date</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                    value={eventDraft.endDate}
                    onChange={(e) => setEventDraft({ ...eventDraft, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Total goal *</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                    value={eventDraft.totalTarget}
                    onChange={(e) => setEventDraft({ ...eventDraft, totalTarget: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Tier *</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                    value={eventDraft.tier}
                    onChange={(e) => setEventDraft({ ...eventDraft, tier: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                <textarea
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  rows={3}
                  value={eventDraft.description}
                  onChange={(e) => setEventDraft({ ...eventDraft, description: e.target.value })}
                  placeholder="Optional notes for this event"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeEventEditor}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEvent}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-colors"
                >
                  {editingEventId ? 'Save event' : 'Create event'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {bulkImportOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl p-8 max-w-3xl w-full shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Bulk import text</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Paste one idea per line or separate blocks with blank lines.
                </p>
              </div>
              <button
                onClick={closeBulkImport}
                className="rounded-lg border-2 border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 hover:border-gray-300"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Ideas to import
                </label>
                <textarea
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  rows={10}
                  value={bulkImportDraft.text}
                  onChange={(e) => setBulkImportDraft({ ...bulkImportDraft, text: e.target.value })}
                  placeholder="Example:&#10;Holiday prompt ideas - Warm, cozy winter scenes&#10;Playful snowball fight concept&#10;&#10;Multi-line idea title&#10;Detail line 1&#10;Detail line 2"
                />
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                  <span>{bulkImportCount} items detected.</span>
                  <span>Use separators like &quot;Title - body&quot; or &quot;Title :: body&quot;.</span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Category</label>
                  <input
                    list="bulk-category-options"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                    value={bulkImportDraft.category}
                    onChange={(e) => setBulkImportDraft({ ...bulkImportDraft, category: e.target.value })}
                    placeholder="Idea, Prompt, Copy..."
                  />
                  <datalist id="bulk-category-options">
                    {textCategoryOptions.map(category => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </div>
                <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Tags</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  value={bulkImportDraft.tags}
                  onChange={(e) => setBulkImportDraft({ ...bulkImportDraft, tags: e.target.value })}
                  placeholder="comma separated"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {textTagPresets.map(tag => {
                    const selected = bulkImportDraft.tags
                      .split(',')
                      .map(entry => entry.trim())
                      .filter(Boolean)
                      .some(entry => normalizeTagValue(entry) === tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleBulkTag(tag)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          selected
                            ? getTagBadgeClass(tag)
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Text group</label>
                <select
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                  value={bulkImportDraft.groupId}
                  onChange={(e) => setBulkImportDraft({ ...bulkImportDraft, groupId: e.target.value, sectionId: '' })}
                >
                  <option value="">Unassigned</option>
                  {sortedTextGroups.map(group => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Section</label>
                <select
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors disabled:bg-gray-50"
                  value={bulkImportDraft.sectionId}
                  onChange={(e) => setBulkImportDraft({ ...bulkImportDraft, sectionId: e.target.value })}
                  disabled={!bulkImportDraft.groupId}
                >
                  <option value="">Unassigned</option>
                  {bulkGroupSections.map(section => (
                    <option key={section.id} value={section.id}>{section.name}</option>
                  ))}
                </select>
                {bulkImportDraft.groupId && bulkGroupSections.length === 0 && (
                  <p className="mt-2 text-xs text-gray-500">No sections yet. Add one in the group view.</p>
                )}
              </div>

              {currentRole === 'reviewer' && (
                <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Review status</label>
                    <select
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-medium focus:border-blue-500 focus:outline-none transition-colors"
                      value={bulkImportDraft.status}
                      onChange={(e) => setBulkImportDraft({ ...bulkImportDraft, status: e.target.value as AssetStatus })}
                    >
                      {ASSET_STATUSES.map(status => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(bulkImportDraft.status === 'HOLD' || bulkImportDraft.status === 'REJECTED') && (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        {bulkImportDraft.status === 'HOLD' ? 'Refinement notes *' : 'Rejection reason *'}
                      </label>
                      <textarea
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                        rows={3}
                        value={bulkImportDraft.reviewNotes}
                        onChange={(e) => setBulkImportDraft({ ...bulkImportDraft, reviewNotes: e.target.value })}
                        placeholder={bulkImportDraft.status === 'HOLD' ? 'What needs to change?' : 'Why was it rejected?'}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeBulkImport}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkImport}
                  disabled={bulkImportCount === 0}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  Import {bulkImportCount > 0 ? `${bulkImportCount} items` : 'items'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {renderTextGroupViewer()}
      {renderEventModal()}
    </div>
  );
};

const AssetPreview = ({
  asset,
  className,
  large
}: {
  asset: UiAsset;
  className?: string;
  large?: boolean;
}) => {
  const wrapperClassName = className ? ` ${className}` : '';

  if (asset.mediaUrl) {
    if (asset.mediaType?.startsWith('video')) {
      return (
        <video
          src={asset.mediaUrl}
          className={`h-full w-full object-contain bg-gray-50${wrapperClassName}`}
          muted={!large}
          loop
          playsInline
          autoPlay={!large}
          controls={Boolean(large)}
        />
      );
    }

    return (
      <div className={`relative overflow-hidden bg-gray-50${wrapperClassName}`}>
        <Image
          src={asset.mediaUrl}
          alt={asset.title}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-contain"
          unoptimized
        />
      </div>
    );
  }

  return (
    <div
      className={wrapperClassName.trim() || undefined}
      style={{ backgroundColor: asset.previewColor }}
    />
  );
};

const NavButton = ({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`whitespace-nowrap px-4 py-2 md:px-5 md:py-2.5 rounded-xl text-sm font-bold transition-all ${
      active 
        ? 'bg-blue-600 text-white shadow-sm' 
        : 'text-gray-600 hover:bg-gray-100'
    }`}
  >
    {children}
  </button>
);

const StatusBadge = ({ status }: { status: AssetStatus }) => (
  <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold border-2 ${STATUS_STYLES[status]}`}>
    {STATUS_LABELS[status]}
  </span>
);

export default App;


