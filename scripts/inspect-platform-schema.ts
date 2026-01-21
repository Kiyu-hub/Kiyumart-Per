import { platformSettings } from '../shared/schema';

console.log('PLATFORM SETTINGS KEYS:', Object.keys(platformSettings));
// Attempt to print internal column names
if ((platformSettings as any)._columns) {
  console.log('COLUMNS:', Object.keys((platformSettings as any)._columns));
} else {
  console.log('No _columns property on platformSettings - dumping object');
  console.log(platformSettings);
}
