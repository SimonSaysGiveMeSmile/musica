import { SongView } from "@/components/song/SongView";

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SongView id={decodeURIComponent(id)} />;
}
