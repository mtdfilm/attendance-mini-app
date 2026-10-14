export type Status = "present" | "absent" | "unmarked";
export type Policy = {
  mode: "unknown" | "percent" | "minimum" | "max_absences";
  value: string | null;
};
export type Semester = {
  id: number;
  name: string;
  start: string;
  end: string;
  timezone: string;
  version: number;
};
export type Course = {
  id: number;
  original_name: string;
  display_name: string;
  version: number;
};
export type Lesson = {
  id: number;
  component_id: number;
  source: string;
  uid: string;
  start: string;
  end: string;
  location: string;
  cancelled: boolean;
  units: number | null;
  version: number;
  overrides: Record<string, unknown>;
  finished: boolean;
  state: string;
  original_summary: string;
  attendance: { status: Status; note: string; version: number };
  course_name?: string;
  kind?: string;
};
export type Stats = {
  P: number;
  A: number;
  U: number;
  F: number;
  N: number | null;
  R: number | null;
  remaining: number | null;
  budget: number | null;
  excess: number | null;
  reserve: number | null;
  reserve_range: [number, number] | null;
  progress: number | null;
  status: string;
  warnings: string[];
};
export type Component = {
  id: number;
  course_id: number;
  semester_id: number;
  kind: string;
  external_group: string;
  policy: Policy;
  unit: string;
  expected_total: number | null;
  complete: boolean;
  version: number;
  course: Course;
  stats: Stats;
  sessions: Lesson[];
};
export type Data = {
  components: Component[];
  semesters: Semester[];
  today: Lesson[];
  today_date: string;
  unmarked: number;
  no_reserve: number;
  dev_bypass: boolean;
  analytics?: {
    unit: "sessions";
    recent: HistoryPeriod;
    all: HistoryPeriod;
  };
  sync: {
    connected: boolean;
    last: { success: boolean; error: string } | null;
    last_success: string | null;
  };
};
export type HistoryPeriod = {
  start: string;
  end: string;
  totals: Record<Status, number>;
  weeks: ({ start: string; end: string } & Record<Status, number>)[];
  completed: number;
  marked: number;
};
export type ImportEvent = {
  index: number;
  name: string;
  kind: string;
  start: string;
  end: string;
  action: string;
  cancelled: boolean;
  external_group: string;
  candidates: { id: number; start: string; source: string }[];
};
export type Preview = {
  token: string;
  events: ImportEvent[];
  warnings: string[];
  added: number;
  updated: number;
  cancelled: number;
  start: string;
  end: string;
};
type Telegram = {
  initData: string;
  colorScheme: string;
  viewportHeight: number;
  safeAreaInset?: { top: number; bottom: number };
  contentSafeAreaInset?: { top: number; bottom: number };
  ready: () => void;
  expand: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  requestFullscreen?: () => void;
  isFullscreen?: boolean;
  onEvent: (e: string, f: () => void) => void;
  offEvent: (e: string, f: () => void) => void;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (f: () => void) => void;
    offClick: (f: () => void) => void;
  };
};
declare global {
  interface Window {
    Telegram?: { WebApp: Telegram };
  }
}
