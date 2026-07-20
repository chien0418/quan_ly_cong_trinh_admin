export const WEEK_START_STORAGE_KEY = 'current-service-schedule-week-start'
export const WEEK_START_CHANGE_EVENT = 'current-service:schedule-week-start-change'

export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const weekStartOptions: Array<{ value: WeekStartDay; label: string }> = [
  { value: 1, label: '月曜日' },
  { value: 2, label: '火曜日' },
  { value: 3, label: '水曜日' },
  { value: 4, label: '木曜日' },
  { value: 5, label: '金曜日' },
  { value: 6, label: '土曜日' },
  { value: 0, label: '日曜日' },
]

export function normalizeWeekStartDay(value: string | null): WeekStartDay {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed as WeekStartDay : 1
}
