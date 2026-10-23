import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocalDeveloperHost } from "../../../server/developer-analysis";
import DeveloperAnalysisForm from "./validation-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "개발자 계산 검증", robots: { index: false, follow: false } };

export default async function DeveloperValidationPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  if (!isLocalDeveloperHost((await headers()).get("host"))) notFound();
  return <DeveloperAnalysisForm />;
}
