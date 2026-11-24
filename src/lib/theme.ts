import type {VaultCategory} from './types';

export interface CategoryTheme {
  id: VaultCategory;
  label: string;
  surface: string;
  highlight: string;
  cardBg: string;
  cardBorder: string;
  pillBg: string;
  pillActiveBg: string;
  pillBorder: string;
  pillGlow: string;
  iconBg: string;
  textAccent: string;
  badgeBg: string;
}

export const CATEGORY_THEMES: Record<VaultCategory, CategoryTheme> = {
  notes: {
    id: 'notes',
    label: 'Notes',
    surface: '#8C5327',
    highlight: '#D98A4E',
    cardBg: 'rgba(140, 83, 39, 0.22)',
    cardBorder: 'rgba(217, 138, 78, 0.34)',
    pillBg: 'rgba(140, 83, 39, 0.28)',
    pillActiveBg: 'rgba(140, 83, 39, 0.62)',
    pillBorder: 'rgba(217, 138, 78, 0.65)',
    pillGlow: '0 0 18px rgba(217, 138, 78, 0.28)',
    iconBg: 'rgba(217, 138, 78, 0.18)',
    textAccent: '#E7A773',
    badgeBg: 'rgba(217, 138, 78, 0.2)',
  },
  photos: {
    id: 'photos',
    label: 'Photos',
    surface: '#9E5A3C',
    highlight: '#C97A57',
    cardBg: 'rgba(158, 90, 60, 0.22)',
    cardBorder: 'rgba(201, 122, 87, 0.34)',
    pillBg: 'rgba(158, 90, 60, 0.28)',
    pillActiveBg: 'rgba(158, 90, 60, 0.62)',
    pillBorder: 'rgba(201, 122, 87, 0.65)',
    pillGlow: '0 0 18px rgba(201, 122, 87, 0.28)',
    iconBg: 'rgba(201, 122, 87, 0.18)',
    textAccent: '#DF9878',
    badgeBg: 'rgba(201, 122, 87, 0.2)',
  },
  videos: {
    id: 'videos',
    label: 'Videos',
    surface: '#735D28',
    highlight: '#B89748',
    cardBg: 'rgba(115, 93, 40, 0.22)',
    cardBorder: 'rgba(184, 151, 72, 0.34)',
    pillBg: 'rgba(115, 93, 40, 0.28)',
    pillActiveBg: 'rgba(115, 93, 40, 0.62)',
    pillBorder: 'rgba(184, 151, 72, 0.65)',
    pillGlow: '0 0 18px rgba(184, 151, 72, 0.28)',
    iconBg: 'rgba(184, 151, 72, 0.18)',
    textAccent: '#D3B469',
    badgeBg: 'rgba(184, 151, 72, 0.2)',
  },
  files: {
    id: 'files',
    label: 'Files',
    surface: '#5A6E5C',
    highlight: '#86A389',
    cardBg: 'rgba(90, 110, 92, 0.22)',
    cardBorder: 'rgba(134, 163, 137, 0.34)',
    pillBg: 'rgba(90, 110, 92, 0.28)',
    pillActiveBg: 'rgba(90, 110, 92, 0.62)',
    pillBorder: 'rgba(134, 163, 137, 0.65)',
    pillGlow: '0 0 18px rgba(134, 163, 137, 0.28)',
    iconBg: 'rgba(134, 163, 137, 0.18)',
    textAccent: '#A5C0A8',
    badgeBg: 'rgba(134, 163, 137, 0.2)',
  },
};

export const RESOURCE_CATEGORY_ORDER: VaultCategory[] = ['notes', 'photos', 'videos', 'files'];

export const DRAG_RESOURCE_MIME = 'application/x-beyond-resource';
