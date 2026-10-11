// Inline text links inside app content: body colour with an underline that
// strengthens on hover, so links never depend on a palette colour for contrast.
export const textLinkClass =
	"font-medium text-foreground underline decoration-foreground/30 underline-offset-[3px] transition-colors hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring";

// Primary links inside data tables: plain body text that underlines on hover.
export const tableLinkClass =
	"font-medium text-foreground underline-offset-[3px] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring";

// A Link rendered inside <Button asChild>.
export const buttonLinkClass = "no-underline";

// "Back to …" link above a page title.
export const backLinkClass =
	"inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";
