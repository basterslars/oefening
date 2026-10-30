import { Repo } from "@/lib/repo";
import { NewsletterPage } from "./NewsletterPage";

export const dynamic = "force-dynamic";

export default function LatestNewsletter() {
  return <NewsletterPage row={new Repo().latestNewsletter()} />;
}
