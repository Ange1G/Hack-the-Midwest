// Rules of the team's HTTP contract, mirrored from the backend
// (api/src/app/domains/primitives/http_contract.py) so the builder can refuse
// what the API would refuse before a request is made.

export const CONTRACT_VERSION = 1 as const;
export const SECRET_PLACEHOLDER = "********";
export const MAX_RETRIES = 5;
export const MIN_TIMEOUT_MS = 100;
export const MAX_TIMEOUT_MS = 60_000;
export const MAX_CREDENTIAL_LENGTH = 4_096;
export const MAX_PRIMITIVES_PER_AGENT = 20;
export const MAX_SYSTEM_PROMPT_LENGTH = 20_000;
export const PRIMITIVE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
export const PRIMITIVE_NAME_MESSAGE =
	"Use lowercase letters, numbers and underscores, starting with a letter";

const ADDRESS_MESSAGE =
	"Private, loopback and link-local addresses are not allowed";
const HOSTNAME_MESSAGE = "Internal hostnames are not allowed";
const INTERNAL_NAME_SUFFIXES = [
	".localhost",
	".local",
	".internal",
	".lan",
	".home.arpa",
];

function parseIpv4(host: string): number[] | null {
	const parts = host.split(".");
	if (parts.length !== 4) return null;
	const octets = parts.map((part) =>
		/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN,
	);
	return octets.some((octet) => Number.isNaN(octet) || octet > 255)
		? null
		: octets;
}

// "a01:203" is how the URL parser serialises the IPv4-mapped "::ffff:10.1.2.3".
function parseMappedHex(rest: string): number[] | null {
	const match = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
	if (!match) return null;
	const high = Number.parseInt(match[1] ?? "0", 16);
	const low = Number.parseInt(match[2] ?? "0", 16);
	return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function isBlockedIpv4(octets: number[]): boolean {
	const [a = 0, b = 0] = octets;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		a >= 224
	);
}

function isBlockedIpv6(host: string): boolean {
	return (
		host === "::1" ||
		host === "::" ||
		/^fe[89ab]/.test(host) ||
		/^f[cd]/.test(host) ||
		/^ff/.test(host)
	);
}

export function unsafeUrlReason(raw: string): string | null {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return "Enter a valid URL";
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return "Only http and https URLs are allowed";
	}
	const host = url.hostname
		.replace(/^\[|\]$/g, "")
		.replace(/\.$/, "")
		.toLowerCase();

	const ipv4 = parseIpv4(host);
	if (ipv4) return isBlockedIpv4(ipv4) ? ADDRESS_MESSAGE : null;

	if (host.includes(":")) {
		if (host.startsWith("::ffff:")) {
			const rest = host.slice("::ffff:".length);
			const mapped = parseIpv4(rest) ?? parseMappedHex(rest);
			if (mapped) return isBlockedIpv4(mapped) ? ADDRESS_MESSAGE : null;
		}
		return isBlockedIpv6(host) ? ADDRESS_MESSAGE : null;
	}

	if (
		host === "localhost" ||
		INTERNAL_NAME_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
		!host.includes(".")
	) {
		return HOSTNAME_MESSAGE;
	}
	return null;
}

// Schedule times travel as minutes after midnight (540 = 09:00).

export function timeToMinutes(value: string): number | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) return null;
	return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
