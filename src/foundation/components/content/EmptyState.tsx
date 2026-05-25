import { AppText } from '@/foundation/components/layout/AppText';

export function EmptyState({ message }: { message: string }) {
  return <AppText>{message}</AppText>;
}
