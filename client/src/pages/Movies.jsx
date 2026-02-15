import { Container } from "@/components/shared/Container";

export default function Movies() {
  return (
    <Container>
      <div className="py-8">
        <h1 className="text-3xl font-bold text-gradient-movie mb-4">Movies</h1>
        <p className="text-muted-foreground">Create or join a movie room to watch together.</p>
      </div>
    </Container>
  );
}