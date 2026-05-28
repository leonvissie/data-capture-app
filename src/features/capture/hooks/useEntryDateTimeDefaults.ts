import { useCallback, useEffect, useState } from 'react';

import { formatDateForEntryInput, formatTimeForEntryInput } from '@/foundation/lib/dateTime';

export function useEntryDateTimeDefaults() {
  const [entryDate, setEntryDate] = useState('');
  const [entryTime, setEntryTime] = useState('');
  const [didClearDateDefault, setDidClearDateDefault] = useState(false);
  const [didClearTimeDefault, setDidClearTimeDefault] = useState(false);

  useEffect(() => {
    const now = new Date();
    setEntryDate(formatDateForEntryInput(now));
    setEntryTime(formatTimeForEntryInput(now));
  }, []);

  const clearDateDefaultOnFirstFocus = useCallback(() => {
    if (!didClearDateDefault) {
      setEntryDate('');
      setDidClearDateDefault(true);
    }
  }, [didClearDateDefault]);

  const clearTimeDefaultOnFirstFocus = useCallback(() => {
    if (!didClearTimeDefault) {
      setEntryTime('');
      setDidClearTimeDefault(true);
    }
  }, [didClearTimeDefault]);

  return {
    entryDate,
    setEntryDate,
    entryTime,
    setEntryTime,
    clearDateDefaultOnFirstFocus,
    clearTimeDefaultOnFirstFocus,
  };
}
