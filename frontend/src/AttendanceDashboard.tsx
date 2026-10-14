import { useState } from "react";
import { Check, X, CircleHelp, ArrowUpRight, BarChart3 } from "lucide-react";
import type { Data, Status } from "./types";
import { date } from "./api";

const chartStates: Status[] = ["present", "absent", "unmarked"];
const chartLabels = {
  present: "Был",
  absent: "Пропустил",
  unmarked: "Не отмечено",
};

export function AttendanceDashboard({
  analytics,
  onUnmarked,
}: {
  analytics: Data["analytics"];
  onUnmarked: () => void;
}) {
  const [period, setPeriod] = useState<"recent" | "all">("recent");
  if (!analytics) return null;
  const history = analytics[period];
  const maximum = Math.max(
    1,
    ...history.weeks.map((w) =>
      chartStates.reduce((n, state) => n + w[state], 0),
    ),
  );
  return (
    <section
      className="panel attendance-dashboard"
      aria-labelledby="history-title"
    >
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">ВАШ РИТМ</div>
          <h2 id="history-title">Посещения и пропуски</h2>
        </div>
        <div className="segmented compact" aria-label="Период графика">
          <button
            className={period === "recent" ? "active" : ""}
            aria-pressed={period === "recent"}
            onClick={() => setPeriod("recent")}
          >
            30 дней
          </button>
          <button
            className={period === "all" ? "active" : ""}
            aria-pressed={period === "all"}
            onClick={() => setPeriod("all")}
          >
            Вся история
          </button>
        </div>
      </div>
      <div className="dashboard-layout">
        <div className="history-metrics">
          <div className="history-metric present-text">
            <span>
              <Check size={15} />
              Был
            </span>
            <strong>{history.totals.present}</strong>
            <small>занятий</small>
          </div>
          <div className="history-metric error-text">
            <span>
              <X size={15} />
              Пропустил
            </span>
            <strong>{history.totals.absent}</strong>
            <small>занятий</small>
          </div>
          <button
            className="history-metric unmarked-metric"
            onClick={onUnmarked}
          >
            <span>
              <CircleHelp size={15} />
              Не отмечено
            </span>
            <strong>{history.totals.unmarked}</strong>
            <small>
              Разобрать <ArrowUpRight size={12} />
            </small>
          </button>
        </div>
        <figure className="history-figure">
          <div className="chart-caption">
            <span>
              <BarChart3 size={14} />
              По неделям
            </span>
            <small>
              {date(history.start + "T12:00:00Z")} —{" "}
              {date(history.end + "T12:00:00Z")}
            </small>
          </div>
          <div className="history-chart-scroll">
            <div
              className="history-chart"
              style={{
                gridTemplateColumns: `repeat(${history.weeks.length}, minmax(38px,1fr))`,
              }}
              aria-hidden="true"
            >
              {history.weeks.map((week) => {
                const total = chartStates.reduce(
                  (n, state) => n + week[state],
                  0,
                );
                return (
                  <div
                    className="week-column"
                    key={week.start}
                    title={`${date(week.start + "T12:00:00Z")}: был ${week.present}, пропустил ${week.absent}, не отмечено ${week.unmarked}`}
                  >
                    <span className="week-total">{total || "·"}</span>
                    <div className="week-track">
                      <div
                        className="week-stack"
                        style={{ height: `${(total / maximum) * 100}%` }}
                      >
                        {chartStates.map(
                          (state) =>
                            week[state] > 0 && (
                              <span
                                key={state}
                                className={`chart-segment ${state}`}
                                style={{ flex: week[state] }}
                              />
                            ),
                        )}
                      </div>
                    </div>
                    <span className="week-label">
                      {date(week.start + "T12:00:00Z", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <figcaption className="chart-legend">
            {chartStates.map((state) => (
              <span key={state}>
                <i className={state} />
                {chartLabels[state]}
              </span>
            ))}
          </figcaption>
          <div className="chart-accessibility"><table>
            <caption>История завершённых занятий по неделям</caption>
            <thead>
              <tr>
                <th>Неделя</th>
                <th>Был</th>
                <th>Пропустил</th>
                <th>Не отмечено</th>
              </tr>
            </thead>
            <tbody>
              {history.weeks.map((w) => (
                <tr key={w.start}>
                  <th>
                    {w.start} — {w.end}
                  </th>
                  <td>{w.present}</td>
                  <td>{w.absent}</td>
                  <td>{w.unmarked}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </figure>
      </div>
      <div className="dashboard-footnote">
        Отмечено {history.marked} из {history.completed} завершённых занятий за
        период. Неотмеченные не считаются пропусками; отменённые исключены.
      </div>
    </section>
  );
}
