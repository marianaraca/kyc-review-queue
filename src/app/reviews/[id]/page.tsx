import { AppHeader } from "@/components/app-header";
import { ReviewDetail } from "@/components/review-detail";

export default function ReviewDetailPage({ params }: { params: { id: string } }) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl p-6">
        <ReviewDetail id={params.id} />
      </main>
    </>
  );
}
