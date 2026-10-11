import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { TooltipProvider } from "#/components/ui/tooltip";
import { staggerChildren, useFadeUp } from "#/lib/motion";

const gridVariants = staggerChildren(0.04);

export function CardGrid({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider delayDuration={300}>
			<motion.ul
				className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
				initial="hidden"
				animate="visible"
				variants={gridVariants}
			>
				<AnimatePresence initial={false}>{children}</AnimatePresence>
			</motion.ul>
		</TooltipProvider>
	);
}

export function CardGridItem({ children }: { children: ReactNode }) {
	const variants = useFadeUp();
	const reduceMotion = useReducedMotion();
	return (
		<motion.li
			className="min-w-0"
			variants={variants}
			initial="hidden"
			animate="visible"
			exit="exit"
			layout={!reduceMotion}
		>
			{children}
		</motion.li>
	);
}
