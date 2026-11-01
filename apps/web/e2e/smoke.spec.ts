import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("manual GET and POST, saved request, history and dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Request builder" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByLabel("Response body")).toContainText("Notebook");
  await expect(page.getByText("200", { exact: true })).toBeVisible();

  const screenshots = resolve(import.meta.dirname, "../../../docs/screenshots");
  mkdirSync(screenshots, { recursive: true });
  await page.screenshot({
    path: resolve(screenshots, "workspace.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "POST /items" }).click();
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByLabel("Response body")).toContainText("Eraser");
  await expect(page.getByText("201", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save request" }).click();
  await expect(
    page.getByRole("heading", { name: "Saved requests" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "New collection name" })
    .fill("Demo examples");
  await page.getByRole("button", { name: "Create collection" }).click();
  await expect(
    page.getByRole("heading", { name: /Demo examples/ }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Saved request name" })
    .fill("Create eraser");
  await page
    .getByRole("combobox", { name: "Save to collection" })
    .selectOption({ label: "Demo examples" });
  await page.getByRole("button", { name: "Save request" }).click();
  await expect(page.getByText("Create eraser")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "collections" }).click();
  await expect(page.getByText("Create eraser")).toBeVisible();
  await page.getByRole("button", { name: "history" }).click();
  await expect(
    page.getByRole("heading", { name: "Request history" }),
  ).toBeVisible();
  await expect(page.getByText(/127\.0\.0\.1:8001/).first()).toBeVisible();
  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Recent requests" }),
  ).toBeVisible();
  await expect(page.getByText("Total requests")).toBeVisible();
  await page.screenshot({
    path: resolve(screenshots, "dashboard.png"),
    fullPage: true,
  });
});

test("keyboard navigation, blocked destinations and malformed import on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Request URL" })
    .fill("http://example.com/private");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Only the bundled demo API",
  );
  await page.getByRole("button", { name: "collections" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Saved requests" }),
  ).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":2,"collections":[]}'),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Invalid collection file or version",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
});
