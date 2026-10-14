import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.QA_URL || "http://127.0.0.1:8000";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  timezoneId: "America/New_York",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await fs.mkdir(".qa", { recursive: true });
try {
  await page.goto(base);
  await page.getByRole("heading", { name: "Обзор", exact: true }).waitFor();
  await page.locator(".table-scroll table").waitFor();
  await page.screenshot({ path: ".qa/desktop-light.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Page must not overflow horizontally",
  );
  const sticky = await page
    .locator("thead th")
    .first()
    .evaluate((el) => getComputedStyle(el).position);
  assert.equal(sticky, "sticky");
  await page.locator(".table-scroll").evaluate((el) => {
    el.scrollLeft = 250;
    el.scrollTop = 50;
  });
  assert.equal(
    await page
      .locator("tbody th")
      .first()
      .evaluate((el) => getComputedStyle(el).position),
    "sticky",
  );
  await page.locator(".table-scroll").evaluate((el) => {
    el.scrollLeft = 0;
    el.scrollTop = 0;
  });
  await page.screenshot({ path: ".qa/mobile-light.png", fullPage: true });
  const course = page
    .locator(".subject-button")
    .filter({ hasText: "Java Programming" })
    .first();
  await course.click();
  await page
    .getByRole("button", { name: "Быстрая отметка", exact: true })
    .click();
  await page
    .locator(".brush-bar")
    .getByRole("button", { name: "Пропустил", exact: true })
    .click();
  const tiles = page.locator(".tile:not(.planned):not(.cancelled)");
  const labels = await tiles.allTextContents();
  assert(labels.length >= 3);
  for (let i = 0; i < 3; i++) await tiles.nth(i).click();
  await expect(page.locator(".save-status")).toContainText("Отметки сохранены");
  await page.waitForFunction(
    () => document.querySelectorAll(".tile.pending").length === 0,
  );
  await page
    .locator(".brush-bar")
    .getByRole("button", { name: "Был", exact: true })
    .click();
  await tiles.nth(0).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".tile.pending").length === 0,
  );
  assert((await tiles.nth(0).getAttribute("class")).includes("present"));
  assert((await tiles.nth(1).getAttribute("class")).includes("absent"));
  await page
    .locator(".save-status")
    .getByRole("button", { name: "Отменить", exact: true })
    .click();
  await expect(page.locator(".save-status")).toContainText(
    "Последняя отметка отменена",
  );
  assert((await tiles.nth(0).getAttribute("class")).includes("absent"));
  // Network error must be visible; optimistic tile must return to its original state.
  await page.route("**/api/attendance", (route) => route.abort());
  await tiles.nth(0).click();
  await page.getByRole("alert").filter({ hasText: "Нет связи" }).waitFor();
  assert((await tiles.nth(0).getAttribute("class")).includes("absent"));
  await page.unroute("**/api/attendance");
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".tile.pending").length === 0,
  );
  await expect(page.locator(".save-status")).toContainText("Отметки сохранены");
  assert((await tiles.nth(0).getAttribute("class")).includes("present"));
  await page.getByRole("button", { name: "Закончить быструю отметку" }).click();
  await page.screenshot({ path: ".qa/component-mobile.png", fullPage: true });
  await page.reload();
  await page.getByRole("heading", { name: "Обзор", exact: true }).waitFor();
  await page
    .locator(".subject-button")
    .filter({ hasText: "Java Programming" })
    .first()
    .click();
  assert(
    (await page.locator(".tile").first().getAttribute("class")).includes(
      "present",
    ),
  );
  // Another independent browser session sees the same server data.
  const second = await context.newPage();
  await second.goto(base);
  await second
    .locator(".subject-button")
    .filter({ hasText: "Java Programming" })
    .first()
    .click();
  assert(
    (await second.locator(".tile").nth(1).getAttribute("class")).includes(
      "absent",
    ),
  );
  await second.close();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("button", { name: "Тёмная", exact: true }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await page.screenshot({ path: ".qa/mobile-dark.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: ".qa/desktop-dark.png", fullPage: true });
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: desktop/360px, both themes, sticky table, three marks + correction, undo, network rollback/retry, reload and second client; no uncaught browser errors.",
  );
} catch (e) {
  await page.screenshot({ path: ".qa/failure.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
}
