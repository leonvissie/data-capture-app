import { Button, type ButtonSize } from './Button';

type DestructiveButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: ButtonSize;
  tone?: 'danger' | 'warning';
};

export function DestructiveButton({
  label,
  onPress,
  disabled = false,
  size = 'md',
  tone = 'danger',
}: DestructiveButtonProps) {
  return <Button label={label} onPress={onPress} disabled={disabled} size={size} variant="solid" tone={tone === 'warning' ? 'orange' : 'red'} shape="pill" />;
}
