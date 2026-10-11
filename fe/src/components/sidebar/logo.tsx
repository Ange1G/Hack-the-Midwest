import type { SVGProps } from "react";

/** Stragents monogram — scales with `className` (e.g. `size-5`). */
export const Logo = (props: SVGProps<SVGSVGElement>) => (
	<svg
		viewBox="0 0 24 24"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<title>Stragents</title>
		<rect
			x="1.25"
			y="1.25"
			width="21.5"
			height="21.5"
			rx="6"
			className="fill-foreground/[0.08] stroke-foreground/25"
			strokeWidth="1"
		/>
		<path
			d="M7.6 7.35c0-1.45 1.25-2.4 3-2.4 1.55 0 2.55.8 2.55 1.95 0 1-.75 1.55-2.15 1.95-1.75.5-3.2 1.05-3.2 2.85 0 1.85 1.5 3 3.55 3 1.65 0 3-.9 3.35-2.3"
			stroke="currentColor"
			strokeWidth="1.45"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<path
			d="M13.2 16.25 15.75 7.55 18.3 16.25M14.35 12.85h2.8"
			stroke="currentColor"
			strokeWidth="1.45"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);
