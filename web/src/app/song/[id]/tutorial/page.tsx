import { TutorialView } from "@/components/tutorial/TutorialView";

export default async function TutorialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TutorialView id={decodeURIComponent(id)} />;
}
