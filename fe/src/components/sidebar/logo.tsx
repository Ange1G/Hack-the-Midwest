import type { SVGProps } from "react";

export const Logo = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
	<svg
		aria-hidden="true"
		className={className}
		fill="currentColor"
		viewBox="0 0 24 24"
		{...props}
	>
		<circle cx="12" cy="12" r="8" />
	</svg>
);
