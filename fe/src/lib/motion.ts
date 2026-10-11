import {
	type Transition,
	useReducedMotion,
	type Variants,
} from "framer-motion";

export const easeOut: Transition["ease"] = [0.22, 1, 0.36, 1];

export const transitionFast: Transition = { duration: 0.15, ease: easeOut };
export const transitionBase: Transition = { duration: 0.24, ease: easeOut };

const fadeUp: Variants = {
	hidden: { opacity: 0, y: 6 },
	visible: { opacity: 1, y: 0, transition: transitionBase },
	exit: { opacity: 0, y: -4, transition: transitionFast },
};

const still: Variants = {
	hidden: { opacity: 1, y: 0 },
	visible: { opacity: 1, y: 0 },
	exit: { opacity: 1, y: 0 },
};

// Variants for content that fades and rises in. Under prefers-reduced-motion
// the element renders in its final state with no movement.
export function useFadeUp(): Variants {
	return useReducedMotion() ? still : fadeUp;
}

export function staggerChildren(stagger = 0.03): Variants {
	return {
		hidden: {},
		visible: { transition: { staggerChildren: stagger } },
	};
}
