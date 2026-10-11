import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	clearWatchedRuns,
	getWatchedRuns,
	unwatchRun,
	useWatchedRuns,
	watchRun,
} from "./run-watch";

describe("watched runs", () => {
	it("remembers the runs started in this session, once each", () => {
		const { result } = renderHook(() => useWatchedRuns());

		act(() => {
			watchRun("run_1");
			watchRun("run_2");
			watchRun("run_1");
		});

		expect(result.current).toEqual(["run_1", "run_2"]);
		expect(getWatchedRuns()).toEqual(["run_1", "run_2"]);
	});

	it("forgets a run once it has been announced", () => {
		const { result } = renderHook(() => useWatchedRuns());

		act(() => {
			watchRun("run_1");
			unwatchRun("run_1");
			unwatchRun("run_missing");
		});

		expect(result.current).toEqual([]);
	});

	it("clears everything for the next test", () => {
		act(() => {
			watchRun("run_1");
			clearWatchedRuns();
		});
		expect(getWatchedRuns()).toEqual([]);
	});
});
