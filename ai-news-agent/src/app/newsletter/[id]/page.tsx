import { notFound } from "next/navigation";
import { Repo } from "@/lib/repo";
import { NewsletterPage } from "../NewsletterPage";

export const dynamic = "force-dynamic";

export default async function NewsletterById({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = new Repo().getNewsletter(Number(id));
  if (!row) notFound();
  return <NewsletterPage row={row} />;
}
