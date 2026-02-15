import { Container } from "@/components/shared/Container";

export default function MusicPage() {
  return (
    <Container>
      <div className="py-8">
        <h1 className="text-3xl font-bold text-gradient-music mb-4">Music</h1>
        <p className="text-muted-foreground">Create or join a music room to listen together.</p>
      </div>
    </Container>
  );
}