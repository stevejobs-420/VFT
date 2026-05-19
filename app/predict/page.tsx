import { requireUser } from "@/lib/auth";
import { loadPredictPageData } from "@/lib/predict-data";
import { PredictForm } from "@/components/predict/PredictForm";

export default async function PredictPage() {
  const user = await requireUser();
  const data = await loadPredictPageData(user.id);
  return <PredictForm initialData={data} />;
}
