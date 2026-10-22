import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createEmptyData } from '@/data/empty';
import type { AppData } from '@/domain/types';
import { reminderRefreshDelay } from '@/services/reminderPlan';
// Metro vybírá nativní nebo webovou implementaci.
// eslint-disable-next-line import/no-unresolved
import { reconcileLocalReminders, requestNotificationPermission } from '@/services/notifications';

export function useLocalReminders(data: AppData | null) {
  const latest = useRef(data);
  const mounted = useRef(false);
  const requestVersion = useRef(0);
  const [reminderWarning,setReminderWarning] = useState<string>();
  const [reminderRefreshBefore,setReminderRefreshBefore] = useState<string>();
  const refreshReminders = useCallback(async (askPermission = false) => {
    if (!mounted.current) return;
    try {
      if (askPermission) await requestNotificationPermission();
      if (!mounted.current || !latest.current) return;
      const version = ++requestVersion.current;
      const result = await reconcileLocalReminders(latest.current);
      if (!mounted.current || version !== requestVersion.current || !result) return;
      setReminderWarning(result.supported && !result.permissionGranted ? 'V nastavení telefonu povolte upozornění pro tuto aplikaci.' : undefined);
      setReminderRefreshBefore(result.refreshBefore);
    } catch {
      if (mounted.current) setReminderWarning('Připomínky se nepodařilo aktualizovat. Zkontrolujte je znovu.');
    }
  },[]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Při odhlášení nesmí v telefonu zůstat plán předchozího účtu.
      void reconcileLocalReminders(createEmptyData()).catch(() => undefined);
    };
  },[]);
  useEffect(() => {
    latest.current = data;
    if (!data) return;
    const timer = setTimeout(() => void refreshReminders(),150);
    return () => clearTimeout(timer);
  },[data,refreshReminders]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const arm = () => {
      if (disposed) return;
      clearTimeout(timer);
      timer = setTimeout(async () => { await refreshReminders(); arm(); },reminderRefreshDelay(new Date(),reminderRefreshBefore));
    };
    arm();
    const subscription = AppState.addEventListener('change',(state) => {
      if (state === 'active') { void refreshReminders(); arm(); }
    });
    return () => { disposed = true; clearTimeout(timer); subscription.remove(); };
  },[refreshReminders,reminderRefreshBefore]);
  return { reminderWarning,reminderRefreshBefore,refreshReminders };
}
