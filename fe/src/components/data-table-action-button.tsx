import { Loader2 } from "lucide-react";
import {
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react";
import { Button } from "#/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";

export function DataTableActionsCell({ children }: { children: ReactNode }) {
	return <div className="flex items-center justify-end gap-1">{children}</div>;
}

type Props = {
	label: string;
	icon: ReactNode;
	pending?: boolean;
	disabled?: boolean;
	destructive?: boolean;
	onClick?: () => void;
	asChild?: boolean;
	children?: ReactElement<{ "aria-label"?: string; className?: string }>;
};

export function DataTableActionButton({
	label,
	icon,
	pending = false,
	disabled = false,
	destructive = false,
	onClick,
	asChild = false,
	children,
}: Props) {
	const className = cn(
		"h-8 w-8 text-foreground",
		destructive &&
			"text-destructive hover:bg-destructive hover:text-destructive-foreground",
	);
	const content = pending ? (
		<Loader2 className="size-4 animate-spin" aria-hidden="true" />
	) : (
		icon
	);

	if (asChild && isValidElement(children) && !pending && !disabled) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						asChild
						aria-label={label}
						className={className}
						size="icon"
						variant="outline"
					>
						{cloneElement(
							children,
							{
								"aria-label": label,
								className: cn("no-underline", children.props.className),
							},
							icon,
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent>{label}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					aria-label={label}
					className={className}
					disabled={disabled || pending}
					onClick={onClick}
					size="icon"
					variant="outline"
				>
					{content}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
