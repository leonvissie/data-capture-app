import { PropsWithChildren } from 'react';

import { AppScreen } from './AppScreen';

export function AppModalScreen({ children }: PropsWithChildren) {
  return <AppScreen>{children}</AppScreen>;
}
