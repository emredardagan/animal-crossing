import HapticFeedback from 'react-native-haptic-feedback';
import { prefs } from './save';

let enabled = prefs.get('haptics', true);
export const setHaptics = (on: boolean) => { enabled = on; prefs.set('haptics', on); };
export const hapticsOn = () => enabled;
const fire = (t: Parameters<typeof HapticFeedback.trigger>[0]) => { if (enabled) HapticFeedback.trigger(t, { enableVibrateFallback: false, ignoreAndroidSystemSettings: false }); };

export const haptics = {
  hop: () => fire('impactLight'),
  coin: () => fire('soft'),
  hit: () => fire('impactHeavy'),
  success: () => fire('notificationSuccess'),
  nope: () => fire('notificationWarning'),
};
