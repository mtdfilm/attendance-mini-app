import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  CalendarDays,
  Settings,
  Plus,
  ArrowLeft,
  ArrowUpDown,
  Search,
  SlidersHorizontal,
  Check,
  X,
  Upload,
  Download,
  RefreshCw,
  ChevronRight,
  Undo2,
  Sun,
  Moon,
  Monitor,
  CheckCheck,
  MapPin,
  TriangleAlert,
  Pencil,
  Square,
} from "lucide-react";
import {
  api,
  date,
  time,
  localInput,
  warsawISO,
  setToken,
  labels,
  stateLabels,
} from "./api";
import type {
  Data,
  Component,
  Lesson,
  Semester,
  Status,
  Preview,
  Course,
} from "./types";
import "./styles.css";
import "./schedule.css";
import { AttendanceDashboard } from "./AttendanceDashboard";
import { ScheduleWorkspace, type ScheduleMode } from "./ScheduleWorkspace";

const FeedbackContext = React.createContext({ error: "", busy: false });
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const feedback = React.useContext(FeedbackContext);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button aria-label="Закрыть" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {feedback.error && (
        <div className="alert error" role="alert">
          {feedback.error}
        </div>
      )}
      {feedback.busy && (
        <p className="help" role="status">
          Сохранение…
        </p>
      )}
      {children}
    </dialog>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(children as React.ReactElement<{ id: string }>, {
        id,
      })}
    </div>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      {status === "achieved" ? (
        <Check size={13} />
      ) : status === "impossible" ? (
        <X size={13} />
      ) : (
        <span className="dot" />
      )}
      {labels[status] || status}
    </span>
  );
}
const reserve = (s: Component["stats"]) =>
  s.reserve !== null
    ? String(s.reserve)
    : s.reserve_range
      ? `${s.reserve_range[0]}–${s.reserve_range[1]}`
      : "—";
const initialFilters = () => {
  try {
    return JSON.parse(localStorage.getItem("attendance.filters") || "{}");
  } catch {
    return {};
  }
};

