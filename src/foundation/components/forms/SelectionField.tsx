import { DateTimeField } from './DateTimeField';

export function SelectionField({ label, onPress }: { label: string; onPress: () => void }) {
  return <DateTimeField label={label} onPress={onPress} />;
}
