import { describe, expect, it } from "vitest";
import { minutesToTime, timeToMinutes, unsafeUrlReason } from "./http-contract";

describe("unsafeUrlReason (mirrors the backend's save-time SSRF guard)", () => {
	it("accepts public http and https targets", () => {
		expect(unsafeUrlReason("https://api.github.com/repos/acme/web")).toBeNull();
		expect(unsafeUrlReason("http://status.example.com")).toBeNull();
		expect(unsafeUrlReason("https://8.8.8.8/dns")).toBeNull();
	});

	it("rejects private, loopback, link-local, and metadata addresses", () => {
		const message =
			"Private, loopback and link-local addresses are not allowed";
		expect(unsafeUrlReason("http://169.254.169.254/latest/meta-data/")).toBe(
			message,
		);
		expect(unsafeUrlReason("http://10.0.0.5/")).toBe(message);
		expect(unsafeUrlReason("http://172.16.4.2/")).toBe(message);
		expect(unsafeUrlReason("http://192.168.1.1/")).toBe(message);
		expect(unsafeUrlReason("http://127.0.0.1:8000/")).toBe(message);
		expect(unsafeUrlReason("http://0.0.0.0/")).toBe(message);
		expect(unsafeUrlReason("http://[::1]/")).toBe(message);
		expect(unsafeUrlReason("http://[::ffff:10.1.2.3]/")).toBe(message);
	});

	it("rejects internal hostnames", () => {
		const message = "Internal hostnames are not allowed";
		expect(unsafeUrlReason("http://localhost:3000/")).toBe(message);
		expect(unsafeUrlReason("http://db.internal/")).toBe(message);
		expect(unsafeUrlReason("http://printer.local/")).toBe(message);
		expect(unsafeUrlReason("http://intranet/")).toBe(message);
		expect(unsafeUrlReason("http://metadata.google.internal/")).toBe(message);
	});

	it("rejects anything that is not an http(s) URL", () => {
		expect(unsafeUrlReason("ftp://files.example.com")).toBe(
			"Only http and https URLs are allowed",
		);
		expect(unsafeUrlReason("not a url")).toBe("Enter a valid URL");
	});
});

describe("time of day helpers", () => {
	it("converts HH:MM to minutes after midnight and back", () => {
		expect(timeToMinutes("09:00")).toBe(540);
		expect(timeToMinutes("00:00")).toBe(0);
		expect(timeToMinutes("23:59")).toBe(1439);
		expect(minutesToTime(540)).toBe("09:00");
		expect(minutesToTime(1439)).toBe("23:59");
	});

	it("rejects malformed times", () => {
		expect(timeToMinutes("9am")).toBeNull();
		expect(timeToMinutes("24:00")).toBeNull();
		expect(timeToMinutes("12:60")).toBeNull();
	});
});
