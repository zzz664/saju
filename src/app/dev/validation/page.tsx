import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocalDevelopmentEnvironment, isLocalDeveloperRequest } from "../../../server/developer-access";
import DeveloperAnalysisForm from "./validation-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "개발자 계산 검증", robots: { index: false, follow: false } };

export default async function DeveloperValidationPage() {
  if (!isLocalDevelopmentEnvironment(process.env)) notFound();
  if (!isLocalDeveloperRequest(new Request("http://localhost", { headers: new Headers(await headers()) }))) notFound();
  return <DeveloperAnalysisForm />;
}
