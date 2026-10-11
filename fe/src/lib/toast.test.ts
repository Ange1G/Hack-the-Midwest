import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clearToasts, dismissToast, toast, useToasts } from "./toast";

describe("toast store", () => {
	it("adds a toast with defaults and lists it for the UI", () => {
		const { result } = renderHook(() => useToasts());

		act(() => {
			toast({ title: "Uptime checker — Succeeded" });
		});

		expect(result.current).toHaveLength(1);
		expect(result.current[0]).toMatchObject({
			title: "Uptime checker — Succeeded",
			tone: "info",
			open: true,
		});
		expect(result.current[0]?.id).toBeTruthy();
	});

	it("closes a dismissed toast and removes it once its exit animation is over", async () => {
		const { result } = renderHook(() => useToasts());
		let id = "";
		act(() => {
			id = toast({ title: "Run failed", tone: "danger" });
		});

		act(() => dismissToast(id));

		expect(result.current[0]?.open).toBe(false);
		await waitFor(() => expect(result.current).toHaveLength(0));
	});

	it("keeps the newest toast first and holds at most three", () => {
		const { result } = renderHook(() => useToasts());

		act(() => {
			toast({ title: "first" });
			toast({ title: "second" });
			toast({ title: "third" });
			toast({ title: "fourth" });
		});

		expect(result.current.map((item) => item.title)).toEqual([
			"fourth",
			"third",
			"second",
		]);
	});

	it("clears everything for the next test", () => {
		const { result } = renderHook(() => useToasts());
		act(() => {
			toast({ title: "leftover" });
			clearToasts();
		});
		expect(result.current).toEqual([]);
	});
});
