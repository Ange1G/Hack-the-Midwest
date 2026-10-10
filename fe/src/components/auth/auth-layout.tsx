import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { APP_BRANDING } from "#/config/developer-contexts";

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
<<<<<<< HEAD
	return (
		<main className="flex min-h-screen items-center justify-center p-6">
			<Card className="island-shell w-full max-w-sm">
				<CardHeader>
					<p className="island-kicker">Agent Platform</p>
					<CardTitle className="display-title text-2xl">{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<CardContent>{children}</CardContent>
				<CardFooter className="justify-center text-sm text-muted-foreground">
					{footer}
				</CardFooter>
			</Card>
		</main>
	);
=======
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="muted tracking-wide island-kicker">
            {APP_BRANDING.productName}
          </p>
          <CardTitle className="display-title text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          {footer}
        </CardFooter>
      </Card>
    </main>
  );
>>>>>>> 9e7bb1f (refactor: fix layout styling)
}