function App() {
  const [data, setData] = useState<Data | null>(null),
    dataRef = useRef<Data | null>(null);
  const [tab, setTab] = useState("overview"),
    [selected, setSelected] = useState<number | null>(null);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("today");
  const [scheduleUnmarked, setScheduleUnmarked] = useState(false);
  const [loading, setLoading] = useState(true),
    [authError, setAuthError] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<number[]>([]),
    [undo, setUndo] = useState<number | null>(null);
  const retry = useRef<null | (() => void)>(null),
    queue = useRef(Promise.resolve()),
    generation = useRef(0),
    table = useRef<HTMLDivElement>(null),
    scroll = useRef({ x: 0, y: 0 });
  const f = useRef(initialFilters()).current;
  const [search, setSearch] = useState(f.search || ""),
    [kind, setKind] = useState(f.kind || ""),
    [attention, setAttention] = useState(f.attention || false),
    [sort, setSort] = useState(f.sort || "name"),
    [direction, setDirection] = useState(f.direction || 1);
  const [semesterId, setSemesterId] = useState<number | undefined>(undefined),
    [theme, setTheme] = useState(
      localStorage.getItem("attendance.theme") || "auto",
    );
  const [modal, setModal] = useState<
      | null
      | "course"
      | "component"
      | "session"
      | "semester"
      | "import"
      | "restore"
    >(null),
    [lesson, setLesson] = useState<Lesson | null>(null),
    [editSemester, setEditSemester] = useState<Semester | null>(null);
  const [brush, setBrush] = useState<Status | null>(null),
    [onlyUnmarked, setOnlyUnmarked] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null),
    [restore, setRestore] = useState<{
      token: string;
      courses: number;
      components: number;
      sessions: number;
      attendance: number;
    } | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, number>>({}),
    [mapping, setMapping] = useState<Record<string, number>>({});
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const component = data?.components.find((c) => c.id === selected);
  const lessonComponent = lesson
    ? data?.components.find((c) => c.id === lesson.component_id)
    : component;
  const semester =
    data?.semesters.find((s) => s.id === semesterId) || data?.semesters.at(-1);

  const refresh = useCallback(async () => {
    const g = ++generation.current;
    const result = await api<Data>(
      "/summary" + (semesterId ? `?semester_id=${semesterId}` : ""),
    );
    if (g === generation.current) {
      dataRef.current = result;
      setData(result);
    }
    return result;
  }, [semesterId]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  async function login() {
    setLoading(true);
    setAuthError("");
    try {
      const auth = await api<{ token: string }>("/auth", "POST", {
        init_data: window.Telegram?.WebApp.initData || "",
      });
      setToken(auth.token);
      await refresh();
    } catch (e) {
      setAuthError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void login();
  }, []);
  useEffect(() => {
    if (data) void refresh().catch((e) => setError(e.message));
  }, [semesterId]);
  useEffect(() => {
    localStorage.setItem(
      "attendance.filters",
      JSON.stringify({ search, kind, attention, sort, direction }),
    );
  }, [search, kind, attention, sort, direction]);
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const update = () => {
      document.documentElement.dataset.theme =
        theme === "auto"
          ? tg?.initData
            ? tg.colorScheme
            : matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light"
          : theme;
      document.documentElement.style.setProperty(
        "--safe-top",
        `${Math.max(tg?.safeAreaInset?.top || 0, tg?.contentSafeAreaInset?.top || 0)}px`,
      );
      document.documentElement.style.setProperty(
        "--safe-bottom",
        `${Math.max(tg?.safeAreaInset?.bottom || 0, tg?.contentSafeAreaInset?.bottom || 0)}px`,
      );
      if (tg?.initData)
        document.documentElement.style.setProperty(
          "--viewport",
          `${tg.viewportHeight}px`,
        );
    };
    localStorage.setItem("attendance.theme", theme);
    update();
    tg?.ready();
    tg?.expand();
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    for (const ev of [
      "themeChanged",
      "viewportChanged",
      "safeAreaChanged",
      "contentSafeAreaChanged",
    ])
      tg?.onEvent(ev, update);
    return () => {
      media.removeEventListener("change", update);
      for (const ev of [
        "themeChanged",
        "viewportChanged",
        "safeAreaChanged",
        "contentSafeAreaChanged",
      ])
        tg?.offEvent(ev, update);
    };
  }, [theme]);
  function back() {
    setSelected(null);
    setBrush(null);
    setOnlyUnmarked(false);
    requestAnimationFrame(() => {
      if (table.current) {
        table.current.scrollLeft = scroll.current.x;
        table.current.scrollTop = scroll.current.y;
      }
    });
  }
  useEffect(() => {
    const button = window.Telegram?.WebApp.BackButton;
    if (selected !== null) button?.show();
    else button?.hide();
    button?.onClick(back);
    return () => button?.offClick(back);
  }, [selected]);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => {
      if (!pending.length && !busy) void refreshRef.current().catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, [!!data, pending.length, busy]);
  function open(c: Component) {
    if (table.current)
      scroll.current = {
        x: table.current.scrollLeft,
        y: table.current.scrollTop,
      };
    setSelected(c.id);
    setBrush(null);
    setOnlyUnmarked(false);
  }
  async function act(
    work: () => Promise<unknown>,
    success = "Сохранено",
    close = true,
  ) {
    setBusy(true);
    setError("");
    retry.current = () => void act(work, success, close);
    try {
      await work();
      await refresh();
      setNotice(success);
      retry.current = null;
      if (close) setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function markMany(ids: number[], status: Status, note?: string) {
    const requestId = crypto.randomUUID();
    const run = () => {
      setPending((p) => [...new Set([...p, ...ids])]);
      queue.current = queue.current
        .then(async () => {
          const old = dataRef.current;
          if (!old) return;
          const lessons = old.components
            .flatMap((c) => c.sessions)
            .filter((s) => ids.includes(s.id));
          if (!lessons.length) return;
          const items = lessons.map((s) => ({
            session_id: s.id,
            version: s.attendance.version,
            status,
            note: note ?? s.attendance.note,
          }));
          // Serialize writes and refreshes. Roll back the view if the server rejects a write.
          const optimistic = {
            ...old,
            components: old.components.map((c) => ({
              ...c,
              sessions: c.sessions.map((s) =>
                ids.includes(s.id)
                  ? {
                      ...s,
                      state: status,
                      attendance: {
                        ...s.attendance,
                        status,
                        note: note ?? s.attendance.note,
                      },
                    }
                  : s,
              ),
            })),
          };
          ++generation.current;
          setData(optimistic);
          setNotice("Сохранение…");
          setError("");
          try {
            const result = await api<{ change_id: number }>(
              "/attendance",
              "POST",
              { request_id: requestId, items },
            );
            setUndo(result.change_id);
            await refreshRef.current();
            setNotice("Отметки сохранены");
            retry.current = null;
          } catch (e) {
            setData(old);
            dataRef.current = old;
            setError((e as Error).message);
            setNotice("");
            retry.current = () => {
              void refreshRef
                .current()
                .then(run)
                .catch((e) => setError(e.message));
            };
          } finally {
            setPending((p) => p.filter((id) => !ids.includes(id)));
          }
        })
        .catch((e) => {
          setError(e.message);
          setPending([]);
        });
    };
    run();
  }
  const blocked = busy || pending.length > 0;
  const close = () => {
    if (!busy) setModal(null);
  };
  function nav(next: string) {
    back();
    setTab(next);
    setError("");
  }
  function openUnmarked() {
    nav("today");
    setScheduleMode("list");
    setScheduleUnmarked(true);
  }
  function importReady(p: Preview) {
    setPreview(p);
    setResolutions({});
    setMapping({});
    setModal("import");
  }
  async function readFile(file: File | undefined, type: "ics" | "json") {
    if (!file) return;
    if (file.size > (type === "ics" ? 2_000_000 : 10_000_000)) {
      setError("Файл слишком большой");
      return;
    }
    await act(
      async () => {
        const text = await file.text();
        if (type === "ics") {
          if (!semester) throw new Error("Сначала задайте семестр");
          importReady(
            await api("/import/preview", "POST", {
              semester_id: semester.id,
              content: text,
            }),
          );
        } else {
          setRestore(await api("/restore/preview", "POST", JSON.parse(text)));
          setModal("restore");
        }
      },
      "Предпросмотр готов",
      false,
    );
  }
  async function download() {
    await act(
      async () => {
        const value = await api("/export");
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(value, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `attendance-${data?.today_date}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      "Экспорт подготовлен",
      false,
    );
  }
  function sortBy(key: string) {
    if (sort === key) setDirection(-direction);
    else {
      setSort(key);
      setDirection(1);
    }
  }
  const filtered = (data?.components || [])
    .filter(
      (c) =>
        (!semesterId || c.semester_id === semesterId) &&
        c.course.display_name.toLowerCase().includes(search.toLowerCase()) &&
        (!kind || c.kind === kind) &&
        (!attention ||
          c.stats.U > 0 ||
          [
            "unknown",
            "incomplete",
            "conflict",
            "impossible",
            "all",
            "provisional",
          ].includes(c.stats.status)),
    )
    .sort((a, b) => {
      const av =
        sort === "name"
          ? a.course.display_name
          : sort === "absent"
            ? a.stats.A
            : a.stats.reserve;
      const bv =
        sort === "name"
          ? b.course.display_name
          : sort === "absent"
            ? b.stats.A
            : b.stats.reserve;
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return (
        (typeof av === "string"
          ? av.localeCompare(String(bv))
          : av - Number(bv)) * direction
      );
    });

  if (loading)
    return (
      <div className="loading">
        <div className="brand-mark">
          <CheckCheck />
        </div>
        <h1>Attendance</h1>
        <p>Загружаем ваше расписание…</p>
      </div>
    );
  if (!data)
    return (
      <div className="loading">
        <div className="brand-mark">
          <BookOpen />
        </div>
        <h1>Откройте через бота</h1>
        <p>{authError}</p>
        <button className="primary" onClick={() => void login()}>
          Повторить вход
        </button>
        <small>Локально: включите DEV_AUTH_BYPASS в окружении сервера.</small>
      </div>
    );
  return (
    <FeedbackContext.Provider value={{ error, busy }}>
      <div className="app-shell">
        <header className="topbar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              nav("overview");
            }}
          >
            <span className="brand-mark">
              <CheckCheck size={20} />
            </span>
            <span>
              Attendance<small>VISTULA UNIVERSITY</small>
            </span>
          </a>
          <span className="owner">
            {data.dev_bypass ? 'Демо' : 'Mykhailo'} <span className="avatar">{data.dev_bypass?'D':'M'}</span>
          </span>
        </header>
        {data.dev_bypass && (
          <div className="dev-banner">
            Локальная разработка · вход без Telegram · данные этой базы
          </div>
        )}
        <main>
          {error && (
            <div className="alert error" role="alert">
              <TriangleAlert size={18} />
              <span>{error}</span>
              <button
                onClick={() =>
                  retry.current
                    ? retry.current()
                    : void act(refresh, "Данные обновлены", false)
                }
              >
                Повторить
              </button>
              <button aria-label="Закрыть ошибку" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!component && tab === "overview" && (
            <>
              <div className="page-title">
                <div>
                  <div className="eyebrow">ВАША ПОСЕЩАЕМОСТЬ</div>
                  <h1>Обзор</h1>
                  <p>
                    {semester?.name || "Начните со своего расписания"}{" "}
                    <span className="subtle">· Europe/Warsaw</span>
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={blocked}
                  onClick={() => {
                    if (!semester) {
                      setEditSemester(null);
                      setModal("semester");
                    } else setModal("course");
                  }}
                >
                  <Plus size={18} />
                  <span>Предмет</span>
                </button>
              </div>
              <div className="counters">
                <button onClick={openUnmarked}>
                  <span className="counter-icon amber">?</span>
                  <span>
                    <strong>{data.unmarked}</strong>
                    <small>Не отмечено</small>
                  </span>
                </button>
                <button
                  onClick={() => {
                    setAttention(true);
                    setSort("reserve");
                    setDirection(1);
                  }}
                >
                  <span className="counter-icon">
                    <SlidersHorizontal size={18} />
                  </span>
                  <span>
                    <strong>{data.no_reserve}</strong>
                    <small>Без запаса</small>
                  </span>
                </button>
                <button onClick={() => nav("today")}>
                  <span className="counter-icon">
                    <CalendarDays size={19} />
                  </span>
                  <span>
                    <strong>
                      {data.today.filter((s) => !s.cancelled).length}
                    </strong>
                    <small>Сегодня</small>
                  </span>
                </button>
              </div>
              <AttendanceDashboard
                analytics={data.analytics}
                onUnmarked={openUnmarked}
              />
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>
                      Предметы и занятия{" "}
                      <span className="count">{filtered.length}</span>
                    </h2>
                    <p>Каждая форма занятий считается отдельно</p>
                  </div>
                  {data.semesters.length > 1 && (
                    <select
                      aria-label="Семестр обзора"
                      value={semesterId || ""}
                      onChange={(e) =>
                        setSemesterId(Number(e.target.value) || undefined)
                      }
                    >
                      <option value="">Все семестры</option>
                      {data.semesters.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="filters">
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="Поиск предмета"
                      placeholder="Найти предмет…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Тип занятий"
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="">Все типы</option>
                    {[...new Set(data.components.map((c) => c.kind))].map(
                      (k) => (
                        <option key={k}>{k}</option>
                      ),
                    )}
                  </select>
                  <button
                    className={`filter-chip ${attention ? "active" : ""}`}
                    onClick={() => setAttention(!attention)}
                  >
                    <SlidersHorizontal size={15} />
                    Требует внимания
                  </button>
                </div>
                {data.components.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon">
                      <CalendarDays size={28} />
                    </div>
                    <h2>Расписание начинается здесь</h2>
                    <p>
                      Импортируйте календарь .ics или добавьте предмет.
                      <br />
                      Посещаемость и требования зададите сами.
                    </p>
                    <button className="primary" onClick={() => nav("settings")}>
                      <Upload size={17} />
                      Импорт расписания
                    </button>
                    <button
                      onClick={() => {
                        if (!semester) {
                          setEditSemester(null);
                          setModal("semester");
                        } else setModal("course");
                      }}
                    >
                      Добавить вручную <ChevronRight size={15} />
                    </button>
                  </div>
                ) : (
                  <div
                    className="table-scroll"
                    ref={table}
                    tabIndex={0}
                    aria-label="Таблица посещаемости, прокручивается по горизонтали"
                  >
                    <table>
                      <colgroup>
                        <col className="subject-col" />
                        <col />
                        <col />
                        <col className="reserve-col" />
                        <col />
                        <col className="status-col" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>
                            <button onClick={() => sortBy("name")}>
                              Предмет{" "}
                              {sort === "name" ? (
                                direction === 1 ? (
                                  "↑"
                                ) : (
                                  "↓"
                                )
                              ) : (
                                <ArrowUpDown size={13} />
                              )}
                            </button>
                          </th>
                          <th>Был</th>
                          <th>
                            <button onClick={() => sortBy("absent")}>
                              Пропустил{" "}
                              {sort === "absent" ? (
                                direction === 1 ? (
                                  "↑"
                                ) : (
                                  "↓"
                                )
                              ) : (
                                <ArrowUpDown size={13} />
                              )}
                            </button>
                          </th>
                          <th>
                            <button onClick={() => sortBy("reserve")}>
                              Можно ещё
                              <br />
                              пропустить{" "}
                              {sort === "reserve" ? (
                                direction === 1 ? (
                                  "↑"
                                ) : (
                                  "↓"
                                )
                              ) : (
                                <ArrowUpDown size={13} />
                              )}
                            </button>
                          </th>
                          <th>Минимум</th>
                          <th>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((c) => (
                          <tr key={c.id} onClick={() => open(c)}>
                            <th>
                              <button
                                className="subject-button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  open(c);
                                }}
                              >
                                <span>{c.course.display_name}</span>
                                <small>
                                  <span className="type-tag">{c.kind}</span>
                                  {c.unit === "academic"
                                    ? "акад. единицы"
                                    : "занятия"}
                                </small>
                              </button>
                            </th>
                            <td className="present-text">{c.stats.P}</td>
                            <td>{c.stats.A}</td>
                            <td
                              className={
                                c.stats.reserve === 0 ? "amber-text" : ""
                              }
                            >
                              {reserve(c.stats)}
                            </td>
                            <td>
                              {c.stats.R === null ? (
                                "—"
                              ) : (
                                <>
                                  {c.stats.R}
                                  <span className="subtle"> / {c.stats.N}</span>
                                </>
                              )}
                            </td>
                            <td>
                              <Badge status={c.stats.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filtered.length === 0 && (
                      <div className="empty small">
                        <p>По этим фильтрам предметов нет</p>
                        <button
                          onClick={() => {
                            setSearch("");
                            setKind("");
                            setAttention(false);
                          }}
                        >
                          Сбросить фильтры
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div className="table-note">
                  <span>— недостаточно данных для расчёта</span>
                  <span>Запас учитывает только известные требования</span>
                </div>
              </section>
            </>
          )}
          {component && (
            <>
              <button className="back" onClick={back}>
                <ArrowLeft size={17} />К обзору
              </button>
              <div className="page-title">
                <div>
                  <div className="eyebrow">
                    {semester?.name || "ПОСЕЩАЕМОСТЬ"} · {component.kind}
                  </div>
                  <h1 className="course-title">
                    {component.course.display_name}
                  </h1>
                  <p>
                    {component.unit === "academic"
                      ? "Учёт в академических единицах"
                      : "Учёт по занятиям"}{" "}
                    · <Badge status={component.stats.status} />
                  </p>
                </div>
                <button
                  aria-label="Редактировать предмет и требования"
                  disabled={blocked}
                  onClick={() => setModal("component")}
                >
                  <Pencil size={18} />
                </button>
              </div>
              <div className="component-tabs">
                {data.components
                  .filter(
                    (c) =>
                      c.course_id === component.course_id &&
                      c.semester_id === component.semester_id,
                  )
                  .map((c) => (
                    <button
                      key={c.id}
                      className={c.id === component.id ? "active" : ""}
                      onClick={() => {
                        setSelected(c.id);
                        setBrush(null);
                      }}
                    >
                      {c.kind}
                      {c.external_group &&
                      !c.external_group.startsWith("unidentified:") ? (
                        <small> {c.external_group}</small>
                      ) : null}
                    </button>
                  ))}
                <button disabled={blocked} onClick={() => setModal("course")}>
                  <Plus size={15} />
                  Форма занятий
                </button>
              </div>
              <div className="detail-stats">
                <div>
                  <small>Был</small>
                  <strong className="present-text">{component.stats.P}</strong>
                </div>
                <div>
                  <small>Пропустил</small>
                  <strong>{component.stats.A}</strong>
                </div>
                <div>
                  <small>Можно ещё</small>
                  <strong>{reserve(component.stats)}</strong>
                </div>
                <div>
                  <small>Нужно посетить</small>
                  <strong>{component.stats.remaining ?? "—"}</strong>
                </div>
              </div>
              <section className="progress-panel">
                <div>
                  <span>Прогресс к минимуму</span>
                  <strong>
                    {component.stats.R === null
                      ? "Требование не задано"
                      : `${component.stats.P} / ${component.stats.R}`}
                  </strong>
                </div>
                <progress
                  max={1}
                  value={component.stats.progress ?? 0}
                  aria-label="Прогресс к семестровому минимуму"
                />
                <small>
                  Это выполнение требования посещаемости, а не сдача предмета.
                  {component.stats.excess
                    ? ` Превышение пропусков: ${component.stats.excess}.`
                    : ""}
                </small>
              </section>
              {component.stats.warnings.length > 0 && (
                <div className="warning">
                  <TriangleAlert size={18} />
                  <div>
                    {component.stats.warnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                    {component.stats.reserve_range && (
                      <p>
                        Диапазон запаса: {reserve(component.stats)}. Нижняя
                        граница — если все неотмеченные были пропущены; верхняя
                        — если вы были на всех.
                      </p>
                    )}
                    <button onClick={() => setModal("component")}>
                      Настроить требования <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
              <div className="section-heading lesson-heading">
                <div>
                  <h2>Занятия</h2>
                  <p>Время Варшавы · нажмите плитку для деталей</p>
                </div>
                <button
                  disabled={blocked}
                  onClick={() => {
                    setLesson(null);
                    setModal("session");
                  }}
                >
                  <Plus size={17} />
                  Занятие
                </button>
              </div>
              <div className="lesson-tools">
                <button
                  className={brush ? "primary" : "secondary"}
                  disabled={blocked}
                  onClick={() => setBrush(brush ? null : "present")}
                >
                  <Square size={16} />
                  {brush ? "Завершить отметку" : "Быстрая отметка"}
                </button>
                <button
                  className={onlyUnmarked ? "active" : ""}
                  onClick={() => setOnlyUnmarked(!onlyUnmarked)}
                >
                  Неотмеченные (
                  {
                    component.sessions.filter((s) => s.state === "unmarked")
                      .length
                  }
                  )
                </button>
              </div>
              <div className="legend">
                {Object.entries(stateLabels).map(([key, text]) => (
                  <span key={key}>
                    <i className={key}>
                      {key === "present"
                        ? "✓"
                        : key === "absent"
                          ? "×"
                          : key === "unmarked"
                            ? "?"
                            : key === "cancelled"
                              ? "−"
                              : ""}
                    </i>
                    {text}
                  </span>
                ))}
              </div>
              {component.sessions.length === 0 && (
                <div className="empty panel">
                  <h2>Пока нет занятий</h2>
                  <p>Добавьте прошлую историю или импортируйте расписание.</p>
                  <button
                    onClick={() => {
                      setLesson(null);
                      setModal("session");
                    }}
                  >
                    <Plus size={17} />
                    Добавить занятие
                  </button>
                </div>
              )}
              {[
                ...new Set(
                  component.sessions.map((s) =>
                    date(s.start, { month: "long", year: "numeric" }),
                  ),
                ),
              ].map((month) => {
                const sessions = component.sessions.filter(
                  (s) =>
                    date(s.start, { month: "long", year: "numeric" }) ===
                      month &&
                    (!onlyUnmarked || s.state === "unmarked"),
                );
                return (
                  sessions.length > 0 && (
                    <section className="month" key={month}>
                      <h3>
                        {month}
                        <span>{sessions.length}</span>
                      </h3>
                      <div className="lesson-grid">
                        {sessions.map((s) => (
                          <button
                            key={s.id}
                            className={`tile ${s.state} ${pending.includes(s.id) ? "pending" : ""}`}
                            aria-label={`${date(s.start)} ${time(s.start)}, ${stateLabels[s.state]}`}
                            disabled={
                              pending.includes(s.id) ||
                              busy ||
                              (!!brush && (!s.finished || s.cancelled))
                            }
                            onClick={() => {
                              if (brush) markMany([s.id], brush);
                              else {
                                setLesson(s);
                                setModal("session");
                              }
                            }}
                          >
                            <span className="tile-top">
                              {date(s.start, {
                                day: "numeric",
                                month: "short",
                              })}
                              <b>
                                {s.state === "present"
                                  ? "✓"
                                  : s.state === "absent"
                                    ? "×"
                                    : s.state === "unmarked"
                                      ? "?"
                                      : s.state === "cancelled"
                                        ? "−"
                                        : "·"}
                              </b>
                            </span>
                            <span className="tile-time">
                              {time(s.start)}–{time(s.end)}
                            </span>
                            <small>{s.location || stateLabels[s.state]}</small>
                            {s.attendance.note && (
                              <span className="note-dot" title="Есть заметка" />
                            )}
                          </button>
                        ))}
                      </div>
                    </section>
                  )
                );
              })}
              {brush && (
                <div className="brush-bar">
                  <span>Кисть</span>
                  {(["present", "absent", "unmarked"] as Status[]).map((s) => (
                    <button
                      key={s}
                      className={brush === s ? `selected ${s}` : ""}
                      onClick={() => setBrush(s)}
                    >
                      {s === "present" ? (
                        <Check size={17} />
                      ) : s === "absent" ? (
                        <X size={17} />
                      ) : (
                        <Undo2 size={16} />
                      )}{" "}
                      {s === "unmarked" ? "Очистить" : stateLabels[s]}
                    </button>
                  ))}
                  <button
                    aria-label="Закончить быструю отметку"
                    onClick={() => setBrush(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </>
          )}
          {!component && tab === "today" && (
            <>
              <div className="page-title">
                <div>
                  <div className="eyebrow">ВАШЕ РАСПИСАНИЕ · ВАРШАВА</div>
                  <h1>Сегодня</h1>
                  <p>Календарь и быстрые отметки всех предметов</p>
                </div>
                <CalendarDays className="subtle" size={28} />
              </div>
              <ScheduleWorkspace
                lessons={data.components.flatMap((c) =>
                  c.sessions.map((s) => ({
                    ...s,
                    course_name: c.course.display_name,
                    kind: c.kind,
                  })),
                )}
                today={data.today_date}
                unmarked={data.unmarked}
                mode={scheduleMode}
                setMode={setScheduleMode}
                onlyUnmarked={scheduleUnmarked}
                setOnlyUnmarked={setScheduleUnmarked}
                busy={busy}
                pending={pending}
                mark={markMany}
                openDetails={(s) => {
                  setLesson(s);
                  setModal("session");
                }}
              />
            </>
          )}
          {!component && tab === "settings" && (
            <>
              <div className="page-title">
                <div>
                  <div className="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</div>
                  <h1>Настройки</h1>
                  <p>Расписание, правила и сохранность данных</p>
                </div>
              </div>
              <div className="settings-grid">
                <section className="panel settings-panel">
                  <h2>Семестр</h2>
                  {data.semesters.length > 0 ? (
                    <>
                      <select
                        aria-label="Активный семестр"
                        value={semester?.id}
                        onChange={(e) => setSemesterId(Number(e.target.value))}
                      >
                        {data.semesters.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <p>
                        {semester?.start} — {semester?.end}
                        <br />
                        Часовой пояс: Europe/Warsaw
                      </p>
                      <button
                        onClick={() => {
                          setEditSemester(semester!);
                          setModal("semester");
                        }}
                      >
                        <Pencil size={16} />
                        Изменить границы
                      </button>
                    </>
                  ) : (
                    <p>
                      Задайте границы перед импортом. Они ограничивают
                      повторяющиеся события.
                    </p>
                  )}
                  <button
                    onClick={() => {
                      setEditSemester(null);
                      setModal("semester");
                    }}
                  >
                    <Plus size={16} />
                    Новый семестр
                  </button>
                </section>
                <section className="panel settings-panel">
                  <h2>Оформление</h2>
                  <p>Автоматическая тема следует Telegram или системе.</p>
                  <div className="theme-options">
                    {[
                      ["auto", "Авто", Monitor],
                      ["light", "Светлая", Sun],
                      ["dark", "Тёмная", Moon],
                    ].map(([value, text, Icon]) => (
                      <button
                        key={String(value)}
                        className={theme === value ? "active" : ""}
                        onClick={() => setTheme(String(value))}
                      >
                        {React.createElement(Icon as typeof Sun, { size: 20 })}
                        {String(text)}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel settings-panel">
                  <h2>Расписание USOS</h2>
                  <span
                    className={`badge ${data.sync.connected ? "achieved" : "unknown"}`}
                  >
                    {data.sync.connected ? "Подключено" : "Не подключено"}
                  </span>
                  <p>
                    Последняя успешная синхронизация:
                    <br />
                    {data.sync.last_success
                      ? date(data.sync.last_success, {
                          day: "numeric",
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Пока не выполнялась"}
                  </p>
                  {data.sync.last && !data.sync.last.success && (
                    <p className="error-text">{data.sync.last.error}</p>
                  )}
                  <button
                    disabled={blocked || !semester}
                    onClick={() =>
                      void act(
                        async () =>
                          importReady(
                            await api(
                              `/sync?semester_id=${semester!.id}`,
                              "POST",
                            ),
                          ),
                        "Предпросмотр USOS готов",
                        false,
                      )
                    }
                  >
                    <RefreshCw size={16} />
                    Обновить USOS сейчас
                  </button>
                  <small>
                    Приватную ссылку задайте в USOS_ICAL_URL на сервере.
                    Upcoming не заменяет полный календарь семестра.
                  </small>
                </section>
                <section className="panel settings-panel">
                  <h2>Импорт календаря</h2>
                  <p>
                    Загрузите полный .ics, чтобы восстановить ранние занятия.
                    Перед сохранением будет предпросмотр.
                  </p>
                  <label
                    className={`file-button ${blocked || !semester ? "disabled" : ""}`}
                  >
                    <Upload size={16} />
                    Выбрать .ics
                    <input
                      type="file"
                      accept=".ics,text/calendar"
                      disabled={blocked || !semester}
                      onChange={(e) => {
                        void readFile(e.target.files?.[0], "ics");
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {!semester && <small>Сначала создайте семестр.</small>}
                </section>
                <section className="panel settings-panel">
                  <h2>Резервные копии</h2>
                  <p>
                    JSON сохраняет предметы, требования, занятия и отметки.
                    Секреты в экспорт не входят.
                  </p>
                  <div className="stack">
                    <button disabled={blocked} onClick={() => void download()}>
                      <Download size={16} />
                      Экспортировать JSON
                    </button>
                    <label
                      className={`file-button ${blocked ? "disabled" : ""}`}
                    >
                      <Upload size={16} />
                      Восстановить из JSON
                      <input
                        type="file"
                        accept=".json,application/json"
                        disabled={blocked}
                        onChange={(e) => {
                          void readFile(e.target.files?.[0], "json");
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      disabled={blocked}
                      onClick={() =>
                        void act(
                          () => api("/backup", "POST"),
                          "Согласованная копия SQLite создана на сервере",
                          false,
                        )
                      }
                    >
                      Создать серверную копию
                    </button>
                  </div>
                  <small>
                    Перед заменой данных автоматически создаётся SQLite backup.
                  </small>
                </section>
                <section className="panel settings-panel">
                  <h2>Правила посещаемости</h2>
                  <p>
                    Откройте предмет и нажмите карандаш: задайте процент,
                    минимум занятий или максимум пропусков.
                  </p>
                  <p>
                    Lab, W, C, W-PW и Proj — исходные коды. Каждая форма
                    учитывается отдельно. Уважительный пропуск и отработка
                    остаются заметками.
                  </p>
                  <button onClick={() => nav("overview")}>
                    <BookOpen size={16} />К предметам
                  </button>
                </section>
              </div>
            </>
          )}
        </main>
        <div
          className={`save-status ${brush ? "above-brush" : ""}`}
          aria-live="polite"
        >
          {pending.length > 0 ? "Сохранение…" : notice}
          {undo !== null && (
            <button
              disabled={blocked}
              onClick={() =>
                void act(
                  async () => {
                    await api(`/undo/${undo}`, "POST");
                    setUndo(null);
                  },
                  "Последняя отметка отменена",
                  false,
                )
              }
            >
              <Undo2 size={15} />
              Отменить
            </button>
          )}
        </div>
        <nav className="bottom-nav" aria-label="Основная навигация">
          {[
            ["overview", "Обзор", BookOpen],
            ["today", "Сегодня", CalendarDays],
            ["settings", "Настройки", Settings],
          ].map(([key, title, Icon]) => (
            <button
              key={String(key)}
              className={tab === key ? "active" : ""}
              onClick={() => nav(String(key))}
            >
              {React.createElement(Icon as typeof BookOpen, { size: 20 })}
              <span>{String(title)}</span>
              {key === "today" && data.today.length > 0 && <i />}
            </button>
          ))}
        </nav>
        {modal === "semester" && (
          <Modal
            title={editSemester ? "Изменить семестр" : "Новый семестр"}
            close={close}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void act(async () => {
                  const row = await api<Semester>(
                    editSemester
                      ? `/semesters/${editSemester.id}`
                      : "/semesters",
                    editSemester ? "PUT" : "POST",
                    {
                      name: fd.get("name"),
                      start: fd.get("start"),
                      end: fd.get("end"),
                      version: editSemester?.version || 0,
                    },
                  );
                  setSemesterId(row.id);
                });
              }}
            >
              <Field label="Название">
                <input
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={editSemester?.name}
                  placeholder="Зимний семестр 2026/27"
                />
              </Field>
              <div className="form-row">
                <Field label="Начало">
                  <input
                    name="start"
                    type="date"
                    required
                    defaultValue={editSemester?.start}
                  />
                </Field>
                <Field label="Конец">
                  <input
                    name="end"
                    type="date"
                    required
                    defaultValue={editSemester?.end}
                  />
                </Field>
              </div>
              <p className="help">
                Укажите реальные границы. Даты из upcoming-ленты не подтверждают
                полный семестр.
              </p>
              <button className="primary wide" disabled={blocked}>
                Сохранить семестр
              </button>
            </form>
          </Modal>
        )}
        {modal === "course" && (
          <Modal
            title={component ? "Добавить форму занятий" : "Новый предмет"}
            close={close}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void act(async () => {
                  const course =
                    component?.course ||
                    (await api<Course>("/courses", "POST", {
                      original_name: fd.get("name"),
                      display_name: fd.get("name"),
                    }));
                  const c = await api<Component>("/components", "POST", {
                    course_id: course.id,
                    semester_id: component?.semester_id || semester!.id,
                    kind: fd.get("kind"),
                    external_group: fd.get("group") || "",
                  });
                  setSelected(c.id);
                  setTab("overview");
                });
              }}
            >
              {!component && (
                <Field label="Название предмета">
                  <input
                    name="name"
                    required
                    maxLength={300}
                    placeholder="Java Programming"
                  />
                </Field>
              )}
              <Field label="Исходный код типа">
                <input
                  name="kind"
                  required
                  maxLength={100}
                  placeholder="Например, Lab"
                />
              </Field>
              <Field label="Группа / цикл (если известны)">
                <input
                  name="group"
                  maxLength={500}
                  placeholder="Можно оставить пустым"
                />
              </Field>
              <p className="help">
                Посещения и требования не заполняются автоматически.
              </p>
              <button className="primary wide" disabled={blocked}>
                Создать
              </button>
            </form>
          </Modal>
        )}
        {modal === "component" && component && (
          <Modal title="Предмет и требование" close={close}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const mode = String(fd.get("mode"));
                void act(async () => {
                  if (fd.get("name") !== component.course.display_name)
                    await api(`/courses/${component.course_id}`, "PUT", {
                      ...component.course,
                      id: undefined,
                      display_name: fd.get("name"),
                    });
                  await api(`/components/${component.id}`, "PUT", {
                    course_id: component.course_id,
                    semester_id: component.semester_id,
                    kind: fd.get("kind"),
                    external_group: fd.get("group"),
                    policy: {
                      mode,
                      value: mode === "unknown" ? null : fd.get("value"),
                    },
                    unit: fd.get("unit"),
                    expected_total:
                      fd.get("total") === "" ? null : Number(fd.get("total")),
                    complete: fd.get("complete") === "on",
                    version: component.version,
                  });
                });
              }}
            >
              <Field label="Отображаемое название">
                <input
                  name="name"
                  defaultValue={component.course.display_name}
                  required
                  maxLength={300}
                />
              </Field>
              <small>Исходное: {component.course.original_name}</small>
              <div className="form-row">
                <Field label="Код типа">
                  <input name="kind" defaultValue={component.kind} required />
                </Field>
                <Field label="Группа / цикл">
                  <input name="group" defaultValue={component.external_group} />
                </Field>
              </div>
              <Field label="Требование">
                <select name="mode" defaultValue={component.policy.mode}>
                  <option value="unknown">Пока неизвестно</option>
                  <option value="percent">Процент посещений</option>
                  <option value="minimum">Минимум в единицах</option>
                  <option value="max_absences">Максимум пропусков</option>
                </select>
              </Field>
              <Field label="Значение требования">
                <input
                  name="value"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={component.policy.value ?? ""}
                />
              </Field>
              <Field label="Единица учёта">
                <select name="unit" defaultValue={component.unit}>
                  <option value="sessions">Одно занятие</option>
                  <option value="academic">
                    Академические единицы (задаются вручную)
                  </option>
                </select>
              </Field>
              <Field label="Полный объём за семестр (не только upcoming)">
                <input
                  name="total"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Автоматически при полном календаре"
                  defaultValue={component.expected_total ?? ""}
                />
              </Field>
              <label className="checkbox">
                <input
                  name="complete"
                  type="checkbox"
                  defaultChecked={component.complete}
                />
                Подтверждаю: вся история и все будущие пары внесены
              </label>
              <p className="help">
                Пустой объём + полный календарь: считаем все неотменённые
                занятия. Ручной объём после отмены требует сверки.
              </p>
              <button className="primary wide" disabled={blocked}>
                Сохранить требование
              </button>
              {component.sessions.length === 0 && (
                <button
                  type="button"
                  className="danger wide"
                  disabled={blocked}
                  onClick={() =>
                    void act(async () => {
                      await api(
                        `/components/${component.id}?version_number=${component.version}`,
                        "DELETE",
                      );
                      back();
                    }, "Пустой компонент удалён")
                  }
                >
                  Удалить пустой компонент
                </button>
              )}
            </form>
          </Modal>
        )}
        {modal === "session" && lessonComponent && (
          <Modal
            title={lesson ? "Детали занятия" : "Добавить занятие"}
            close={close}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void act(async () => {
                  await api(
                    lesson ? `/sessions/${lesson.id}` : "/sessions",
                    lesson ? "PUT" : "POST",
                    {
                      component_id: lessonComponent.id,
                      start: warsawISO(String(fd.get("start"))),
                      end: warsawISO(String(fd.get("end"))),
                      location: fd.get("location"),
                      units:
                        fd.get("units") === "" ? null : Number(fd.get("units")),
                      cancelled: fd.get("cancelled") === "on",
                      version: lesson?.version || 0,
                      reset_overrides: fd.get("reset") === "on",
                    },
                  );
                });
              }}
            >
              <p className="help">
                {lessonComponent.course.display_name} · {lessonComponent.kind}
                <br />
                Все даты и время — Europe/Warsaw.
              </p>
              <Field label="Начало">
                <input
                  type="datetime-local"
                  name="start"
                  required
                  defaultValue={lesson ? localInput(lesson.start) : ""}
                />
              </Field>
              <Field label="Конец">
                <input
                  type="datetime-local"
                  name="end"
                  required
                  defaultValue={lesson ? localInput(lesson.end) : ""}
                />
              </Field>
              <Field label="Аудитория / онлайн">
                <input
                  name="location"
                  maxLength={1000}
                  defaultValue={lesson?.location}
                />
              </Field>
              <Field label="Академические единицы (если используются)">
                <input
                  name="units"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={lesson?.units ?? ""}
                />
              </Field>
              <label className="checkbox">
                <input
                  name="cancelled"
                  type="checkbox"
                  defaultChecked={lesson?.cancelled}
                />
                Занятие отменено (история сохраняется)
              </label>
              {lesson && lesson.source !== "manual" && (
                <>
                  <p className="help">
                    Источник: {lesson.source}. Изменения сохраняются поверх
                    расписания.
                  </p>
                  {Object.keys(lesson.overrides).length > 0 && (
                    <label className="checkbox">
                      <input name="reset" type="checkbox" />
                      Сбросить изменения к последней версии импорта
                    </label>
                  )}
                </>
              )}
              <button className="primary wide" disabled={blocked}>
                Сохранить занятие
              </button>
            </form>
            {lesson && (
              <form
                className="attendance-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  markMany(
                    [lesson.id],
                    String(fd.get("status")) as Status,
                    String(fd.get("note")),
                  );
                  setModal(null);
                }}
              >
                <h3>Посещаемость и заметка</h3>
                <Field label="Отметка">
                  <select
                    name="status"
                    defaultValue={lesson.attendance.status}
                    disabled={!lesson.finished || lesson.cancelled}
                  >
                    <option value="unmarked">Не отмечено</option>
                    <option value="present">Был</option>
                    <option value="absent">Пропустил</option>
                  </select>
                </Field>
                <Field label="Заметка">
                  <textarea
                    name="note"
                    maxLength={4000}
                    defaultValue={lesson.attendance.note}
                    placeholder="Например: преподаватель зачёл посещение"
                  />
                </Field>
                <button
                  className="secondary wide"
                  disabled={blocked || !lesson.finished || lesson.cancelled}
                >
                  Сохранить отметку
                </button>
                {(!lesson.finished || lesson.cancelled) && (
                  <small>
                    Отметки доступны только для завершившихся неотменённых пар.
                  </small>
                )}
              </form>
            )}
          </Modal>
        )}
        {modal === "import" && preview && (
          <Modal title="Предпросмотр расписания" close={close}>
            <p>
              {date(preview.start)} — {date(preview.end)}
              <br />
              Новых: {preview.added} · существующих: {preview.updated} · отмен:{" "}
              {preview.cancelled}
            </p>
            <div className="warning">
              <div>
                {preview.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                <p>
                  Отсутствующие события не удаляются. Полнота и требования не
                  подтверждаются импортом.
                </p>
              </div>
            </div>
            <div className="import-list">
              {preview.events.map((e) => (
                <article key={e.index}>
                  <strong>
                    {e.name} <span className="type-tag">{e.kind}</span>
                  </strong>
                  <p>
                    {date(e.start)} · {time(e.start)} ·{" "}
                    {e.cancelled
                      ? "Отмена"
                      : e.action === "new"
                        ? "Новое"
                        : "Обновление"}
                  </p>
                  {e.candidates.length > 0 && (
                    <Field label="Возможно, это уже существующая пара">
                      <select
                        required
                        value={resolutions[e.index] ?? ""}
                        onChange={(v) =>
                          setResolutions({
                            ...resolutions,
                            [e.index]: Number(v.target.value),
                          })
                        }
                      >
                        <option value="" disabled>
                          Выберите действие
                        </option>
                        <option value="-1">Пропустить</option>
                        <option value="0">Создать отдельно</option>
                        {e.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            Сопоставить: {date(c.start)} {time(c.start)} (
                            {c.source}, #{c.id})
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label="Компонент назначения">
                    <select
                      value={mapping[e.index] || ""}
                      onChange={(v) =>
                        setMapping({
                          ...mapping,
                          [e.index]: Number(v.target.value),
                        })
                      }
                    >
                      <option value="">
                        {e.action === "update"
                          ? "Сохранить существующий"
                          : "Создать / найти по явному ID"}
                      </option>
                      {data.components
                        .filter((c) => c.semester_id === semester?.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.course.display_name} / {c.kind} · #{c.id}
                          </option>
                        ))}
                    </select>
                  </Field>
                </article>
              ))}
            </div>
            <button
              className="primary wide"
              disabled={
                blocked ||
                preview.events.some(
                  (e) =>
                    e.candidates.length > 0 &&
                    resolutions[e.index] === undefined,
                )
              }
              onClick={() =>
                void act(
                  () =>
                    api("/import/commit", "POST", {
                      token: preview.token,
                      resolutions,
                      components: mapping,
                    }),
                  "Расписание сохранено",
                )
              }
            >
              Сохранить расписание
            </button>
          </Modal>
        )}
        {modal === "restore" && restore && (
          <Modal title="Заменить данные из копии" close={close}>
            <p>
              В копии: {restore.courses} предметов, {restore.components}{" "}
              компонентов, {restore.sessions} занятий и {restore.attendance}{" "}
              отметок.
            </p>
            <div className="warning">
              <TriangleAlert size={18} />
              <p>
                Текущие данные будут заменены. Перед этим сервер создаст
                согласованную копию SQLite. Отменить замену можно
                восстановлением этой копии.
              </p>
            </div>
            <button
              className="danger wide"
              disabled={blocked}
              onClick={() =>
                void act(async () => {
                  await api("/restore/commit?confirm=true", "POST", {
                    token: restore.token,
                  });
                  setUndo(null);
                  setSelected(null);
                  setSemesterId(undefined);
                }, "Копия восстановлена")
              }
            >
              Подтверждаю замену данных
            </button>
          </Modal>
        )}
      </div>
    </FeedbackContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
