import type { Event as EventType, SkinToneInfo } from '@/types';

export const SKIN_TONES: SkinToneInfo[] = [
  { id: 'FAIR', name: 'Fair', color: '#FFDFC4' },
  { id: 'LIGHT', name: 'Light', color: '#F0D5BE' },
  { id: 'OLIVE', name: 'Olive', color: '#D1A38F' },
  { id: 'MEDIUM_BROWN', name: 'Medium Brown', color: '#A1665E' },
  { id: 'DARK_BROWN', name: 'Dark Brown', color: '#6A4B3C' },
  { id: 'DEEP', name: 'Deep', color: '#3B2A1A' }
];

export const OVERALL_GOAL = 5000;

export const INITIAL_EVENTS: EventType[] = [
  { id: 'christmas', name: 'Christmas', startDate: '2026-12-25', totalTarget: 200, perToneTarget: 34, tier: 1 },
  { id: 'new-year', name: 'New Year', startDate: '2026-01-01', totalTarget: 180, perToneTarget: 30, tier: 1 },
  { id: 'halloween', name: 'Halloween', startDate: '2026-10-31', totalTarget: 170, perToneTarget: 29, tier: 1 },
  { id: 'valentines', name: "Valentine's Day", startDate: '2026-02-14', totalTarget: 160, perToneTarget: 27, tier: 1 },
  { id: 'thanksgiving', name: 'Thanksgiving', startDate: '2026-11-26', totalTarget: 150, perToneTarget: 25, tier: 1 },
  { id: 'summer', name: 'Summer Holiday', startDate: '2026-07-04', totalTarget: 130, perToneTarget: 22, tier: 2 },
  { id: 'mothers-day', name: "Mother's Day", startDate: '2026-05-10', totalTarget: 120, perToneTarget: 20, tier: 2 },
  { id: 'fathers-day', name: "Father's Day", startDate: '2026-06-21', totalTarget: 120, perToneTarget: 20, tier: 2 },
  { id: 'easter', name: 'Easter', startDate: '2026-04-05', totalTarget: 110, perToneTarget: 19, tier: 2 },
  { id: 'diwali', name: 'Diwali', startDate: '2026-11-08', totalTarget: 110, perToneTarget: 19, tier: 2 },
  { id: 'graduation', name: 'Graduation Season', startDate: '2026-05-15', totalTarget: 110, perToneTarget: 19, tier: 2 },
  { id: 'back-to-school', name: 'Back to School', startDate: '2026-08-15', totalTarget: 100, perToneTarget: 17, tier: 2 },
  { id: 'bhm', name: 'Black History Month', startDate: '2026-02-01', totalTarget: 90, perToneTarget: 15, tier: 3 },
  { id: 'lunar-new-year', name: 'Lunar New Year', startDate: '2026-02-17', totalTarget: 85, perToneTarget: 15, tier: 3 },
  { id: 'ramadan', name: 'Ramadan', startDate: '2026-02-18', totalTarget: 80, perToneTarget: 14, tier: 3 },
  { id: 'eid-fitr', name: 'Eid al Fitr', startDate: '2026-03-20', totalTarget: 80, perToneTarget: 14, tier: 3 },
  { id: 'hanukkah', name: 'Hanukkah', startDate: '2026-12-04', totalTarget: 75, perToneTarget: 13, tier: 3 },
  { id: 'hispanic-heritage', name: 'Hispanic Heritage Month', startDate: '2026-09-15', totalTarget: 75, perToneTarget: 13, tier: 3 },
  { id: 'aapi-heritage', name: 'AAPI Heritage Month', startDate: '2026-05-01', totalTarget: 70, perToneTarget: 12, tier: 3 },
  { id: 'womens-day', name: "International Women's Day", startDate: '2026-03-08', totalTarget: 70, perToneTarget: 12, tier: 3 },
  { id: 'juneteenth', name: 'Juneteenth', startDate: '2026-06-19', totalTarget: 65, perToneTarget: 11, tier: 3 },
  { id: 'kwanzaa', name: 'Kwanzaa', startDate: '2026-12-26', totalTarget: 65, perToneTarget: 11, tier: 3 },
  { id: 'july4', name: 'Independence Day USA', startDate: '2026-07-04', totalTarget: 55, perToneTarget: 10, tier: 4 },
  { id: 'st-patrick', name: "St. Patrick's Day", startDate: '2026-03-17', totalTarget: 50, perToneTarget: 9, tier: 4 },
  { id: 'carnival', name: 'Carnival', startDate: '2026-02-14', totalTarget: 50, perToneTarget: 9, tier: 4 },
  { id: 'notting-hill', name: 'Notting Hill Carnival', startDate: '2026-08-30', totalTarget: 50, perToneTarget: 9, tier: 4 },
  { id: 'caribbean-heritage', name: 'Caribbean Heritage Month', startDate: '2026-06-01', totalTarget: 45, perToneTarget: 8, tier: 4 },
  { id: 'india-independence', name: 'Indian Independence Day', startDate: '2026-08-15', totalTarget: 45, perToneTarget: 8, tier: 4 },
  { id: 'black-friday', name: 'Black Friday', startDate: '2026-11-27', totalTarget: 45, perToneTarget: 8, tier: 4 },
  { id: 'rosh-hashanah', name: 'Rosh Hashanah/YK', startDate: '2026-09-12', totalTarget: 40, perToneTarget: 7, tier: 4 },
  { id: 'earth-day', name: 'Earth Day', startDate: '2026-04-22', totalTarget: 40, perToneTarget: 7, tier: 4 },
  { id: 'emancipation', name: 'Emancipation Day', startDate: '2026-04-16', totalTarget: 40, perToneTarget: 7, tier: 4 },
  { id: 'bhm-uk', name: 'Black History Month UK', startDate: '2026-10-01', totalTarget: 40, perToneTarget: 7, tier: 4 }
];
