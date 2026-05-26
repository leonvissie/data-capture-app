import { Button, type ButtonSize } from './Button';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: ButtonSize;
};

export function PrimaryButton({ label, onPress, disabled, size = 'md' }: PrimaryButtonProps) {
  return <Button label={label} onPress={onPress} disabled={disabled} size={size} variant="solid" tone="teal" shape="pill" />;
}
