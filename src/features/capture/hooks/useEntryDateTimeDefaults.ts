import { useCallback, useEffect, useState } from 'react';

import { formatDateForEntryInput, formatTimeForEntryInput } from '@/foundation/lib/dateTime';

export function useEntryDateTimeDefaults() {
  const [entryDate, setEntryDate] = useState('');
  const [entryTime, setEntryTime] = useState('');

  useEffect(() => {
    const now = new Date();
    setEntryDate(formatDateForEntryInput(now));
    setEntryTime(formatTimeForEntryInput(now));
  }, []);

  const clearDateOnFocus = useCallback(() => {
    setEntryDate('');
  }, []);

  const clearTimeOnFocus = useCallback(() => {
    setEntryTime('');
  }, []);

  return {
    entryDate,
    setEntryDate,
    entryTime,
    setEntryTime,
    clearDateOnFocus,
    clearTimeOnFocus,
  };
}
