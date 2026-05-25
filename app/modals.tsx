import { AppScreen } from '@/foundation/components/layout/AppScreen';
import { AppText } from '@/foundation/components/layout/AppText';

export default function ModalHost() {
  return (
    <AppScreen>
      <AppText variant="sectionTitle">Modal Sheet Host</AppText>
      <AppText variant="body">Quick add/edit modals will be routed here.</AppText>
    </AppScreen>
  );
}
