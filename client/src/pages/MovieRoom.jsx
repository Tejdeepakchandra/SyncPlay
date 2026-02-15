import { useParams } from "react-router-dom";
import { Container } from "@/components/shared/Container";

export default function MovieRoom() {
  const { roomId } = useParams();

  return (
    <Container>
      <div className="py-8">
        <h1 className="text-3xl font-bold text-gradient-movie mb-4">Movie Room: {roomId}</h1>
        <p className="text-muted-foreground">You're in the movie room. Video player will appear here.</p>
      </div>
    </Container>
  );
}