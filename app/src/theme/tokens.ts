// Design tokens from the Figma file "Najdaa" (light theme, black pill buttons, Montserrat).
// Colors were measured on the exported frames: bg #F4F0EF, ink #111111, red #D0021B, green #16804A.
export const colors = {
  bg: '#F4F0EF',
  surface: '#FFFFFF',
  surface2: '#EAE5E3',
  surface3: '#DCD5D2',
  border: '#E2DBD8',
  ink: '#111111',
  text: '#111111',
  textMuted: '#55504E',
  textFaint: '#8C8683',
  onDark: '#FFFFFF',
  /** Links ("Passer") */
  info: '#2457E6',
  infoSoft: 'rgba(36,87,230,0.10)',
  ai: '#6D28D9',
  triage: {
    RED: '#D0021B',
    YELLOW: '#F4B400',
    GREEN: '#16804A',
    UNKNOWN: '#6B7280',
  },
  // YELLOW needs dark text for contrast, the others use white
  onTriage: {
    RED: '#FFFFFF',
    YELLOW: '#1A1A1A',
    GREEN: '#FFFFFF',
    UNKNOWN: '#FFFFFF',
  },
  redSoft: 'rgba(208,2,27,0.10)',
  /** "Online" pill background in the design */
  greenSoft: '#DBEFE3',
  yellowSoft: 'rgba(244,180,0,0.18)',
  online: '#0F9D58',
  onlineDot: '#24E881',
  /** "Offline" pill */
  offlineSoft: '#FFCCD2',
  scrim: 'rgba(17,17,17,0.5)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const;

export const radius = { chip: 12, normal: 16, big: 24, pill: 999 } as const;

export const size = { display: 40, h1: 28, h2: 20, body: 16, caption: 13, overline: 12 } as const;

export type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

// Montserrat for Latin (as in the design); IBM Plex Sans Arabic for Arabic, which has no extra-bold cut
export const FONT_FAMILY = {
  fr: {
    regular: 'Montserrat_400Regular',
    medium: 'Montserrat_500Medium',
    semibold: 'Montserrat_600SemiBold',
    bold: 'Montserrat_700Bold',
    extrabold: 'Montserrat_800ExtraBold',
  },
  ar: {
    regular: 'IBMPlexSansArabic_400Regular',
    medium: 'IBMPlexSansArabic_500Medium',
    semibold: 'IBMPlexSansArabic_600SemiBold',
    bold: 'IBMPlexSansArabic_700Bold',
    extrabold: 'IBMPlexSansArabic_700Bold',
  },
} as const;
