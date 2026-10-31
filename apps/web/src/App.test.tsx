import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import App from "./App";

it("marks the workspace as unavailable until a later phase", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: "Local-first API workspace" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/No outbound requests are available yet/),
  ).toBeInTheDocument();
});
