import { Button, type ButtonSize } from './Button';

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  size = 'md',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: ButtonSize;
}) {
  return <Button label={label} onPress={onPress} disabled={disabled} size={size} variant="outline" tone="grey" shape="pill" />;
}
