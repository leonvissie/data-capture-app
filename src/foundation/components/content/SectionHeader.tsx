import { AppText } from '@/foundation/components/layout/AppText';

export function SectionHeader({ title }: { title: string }) {
  return <AppText variant="sectionTitle">{title}</AppText>;
}
