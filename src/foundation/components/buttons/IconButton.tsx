import { RoundIconButton } from './RoundIconButton';
import type { RoundIconButtonType } from './roundIconButtonTypes';
import type { ButtonSize } from './Button';

export function IconButton({
  buttonType,
  accessibilityLabel,
  onPress,
  size = 'md',
}: {
  buttonType: RoundIconButtonType;
  accessibilityLabel: string;
  onPress: () => void;
  size?: ButtonSize;
}) {
  return <RoundIconButton buttonType={buttonType} accessibilityLabel={accessibilityLabel} onPress={onPress} size={size} />;
}
