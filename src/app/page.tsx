import { AppHeader } from "@/components/app-header";
import { ReviewQueue } from "@/components/review-queue";

export default function QueuePage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-7xl p-6">
        <ReviewQueue />
      </main>
    </>
  );
}
