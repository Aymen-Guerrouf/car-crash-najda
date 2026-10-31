import { Pressable } from 'react-native';
import { colors } from '../theme/tokens';
import { AppText } from './AppText';

interface Props {
  label: string;
  onPress: () => void;
  /** Blue "Passer"-style link instead of the default underlined black one. */
  blue?: boolean;
}

/** Underlined text action under the main button ("Retour", "Passer", "Situation terminée"). */
export function LinkButton({ label, onPress, blue }: Props) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} hitSlop={10} style={{ alignSelf: 'center', paddingVertical: 6 }}>
      <AppText weight="bold" center underline color={blue ? colors.info : colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}
