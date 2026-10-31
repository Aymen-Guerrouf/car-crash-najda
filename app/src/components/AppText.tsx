import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useDir } from '../i18n/strings';
import { colors, FONT_FAMILY, size, type Weight } from '../theme/tokens';

type Variant = keyof typeof size;

interface Props {
  children: ReactNode;
  variant?: Variant;
  weight?: Weight;
  color?: string;
  center?: boolean;
  underline?: boolean;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}

/** Text with the right font for the current language and mirrored alignment for Arabic. */
export function AppText({ children, variant = 'body', weight = 'regular', color = colors.text, center, underline, numberOfLines, style }: Props) {
  const { language, align, rtl } = useDir();
  const fontSize = size[variant];
  // Headlines in the design are set tight; Arabic glyphs need more vertical room than Latin
  const tight = variant === 'display' || variant === 'h1';
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          color,
          fontSize,
          fontFamily: FONT_FAMILY[language][weight],
          lineHeight: Math.round(fontSize * (rtl ? 1.55 : tight ? 1.18 : 1.4)),
          textAlign: center ? 'center' : align,
          writingDirection: rtl ? 'rtl' : 'ltr',
        },
        underline && { textDecorationLine: 'underline' },
        variant === 'overline' && { letterSpacing: rtl ? 0 : 0.8, textTransform: rtl ? 'none' : 'uppercase' },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
