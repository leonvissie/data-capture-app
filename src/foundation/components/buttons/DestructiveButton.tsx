import { Button, type ButtonSize, type ButtonVariant } from './Button';

type DestructiveButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
  tone?: 'danger' | 'warning';
};

export function DestructiveButton({
  label,
  onPress,
  disabled = false,
  size = 'md',
  variant = 'solid',
  tone = 'danger',
}: DestructiveButtonProps) {
  return <Button label={label} onPress={onPress} disabled={disabled} size={size} variant={variant} tone={tone === 'warning' ? 'orange' : 'red'} shape="pill" />;
}
