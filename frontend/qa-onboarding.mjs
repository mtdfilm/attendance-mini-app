import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 360, height: 800 },
  timezoneId: "Asia/Tokyo",
});
try {
  await page.goto("http://127.0.0.1:8001");
  await page
    .getByRole("heading", { name: "Расписание начинается здесь" })
    .waitFor();
  await page.screenshot({ path: ".qa/empty-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Предмет", exact: true }).click();
  await page.getByLabel("Название", { exact: true }).fill("QA · 2020");
  await page.getByLabel("Начало", { exact: true }).fill("2020-01-01");
  await page.getByLabel("Конец", { exact: true }).fill("2020-12-31");
  await page.getByRole("button", { name: "Сохранить семестр" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Предмет", exact: true }).click();
  await page.getByLabel("Название предмета").fill("QA Course");
  await page.getByLabel("Исходный код типа").fill("Lab");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("heading", { name: "QA Course", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Редактировать предмет и требования" })
    .click();
  await page.getByLabel("Требование", { exact: true }).selectOption("percent");
  await page.getByLabel("Значение требования").fill("75");
  await page.getByLabel("Подтверждаю:").check();
  await page.getByRole("button", { name: "Сохранить требование" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Занятие", exact: true }).click();
  await page.getByLabel("Начало", { exact: true }).fill("2020-10-02T10:00");
  await page.getByLabel("Конец", { exact: true }).fill("2020-10-02T11:30");
  await page.getByLabel("Аудитория / онлайн").fill("Online");
  await page.getByRole("button", { name: "Сохранить занятие" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".tile-time")).toHaveText("10:00–11:30");
  await page.locator(".tile").click();
  await page.getByLabel("Отметка", { exact: true }).selectOption("present");
  await page.getByLabel("Заметка", { exact: true }).fill("QA note");
  await page
    .getByRole("button", { name: "Сохранить отметку", exact: true })
    .click();
  await expect(page.locator(".save-status")).toContainText("Отметки сохранены");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const text =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:qa-file-event\r\nDTSTART:20201012T100000Z\r\nDTEND:20201012T113000Z\r\nSUMMARY:QA Course: Lab\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
  await page
    .locator('input[type=file][accept=".ics,text/calendar"]')
    .setInputFiles({
      name: "test.ics",
      mimeType: "text/calendar",
      buffer: Buffer.from(text),
    });
  await page
    .getByRole("heading", { name: "Предпросмотр расписания", exact: true })
    .waitFor();
  await page
    .getByLabel("Компонент назначения")
    .selectOption({ label: "QA Course / Lab · #1" });
  await page
    .getByRole("button", { name: "Сохранить расписание", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Экспортировать JSON", exact: true })
    .click();
  const download = await downloadPromise;
  const target = ".qa/onboarding-export.json";
  await download.saveAs(target);
  await page
    .locator('input[type=file][accept=".json,application/json"]')
    .setInputFiles(target);
  await page
    .getByRole("heading", { name: "Заменить данные из копии" })
    .waitFor();
  await page.getByRole("button", { name: "Подтверждаю замену данных" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.locator(".subject-button").click();
  await expect(page.locator(".tile")).toHaveCount(2);
  assert(
    (await page.locator(".tile").first().getAttribute("class")).includes(
      "present",
    ),
  );
  console.log(
    "PASS: empty onboarding, semester/course/requirement/session forms, Warsaw time in Tokyo browser, attendance note, ICS preview/mapping/commit, JSON export and confirmed restore.",
  );
} catch (e) {
  await page.screenshot({ path: ".qa/onboarding-failure.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
}
