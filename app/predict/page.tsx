import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { loadPredictPageData } from "@/lib/predict-data";
import { PredictForm } from "@/components/predict/PredictForm";

export default async function PredictPage() {
  const user = await requireUser();
  const [data, cookieStore] = await Promise.all([
    loadPredictPageData(user.id),
    cookies(),
  ]);
  const layoutCookie = cookieStore.get("vft-predict-layout")?.value;
  const initialLayout: "one" | "two" = layoutCookie === "one" ? "one" : "two";
  return <PredictForm initialData={data} initialLayout={initialLayout} />;
}
