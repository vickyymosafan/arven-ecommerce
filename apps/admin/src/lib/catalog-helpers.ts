import type { BadgeTone } from '@arven/ui';

export function slugifyCatalogTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

export function productStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'PUBLISHED':
      return 'success';
    case 'READY_TO_PUBLISH':
      return 'info';
    case 'REVIEW':
      return 'warning';
    case 'ARCHIVED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function collectionStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'PUBLISHED':
      return 'success';
    case 'SCHEDULED':
      return 'info';
    case 'ARCHIVED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function stockStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'IN_STOCK':
      return 'success';
    case 'LOW_STOCK':
      return 'warning';
    case 'OUT_OF_STOCK':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function buildStudioSvgDataUri(title: string, subtitle = 'ARVEN STUDIO ARCHIVE'): string {
  const safeTitle = (title || 'ARVEN GARMENT')
    .replace(/[<>&"']/g, ' ')
    .trim()
    .slice(0, 42);
  const safeSubtitle = subtitle.replace(/[<>&"']/g, ' ').trim().slice(0, 42);
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">',
    '<rect width="900" height="1200" fill="#E9E4DA"/>',
    '<rect x="56" y="56" width="788" height="1088" fill="#F8F7F3" stroke="#17191B" stroke-width="2"/>',
    '<rect x="260" y="250" width="380" height="540" fill="#17191B"/>',
    '<line x1="260" y1="360" x2="640" y2="360" stroke="#C5A572" stroke-width="2"/>',
    `<text x="450" y="910" text-anchor="middle" font-family="Georgia,serif" font-size="30" fill="#17191B">${safeTitle}</text>`,
    `<text x="450" y="955" text-anchor="middle" font-family="monospace" font-size="16" letter-spacing="3" fill="#5E5C54">${safeSubtitle}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
