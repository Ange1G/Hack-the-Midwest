import { screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

export async function chooseOption(
	user: ReturnType<typeof userEvent.setup>,
	trigger: HTMLElement,
	name: string | RegExp,
): Promise<void> {
	await user.click(trigger);
	await user.click(await screen.findByRole("option", { name }));
}
