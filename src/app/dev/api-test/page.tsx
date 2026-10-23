import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { apiTestLocalEnvironment, apiTestLocalRequest } from "../../../server/api-test";
import ApiTestForm from "./test-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "개발자 API 테스트", robots: { index: false, follow: false } };
export default async function ApiTestPage() {
  if (!apiTestLocalEnvironment(process.env) || !apiTestLocalRequest(new Request("http://localhost", { headers: new Headers(await headers()) }))) notFound();
  return <ApiTestForm />;
}
