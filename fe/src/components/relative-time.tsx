import { formatDateTime, formatRelativeTime } from "#/lib/format";

// Relative timestamp with the absolute date available on hover and to
// assistive tech via the <time> element.
export function RelativeTime({
	iso,
	className,
}: {
	iso: string | null | undefined;
	className?: string;
}) {
	if (!iso) return <span className={className}>—</span>;
	return (
		<time dateTime={iso} title={formatDateTime(iso)} className={className}>
			{formatRelativeTime(iso)}
		</time>
	);
}
