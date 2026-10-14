import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  List,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  RotateCcw,
  Search,
  MapPin,
  CircleHelp,
  CheckCheck,
  ArrowRight,
} from "lucide-react";
import type { Lesson, Status } from "./types";
import { day, date, time, stateLabels } from "./api";

export type ScheduleMode = "today" | "calendar" | "list";
type Props = {
  lessons: Lesson[];
  today: string;
  unmarked: number;
  mode: ScheduleMode;
  setMode: (mode: ScheduleMode) => void;
  onlyUnmarked: boolean;
  setOnlyUnmarked: (value: boolean) => void;
  busy: boolean;
  pending: number[];
  mark: (ids: number[], status: Status) => void;
  openDetails: (lesson: Lesson) => void;
};
const keyDate = (value: string) => new Date(value + "T12:00:00Z");
const shiftMonth = (month: string, offset: number) => {
  const d = keyDate(month + "-01");
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
};

function LessonRow({
  lesson,
  busy,
  selected,
  onSelect,
  mark,
  openDetails,
}: {
  lesson: Lesson;
  busy: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  mark: (status: Status) => void;
  openDetails: () => void;
}) {
  const eligible = lesson.finished && !lesson.cancelled;
  return (
    <article
      className={`schedule-lesson ${lesson.state} ${busy ? "is-saving" : ""}`}
      data-session-id={lesson.id}
    >
      <div className="schedule-lesson-top">
        {eligible && (
          <label className="lesson-select">
            <input
              type="checkbox"
              checked={selected}
              disabled={busy}
              onChange={(e) => onSelect(e.target.checked)}
              aria-label={`Выбрать ${lesson.course_name}, ${date(lesson.start)} ${time(lesson.start)}`}
            />
          </label>
        )}
        <div className="schedule-time">
          <strong>{time(lesson.start)}</strong>
          <small>{time(lesson.end)}</small>
        </div>
        <div className="schedule-lesson-info">
          <button className="schedule-subject" onClick={openDetails}>
            <span>{lesson.course_name}</span>
            <span className="type-tag">{lesson.kind}</span>
          </button>
          <p>
            <MapPin size={12} />
            {lesson.location || "Место не указано"}
          </p>
        </div>
        <span className={`lesson-status ${lesson.state}`}>
          <span>
            {lesson.state === "present"
              ? "✓"
              : lesson.state === "absent"
                ? "×"
                : lesson.state === "unmarked"
                  ? "?"
                  : lesson.state === "cancelled"
                    ? "−"
                    : "·"}
          </span>
          {stateLabels[lesson.state]}
        </span>
      </div>
      {eligible && (
        <div className="schedule-row-actions">
          <span className="row-note">
            {busy ? "Сохранение…" : lesson.attendance.note || "Быстрая отметка"}
          </span>
          <div>
            <button
              className={`mark-button ${lesson.attendance.status === "present" ? "is-present" : ""}`}
              aria-pressed={lesson.attendance.status === "present"}
              disabled={busy}
              onClick={() => mark("present")}
            >
              <Check size={16} />
              Был
            </button>
            <button
              className={`mark-button ${lesson.attendance.status === "absent" ? "is-absent" : ""}`}
              aria-pressed={lesson.attendance.status === "absent"}
              disabled={busy}
              onClick={() => mark("absent")}
            >
              <X size={16} />
              Пропустил
            </button>
            {lesson.attendance.status !== "unmarked" && (
              <button
                className="clear-mark"
                aria-label="Очистить отметку"
                disabled={busy}
                onClick={() => mark("unmarked")}
              >
                <RotateCcw size={15} />
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export function ScheduleWorkspace({
  lessons,
  today,
  unmarked,
  mode,
  setMode,
  onlyUnmarked,
  setOnlyUnmarked,
  busy,
  pending,
  mark,
  openDetails,
}: Props) {
  const calendarRef=useRef<HTMLDivElement>(null);
  const agendaRef=useRef<HTMLDivElement>(null);
  const [month, setMonth] = useState(today.slice(0, 7)),
    [selectedDay, setSelectedDay] = useState(today);
  const [query, setQuery] = useState(""),
    [pastOnly, setPastOnly] = useState(true),
    [selection, setSelection] = useState<number[]>([]);
  const matching = useMemo(
    () =>
      lessons
        .filter(
          (s) =>
            (!onlyUnmarked || s.state === "unmarked") &&
            `${s.course_name} ${s.kind} ${s.location}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id),
    [lessons, query, onlyUnmarked],
  );
  const visible = matching.filter((s) =>
    mode === "today"
      ? day(s.start) === today
      : mode === "calendar"
        ? day(s.start) === selectedDay
        : onlyUnmarked || !pastOnly || s.finished,
  );
  const eligible = visible
    .filter((s) => s.finished && !s.cancelled)
    .map((s) => s.id);
  const chosen = selection.filter((id) => eligible.includes(id));
  useEffect(() => {
    setSelection([]);
  }, [mode, selectedDay, query, onlyUnmarked, pastOnly]);
  const days = useMemo(() => {
    const first = keyDate(month + "-01");
    const monday = new Date(first);
    monday.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + index);
      return d.toISOString().slice(0, 10);
    });
  }, [month]);
  const byDay = useMemo(() => {
    const groups = new Map<string, Lesson[]>();
    for (const s of matching) {
      const d = day(s.start);
      groups.set(d, [...(groups.get(d) || []), s]);
    }
    return groups;
  }, [matching]);
  const dates = [...new Set(visible.map((s) => day(s.start)))];
  function changeMonth(offset: number) {
    const next = shiftMonth(month, offset);
    setMonth(next);
    setSelectedDay(next === today.slice(0, 7) ? today : next + "-01");
  }
  function chooseDay(value: string) {
    setSelectedDay(value);
    if (value.slice(0, 7) !== month) setMonth(value.slice(0, 7));
    if(matchMedia('(max-width: 800px)').matches)requestAnimationFrame(()=>agendaRef.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
  }
  function applyGroup(status: Status) {
    if (chosen.length) {
      mark(chosen, status);
      setSelection([]);
    }
  }
  const isSelectingAll =
    eligible.length > 0 && eligible.every((id) => chosen.includes(id));
  return (
    <section
      className={`schedule-workspace ${chosen.length ? "has-batch" : ""}`}
    >
      <div className="schedule-view-toolbar">
        <div className="segmented schedule-modes" aria-label="Вид расписания">
          {(["today", "calendar", "list"] as const).map((value) => (
            <button
              key={value}
              className={mode === value ? "active" : ""}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === "list" ? (
                <List size={16} />
              ) : (
                <CalendarDays size={16} />
              )}{" "}
              {value === "today"
                ? "Сегодня"
                : value === "calendar"
                  ? "Календарь"
                  : "Список"}
            </button>
          ))}
        </div>
        <button
          className={`unmarked-toggle ${onlyUnmarked ? "active" : ""}`}
          aria-pressed={onlyUnmarked}
          onClick={() => {
            setOnlyUnmarked(!onlyUnmarked);
            if (!onlyUnmarked && mode === "today") setMode("list");
          }}
        >
          <CircleHelp size={16} />
          Неотмеченные<span>{unmarked}</span>
        </button>
      </div>
      <div className="schedule-search-row">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Поиск по расписанию"
            placeholder="Предмет, тип или аудитория…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {mode === "list" && !onlyUnmarked && (
          <button
            className={`filter-chip ${pastOnly ? "active" : ""}`}
            aria-pressed={pastOnly}
            onClick={() => setPastOnly(!pastOnly)}
          >
            {pastOnly ? "Только прошедшие" : "Все даты"}
          </button>
        )}
      </div>
      <div
        className={
          mode === "calendar" ? "calendar-workspace" : "list-workspace"
        }
      >
        {mode === "calendar" && (
          <div className="panel month-calendar" ref={calendarRef}>
            <div className="calendar-heading">
              <button
                aria-label="Предыдущий месяц"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft size={19} />
              </button>
              <h2>
                {date(month + "-01T12:00:00Z", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
              <button
                aria-label="Следующий месяц"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
            <div className="calendar-weekdays" aria-hidden="true">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="calendar-grid" role="group" aria-label="Дни месяца">
              {days.map((d) => {
                const records = byDay.get(d) || [];
                const active = records.filter((s) => !s.cancelled);
                const states = [...new Set(active.map((s) => s.state))];
                const incomplete = states.includes("unmarked");
                return (
                  <button
                    key={d}
                    className={`calendar-day ${d.slice(0, 7) !== month ? "outside" : ""} ${d === selectedDay ? "selected" : ""} ${d === today ? "is-today" : ""} ${active.length ? "has-lessons" : ""} ${incomplete ? "has-unmarked" : ""}`}
                    aria-pressed={d === selectedDay}
                    aria-current={d === today ? "date" : undefined}
                    aria-label={`${date(d + "T12:00:00Z", { day: "numeric", month: "long", year: "numeric" })}, занятий ${active.length}${incomplete ? ", есть неотмеченные" : ""}`}
                    onClick={() => chooseDay(d)}
                  >
                    <span>{Number(d.slice(8))}</span>
                    <span className="calendar-day-markers">
                      {states.slice(0, 3).map((state) => (
                        <i className={state} key={state} />
                      ))}
                      {active.length > 0 && <small>{active.length}</small>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="calendar-footer">
              <span>
                <i className="unmarked" />
                Есть неотмеченные
              </span>
              <button
                onClick={() => {
                  setMonth(today.slice(0, 7));
                  setSelectedDay(today);
                }}
              >
                К сегодняшнему дню <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}
        <div className="schedule-agenda" ref={agendaRef}>
          <div className="agenda-heading">
            <div>
              <div className="eyebrow">
                {mode === "calendar"
                  ? "ВЫБРАННЫЙ ДЕНЬ"
                  : onlyUnmarked
                    ? "РАЗБЕРИТЕ ПРОШЕДШИЕ ПАРЫ"
                    : mode === "today"
                      ? "ПЛАН НА ДЕНЬ"
                      : "ВСЕ ПРЕДМЕТЫ В ОДНОМ МЕСТЕ"}
              </div>
              <h2>
                {mode === "calendar"
                  ? date(selectedDay + "T12:00:00Z", {
                      day: "numeric",
                      month: "long",
                      weekday: "short",
                    })
                  : onlyUnmarked
                    ? "Неотмеченные занятия"
                    : mode === "today"
                      ? "Занятия сегодня"
                      : "Занятия по датам"}{" "}
                <span className="count">{visible.length}</span>
              </h2>
            </div>
            <div className="agenda-tools">{mode==='calendar'&&<button className="return-to-month" onClick={()=>calendarRef.current?.scrollIntoView({block:'start',behavior:'smooth'})}><CalendarDays size={14}/>К месяцу</button>}
            {eligible.length > 0 && (
              <button
                className="select-all"
                disabled={busy || pending.length > 0}
                onClick={() =>
                  setSelection(isSelectingAll ? [] : eligible.slice(0, 500))
                }
              >
                {isSelectingAll ? "Снять выбор" : "Выбрать все"}
              </button>
            )}</div>
          </div>
          {visible.length === 0 ? (
            <div className="empty panel schedule-empty">
              {onlyUnmarked ? (
                <CheckCheck size={28} />
              ) : (
                <CalendarDays size={28} />
              )}
              <h3>
                {onlyUnmarked
                  ? "Здесь всё отмечено"
                  : "На эту дату занятий нет"}
              </h3>
              <p>
                {onlyUnmarked
                  ? "Для выбранных дат и поиска неотмеченных пар нет."
                  : "В сохранённом расписании нет подходящих занятий."}
              </p>
              {onlyUnmarked && (
                <button onClick={() => setOnlyUnmarked(false)}>
                  Показать все занятия
                </button>
              )}
            </div>
          ) : (
            dates.map((d) => (
              <section className="agenda-day" key={d}>
                {mode === "list" && (
                  <h3>
                    <span>
                      {date(d + "T12:00:00Z", {
                        day: "numeric",
                        month: "long",
                        weekday: "short",
                      })}
                    </span>
                    <small>{byDay.get(d)?.length} занятий</small>
                  </h3>
                )}
                {visible
                  .filter((s) => day(s.start) === d)
                  .map((s) => (
                    <LessonRow
                      key={s.id}
                      lesson={s}
                      busy={busy || pending.includes(s.id)}
                      selected={chosen.includes(s.id)}
                      onSelect={(checked) =>
                        setSelection((current) =>
                          checked
                            ? [...new Set([...current, s.id])]
                            : current.filter((id) => id !== s.id),
                        )
                      }
                      mark={(status) => mark([s.id], status)}
                      openDetails={() => openDetails(s)}
                    />
                  ))}
              </section>
            ))
          )}
          <p className="schedule-hint">
            Время Варшавы. Отмечайте завершённые пары прямо здесь или выберите
            несколько для общей отметки.
          </p>
        </div>
      </div>
      {chosen.length > 0 && (
        <div
          className="batch-mark-bar"
          role="group"
          aria-label="Отметить выбранные занятия"
        >
          <span>
            <strong>{chosen.length}</strong> выбрано
          </span>
          <button
            className="batch-present"
            disabled={busy || pending.length > 0}
            onClick={() => applyGroup("present")}
          >
            <Check size={16} />
            Был
          </button>
          <button
            className="batch-absent"
            disabled={busy || pending.length > 0}
            onClick={() => applyGroup("absent")}
          >
            <X size={16} />
            Пропустил
          </button>
          <button aria-label="Сбросить выбор" onClick={() => setSelection([])}>
            <X size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
