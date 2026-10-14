let token = "";
export function setToken(value: string) {
  token = value;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Нет связи с сервером. Изменение не подтверждено. Повторите попытку.",
    );
  }
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Сервер временно недоступен" }));
    throw new Error(error.detail || "Не удалось сохранить");
  }
  return response.json();
}
export const date = (
  s: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Warsaw",
    ...options,
  }).format(new Date(s));
export const time = (s: string) =>
  date(s, { hour: "2-digit", minute: "2-digit" });
export const day = (s: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(s));
export const localInput = (s: string) => `${day(s)}T${time(s)}`;
// Convert a Warsaw wall-clock value, independent of the browser/travel timezone.
export function warsawISO(value: string) {
  const wanted = Date.parse(value + "Z");
  let candidate = wanted;
  for (let i = 0; i < 3; i++) {
    const wall = localInput(new Date(candidate).toISOString());
    candidate += wanted - Date.parse(wall + "Z");
  }
  if (localInput(new Date(candidate).toISOString()) !== value)
    throw new Error(
      "Это местное время не существует при переходе на летнее время",
    );
  return new Date(candidate).toISOString();
}
export const labels: Record<string, string> = {
  unknown: "Недостаточно данных",
  incomplete: "Неполные данные",
  conflict: "Конфликт требования",
  achieved: "Минимум выполнен",
  impossible: "Минимум недостижим",
  all: "Все оставшиеся",
  ongoing: "Нужно ещё посещать",
  provisional: "Есть неотмеченные",
};
export const stateLabels: Record<string, string> = {
  present: "Был",
  absent: "Пропустил",
  unmarked: "Не отмечено",
  planned: "Запланировано",
  cancelled: "Отменено",
};
