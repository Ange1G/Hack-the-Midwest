// Text links inside app content. The global `a` colour (--lagoon-deep) sits
// below the WCAG AA 4.5:1 ratio on the light surfaces, so app links put the
// text in --sea-ink and keep the accent in the underline. The `!` is needed
// because the global rule is unlayered and would otherwise beat a utility.
export const textLinkClass =
	"font-medium text-(--sea-ink)! underline decoration-(--lagoon-deep) underline-offset-2 hover:decoration-2";

// Primary links inside data tables. The global `a` rule always underlines and
// paints --lagoon-deep; tables keep body text colour and skip decoration.
export const tableLinkClass =
	"font-medium text-foreground! no-underline hover:text-(--lagoon-deep)! hover:no-underline";

// A Link rendered inside a primary <Button asChild>. Without this the global
// `a` colour paints teal text on the violet button (1.7:1).
export const buttonLinkClass = "text-(--primary-foreground)! no-underline";
