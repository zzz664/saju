"use client";

import { useEffect, useRef, useState } from "react";
import { ApiTestConfigSchema, ApiTestRunSchema, apiTestRunHeading, apiTestStyleIssueMessage, type ApiTestConfig, type ApiTestRun } from "../../../application/dev-api-test/index";
import styles from "./test.module.css";

async function fetchConfiguration(): Promise<ApiTestConfig | null> {
  const response = await fetch("/api/dev/api-test/config", { cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Configuration unavailable.");
  return ApiTestConfigSchema.parse(await response.json());
}
const reasons: Record<string, string> = { LIVE_FLAG_DISABLED: "서버에서 Live 테스트가 꺼져 있습니다.", KEY_MISSING: "서버 API 키가 설정되지 않았습니다.", LIVE_PROVIDER_UNAVAILABLE: "서버 Provider가 준비되지 않았습니다.", STORE_UNAVAILABLE: "영속 예산 장부를 확인해 주세요." };
export default function ApiTestForm() {
  const [config, setConfig] = useState<ApiTestConfig | null>(null), [secret, setSecret] = useState("");
  const [mode, setMode] = useState<"mock" | "live">("mock"), [ack, setAck] = useState(false);
  const [fixture, setFixture] = useState("synthetic-known"), [persona, setPersona] = useState("synthetic-style");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("잠금 상태를 확인하고 있습니다."), [run, setRun] = useState<ApiTestRun | null>(null);
  const controller = useRef<AbortController | null>(null);
  async function refresh() {
    const configuration = await fetchConfiguration(); setConfig(configuration);
    setNotice(configuration ? "LIVE_NOT_RUN · 실행 버튼을 누르기 전에는 테스트를 호출하지 않습니다." : "개발자 잠금해제가 필요합니다.");
  }
  useEffect(() => {
    let active = true;
    void fetchConfiguration().then(configuration => {
      if (active) { setConfig(configuration); setNotice(configuration ? "LIVE_NOT_RUN · 실행 버튼을 누르기 전에는 테스트를 호출하지 않습니다." : "개발자 잠금해제가 필요합니다."); }
    }).catch(() => { if (active) setNotice("전용 실행 명령과 서버 잠금해제 비밀·예산 설정을 확인해 주세요."); });
    return () => { active = false; controller.current?.abort(); };
  }, []);
  async function unlock(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const response = await fetch("/api/dev/api-test/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret }) });
      setSecret("");
      if (!response.ok) { setNotice(response.status === 429 ? "잠금해제 시도 한도입니다. 1분 뒤 다시 시도해 주세요." : "잠금해제 비밀과 서버 설정을 확인해 주세요."); return; }
      await refresh();
    } catch { setNotice("잠금해제 요청을 완료하지 못했습니다."); } finally { setBusy(false); }
  }
  async function execute(event: React.FormEvent) {
    event.preventDefault(); if (!config || busy || mode === "live" && (!ack || !config.liveAvailable)) return;
    setBusy(true); setRun(null); setNotice("실행 중입니다."); controller.current = new AbortController();
    try {
      const response = await fetch("/api/dev/api-test/runs", { method: "POST", signal: controller.current.signal,
        headers: { "content-type": "application/json", "x-api-test-csrf": config.csrfToken },
        body: JSON.stringify({ mode, scenario: "narration", fixtureId: fixture, featureId: "core-base", personaId: persona, acknowledgedCost: ack, requestId: crypto.randomUUID() }) });
      const raw = await response.json(), parsed = ApiTestRunSchema.safeParse(raw);
      if (parsed.success) { setRun(parsed.data); setNotice(apiTestRunHeading(parsed.data)); }
      else { setNotice(response.status === 401 ? "잠금해제 세션이 만료되었습니다." : response.status === 429 ? "실행 횟수 또는 예약 토큰 한도입니다." : "요청이 차단되었거나 실행에 실패했습니다."); }
      const updated = await fetch("/api/dev/api-test/config", { cache: "no-store" });
      if (updated.ok) setConfig(ApiTestConfigSchema.parse(await updated.json())); else if (updated.status === 401) setConfig(null);
    } catch { setNotice(controller.current?.signal.aborted ? "요청을 중단했습니다. 서버에서 이미 처리된 작업은 남을 수 있습니다." : "실행 응답을 받지 못했습니다."); }
    finally { setBusy(false); setAck(false); controller.current = null; }
  }
  function exportEvidence() {
    if (!run) return;
    const { result: _result, ...metadata } = run; void _result;
    const url = URL.createObjectURL(new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${run.mode}-test-evidence.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <main className={styles.main}>
    <a href="/dev/validation">개발자 검증으로</a>
    <h1>개발자 API 테스트</h1><p>로컬 개발 전용 · 가상 사례만 사용합니다.</p>
    {!config ? <form onSubmit={unlock} className={styles.card}>
      <h2>개발자 잠금해제</h2><p>API 키 입력란이 아닙니다. 서버의 DEV_TEST_SESSION_SECRET과 같은 값을 입력하세요.</p>
      <label htmlFor="unlock-secret">잠금해제 비밀</label><input id="unlock-secret" type="password" autoComplete="off" maxLength={256} value={secret} onChange={event => setSecret(event.target.value)} disabled={busy} required />
      <button disabled={busy || !secret}>잠금해제</button>
    </form> : <form onSubmit={execute} className={styles.card}>
      <p>모델: <strong>{config.modelId}</strong> · 서버 키: {config.keyStatus === "ready" ? "준비됨" : "없음"}</p>
      <p>Mock 실행: {config.used.calls}/{config.limits.calls}회 · 예약 추정 토큰: {config.used.tokens}/{config.limits.tokens}</p>
      <p>최대 출력: {config.limits.outputTokens}토큰 · 잔여 예약량: {config.remaining.tokens}. 실제 API 사용량이 아닌 로컬 Mock 예약값입니다.</p>
      {config.liveUsed && <p>Live 실행: {config.liveUsed.calls}/{config.limits.calls}회 · 사용/미정산 예약 토큰: {config.liveUsed.tokens}/{config.limits.tokens} · 잔여: {config.liveRemaining?.tokens}. 서버 재시작 후에도 유지됩니다.</p>}
      <fieldset disabled={busy}><legend>테스트 모드</legend>
        <label><input type="radio" name="mode" checked={mode === "mock"} onChange={() => { setMode("mock"); setAck(false); setRun(null); }} />Mock</label>
        <label><input type="radio" name="mode" checked={mode === "live"} onChange={() => { setMode("live"); setAck(false); setRun(null); }} />Live</label>
      </fieldset>
      <label htmlFor="fixture">가상 사례</label><select id="fixture" value={fixture} onChange={event => setFixture(event.target.value)} disabled={busy}>{config.fixtures.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <label htmlFor="persona">합성 문체</label><select id="persona" value={persona} onChange={event => setPersona(event.target.value)} disabled={busy}>{config.personas.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <label htmlFor="feature">기능</label><select id="feature" disabled><option>기초 관찰 (core-base)</option><option disabled>F01~F11: 후속 구현 필요</option></select>
      <label htmlFor="scenario">단계</label><select id="scenario" disabled><option>기본 서술</option><option disabled>리포트 스트림: WBS-67</option><option disabled>후속 질문: WBS-68</option></select>
      {mode === "live" && <><p className={styles.blocked}>{config.liveStatus} · {config.liveAvailable ? "동의 후 실행 버튼을 누르면 가상 사례로 실제 API를 1회 호출합니다." : reasons[config.liveReason] ?? "서버 Live 설정 또는 영속 예산 장부를 확인해 주세요."}</p>
        <label className={styles.consent}><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)} disabled={busy} />실제 API 호출에는 비용이 발생할 수 있고 무료 혜택이 보장되지 않음을 확인합니다.</label></>}
      <button disabled={busy || mode === "live" && (!ack || !config.liveAvailable)}>테스트 실행</button>
      {busy && <button type="button" onClick={() => controller.current?.abort()}>중단</button>}
    </form>}
    <p role="status" aria-live="polite">{notice}</p>
    {run && <section className={styles.card} aria-label={`${run.mode === "mock" ? "Mock" : "Live"} 실행 결과`}><h2>{apiTestRunHeading(run)}</h2>
      <p>종합 검증 결과: {run.evidence ?? run.status}</p>
      {run.mode === "live" && run.providerStatus === "completed" && run.verdict?.styleHeuristicPassed === false && <p>OpenAI 응답 생성은 완료됐습니다. 아래 문체 검사 항목을 통과하지 못해 종합 결과는 LIVE_FAILED입니다. 사용 토큰은 그대로 반영되며 자동 재호출하지 않습니다.</p>}
      {run.result?.sections.flatMap(section => section.paragraphs).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      {run.errorCode && <p>오류 코드: {run.errorCode}</p>}
      <p>{run.mode === "mock" ? "실 API 토큰 사용량: 미측정 · 외부 호출 없음" : `실 API 입력 토큰: ${run.inputTokens ?? "미확인"} · 출력 토큰: ${run.outputTokens ?? "미확인"} · 응답 상태: ${run.providerStatus ?? "미확인"}`}</p>
      <p>소요 시간: {run.durationMs ?? "미확인"}ms</p>
      {run.verdict && <p>근거 ID 검사: {run.verdict.evidenceIdsValid ? "통과" : "실패"} · 문체 규칙 검사: {run.verdict.styleHeuristicPassed ? "통과" : "실패"}. 의미·자연스러움은 수동 검토가 필요합니다.</p>}
      {!!run.styleIssues?.length && <ul aria-label="문체 검사 상세">{run.styleIssues.map(issue => <li key={`${issue.sectionId}:${issue.code}`}>{issue.code} · {apiTestStyleIssueMessage(issue.code, run.expectedRegister)} (섹션: {issue.sectionId})</li>)}</ul>}
      <button type="button" onClick={exportEvidence}>비식별 증빙 내보내기</button>
    </section>}
  </main>;
}
