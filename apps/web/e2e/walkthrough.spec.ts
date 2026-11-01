import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 1280, height: 800 },
  video: { mode: "on", size: { width: 1280, height: 800 } },
});

// Deliberate presentation pauses: this is a real browser recording, not a CI smoke test.
test("record a local demo walkthrough", async ({ page }) => {
  test.setTimeout(90_000);
  const pause = () => page.waitForTimeout(3_500);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Request builder" }),
  ).toBeVisible();
  await pause();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByLabel("Response body")).toContainText("Notebook");
  await pause();
  await page.getByRole("tab", { name: /Headers/ }).click();
  await pause();
  await page.getByRole("button", { name: "POST /items" }).click();
  await pause();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("201", { exact: true })).toBeVisible();
  await pause();
  await page.getByRole("button", { name: "Save request" }).click();
  await page
    .getByRole("textbox", { name: "New collection name" })
    .fill("Demo examples");
  await page.getByRole("button", { name: "Create collection" }).click();
  await page
    .getByRole("textbox", { name: "Saved request name" })
    .fill("Create eraser");
  await page
    .getByRole("combobox", { name: "Save to collection" })
    .selectOption({ label: "Demo examples" });
  await page.getByRole("button", { name: "Save request" }).click();
  await expect(page.getByText("Create eraser")).toBeVisible();
  await pause();
  await page.getByRole("button", { name: "history" }).click();
  await expect(
    page.getByRole("heading", { name: "Request history" }),
  ).toBeVisible();
  await pause();
  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Recent requests" }),
  ).toBeVisible();
  await pause();

  const path = resolve(import.meta.dirname, "../../../docs/walkthrough.webm");
  mkdirSync(resolve(import.meta.dirname, "../../../docs"), { recursive: true });
  const video = page.video();
  await page.close();
  if (!video) throw new Error("Playwright video recording unavailable");
  await video.saveAs(path);
});
