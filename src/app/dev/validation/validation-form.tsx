"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnalysisInputSchema } from "@/domain/input";
import {
  DeveloperAnalysisResponseSchema,
  type DeveloperAnalysisResponse,
} from "@/domain/developer-analysis";
import styles from "@/app/dev/validation/validation.module.css";

const statusLabels = {
  complete: "계산 완료",
  partial: "일부 정보 미상",
  unavailable: "계산 불가",
} as const;
const positions = [
  ["year", "연주"],
  ["month", "월주"],
  ["day", "일주"],
  ["hour", "시주"],
] as const;
function value(data: FormData, name: string) {
  return String(data.get(name) ?? "");
}
function optionalNumber(data: FormData, name: string) {
  const text = value(data, name).trim();
  return text === "" ? null : Number(text);
}

export default function DeveloperAnalysisForm() {
  const [unknown, setUnknown] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DeveloperAnalysisResponse | null>(null);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  function clearOutput() {
    setResult(null);
    setError("");
    setCopyStatus("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    clearOutput();
    const data = new FormData(event.currentTarget);
    const parsed = AnalysisInputSchema.safeParse({
      birthInput: {
        calendarType: value(data, "calendarType"),
        birthDate: value(data, "birthDate"),
        isLeapMonth: data.has("isLeapMonth"),
        birthTime: unknown
          ? { status: "unknown" }
          : { status: "known", time: value(data, "birthTime") },
        timezoneId: value(data, "timezoneId"),
        longitudeDeg: optionalNumber(data, "longitude"),
        latitudeDeg: optionalNumber(data, "latitude"),
        directionBasis: value(data, "directionBasis"),
      },
      calculationPolicy: {
        solarTime: value(data, "solarTime"),
        dayBoundary: value(data, "dayBoundary"),
        dstDisambiguation: value(data, "dstDisambiguation"),
      },
    });
    if (!parsed.success) {
      setError(
        "입력값을 확인해 주세요. 날짜·음력/윤달·시간대·좌표와 계산 정책의 형식이 맞아야 합니다.",
      );
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setPending(true);
    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        cache: "no-store",
        signal: request.signal,
      });
      if (!response.ok) {
        setError("요청을 처리하지 못했습니다. 입력과 로컬 개발 서버를 확인해 주세요.");
        return;
      }
      const output = DeveloperAnalysisResponseSchema.safeParse(await response.json());
      if (!output.success) {
        setError("검증할 수 없는 서버 응답입니다. 결과를 표시하지 않았습니다.");
        return;
      }
      setResult(output.data);
    } catch {
      if (!request.signal.aborted)
        setError("요청을 처리하지 못했습니다. 로컬 개발 서버 연결을 확인해 주세요.");
    } finally {
      if (!request.signal.aborted) setPending(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("복사했습니다.");
    } catch {
      setCopyStatus("복사하지 못했습니다. 아래 텍스트를 직접 선택해 복사해 주세요.");
    }
  }
  const core = result?.analysis.document;
  const json = result ? JSON.stringify(result.analysis, null, 2) : "";
  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <p className={styles.badge}>개발환경 전용 · P17</p>
        <h1>개발자 계산 검증</h1>
        <p>출생 입력으로 원국과 기초 판단을 검증합니다. 결과는 이 화면에서만 유지됩니다.</p>
        <p className={styles.note}>
          기초 관찰 20개를 확인하는 도구입니다. 종합 풀이·대화·저장 기능은 포함하지 않습니다.
        </p>
      </header>
      <div className={styles.columns}>
        <section className={styles.card} aria-labelledby="input-heading">
          <h2 id="input-heading">출생정보와 계산 정책</h2>
          <form
            onSubmit={submit}
            onChange={clearOutput}
            method="post"
            action="/api/analysis"
            aria-busy={pending}
          >
            <fieldset disabled={pending}>
              <legend>출생정보</legend>
              <div className={styles.fields}>
                <label>
                  생년월일
                  <input
                    name="birthDate"
                    placeholder="YYYY-MM-DD"
                    inputMode="numeric"
                    maxLength={10}
                    required
                    autoComplete="off"
                  />
                </label>
                <div className={styles.field}>
                  <label htmlFor="calendar-type">달력</label>
                  <select id="calendar-type" name="calendarType" defaultValue="solar">
                    <option value="solar">양력</option>
                    <option value="lunar">음력</option>
                  </select>
                </div>
                <label className={styles.check}>
                  <input type="checkbox" name="isLeapMonth" />
                  음력 윤달
                </label>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={unknown}
                    onChange={(event) => setUnknown(event.target.checked)}
                  />
                  태어난 시각 미상
                </label>
                <label>
                  태어난 시각
                  <input type="time" name="birthTime" required={!unknown} disabled={unknown} />
                </label>
                <label>
                  시간대
                  <input
                    name="timezoneId"
                    defaultValue="Asia/Seoul"
                    required
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label>
                  경도 (선택)
                  <input type="number" name="longitude" min="-180" max="180" step="any" />
                </label>
                <label>
                  위도 (선택)
                  <input type="number" name="latitude" min="-90" max="90" step="any" />
                </label>
                <div className={styles.field}>
                  <label htmlFor="direction-basis">전통 순역 기준</label>
                  <select id="direction-basis" name="directionBasis" defaultValue="unspecified">
                    <option value="unspecified">미지정</option>
                    <option value="male">남성 기준</option>
                    <option value="female">여성 기준</option>
                  </select>
                </div>
              </div>
              <p className={styles.note}>
                날짜는 선택한 달력의 YYYY-MM-DD 형식입니다. 음력 2월 30일도 입력할 수 있습니다.
                시간대는 출생지의 IANA 이름입니다. 좌표를 모르면 비워 두세요. 이름은 계산에 사용하지
                않습니다.
              </p>
            </fieldset>
            <fieldset disabled={pending}>
              <legend>계산 정책</legend>
              <div className={styles.fields}>
                <div className={styles.field}>
                  <label htmlFor="solar-time">태양시 정책</label>
                  <select id="solar-time" name="solarTime" defaultValue="standard">
                    <option value="standard">표준시</option>
                    <option value="mean-solar">평태양시</option>
                    <option value="true-solar">진태양시</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="day-boundary">일자 경계</label>
                  <select id="day-boundary" name="dayBoundary" defaultValue="midnight">
                    <option value="midnight">자정 기준</option>
                    <option value="zi-start">23시 자시 시작</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="dst-policy">DST 중복·누락 시각</label>
                  <select id="dst-policy" name="dstDisambiguation" defaultValue="reject">
                    <option value="reject">확정하지 않음</option>
                    <option value="earlier">이른 시점 선택</option>
                    <option value="later">늦은 시점 선택</option>
                  </select>
                </div>
              </div>
            </fieldset>
            <button type="submit" disabled={pending}>
              {pending ? "계산 중…" : "계산 검증"}
            </button>
            {error && (
              <p role="alert" aria-label="입력 및 요청 오류" className={styles.error}>
                {error}
              </p>
            )}
            <noscript>이 검증 화면에는 JavaScript가 필요합니다.</noscript>
          </form>
        </section>
        <section className={styles.card} aria-labelledby="result-heading">
          <h2 id="result-heading">검증 결과</h2>
          {!result && (
            <p className={styles.note}>
              {pending
                ? "확정 기둥과 판단 근거를 계산하고 있습니다."
                : "입력 후 계산 검증을 실행하면 결과가 표시됩니다."}
            </p>
          )}
          {result && core && (
            <>
              <p role="status" aria-label="계산 상태" className={styles.status}>
                {statusLabels[result.analysis.status]}
              </p>
              <h3>확정 원국</h3>
              <div className={styles.pillars}>
                {positions.map(([key, name]) => {
                  const pillar = core.facts?.sourcePillars[key];
                  return (
                    <div key={key}>
                      <span>{name}</span>
                      <strong>
                        {pillar ? pillar.heavenlyStem + pillar.earthlyBranch : "미상"}
                      </strong>
                    </div>
                  );
                })}
              </div>
              <h3>미상과 제한</h3>
              <p>
                {core.calculation.information.unknownFields.length
                  ? core.calculation.information.unknownFields.join(", ")
                  : "입력 미상 항목 없음"}
              </p>
              <p>
                {core.calculation.reasons.length
                  ? core.calculation.reasons.join(", ")
                  : "계산 거절 사유 없음"}
              </p>
              <p>
                미확정·부분 규칙 {core.resolution?.uncertainties.length ?? 0}개 · 충돌{" "}
                {core.resolution?.arbitration.conflicts.length ?? 0}개
              </p>
              <h3>판단과 근거</h3>
              {core.evaluation?.findings.length ? (
                <ul className={styles.findings}>
                  {core.evaluation.findings.map((finding) => (
                    <li key={finding.findingId}>
                      <details>
                        <summary>
                          {finding.assertion}{" "}
                          <small>
                            ({finding.precision === "confirmed" ? "확정" : "부분 근거"})
                          </small>
                        </summary>
                        <p>
                          <code>{finding.ruleId}</code> · 규칙 {finding.ruleVersion}
                        </p>
                        <p>출처: {finding.sourceRefs.join(", ")}</p>
                        <ul>
                          {finding.evidence.map((atom, index) => (
                            <li key={index}>
                              <code>{atom.inputPath}</code>: {atom.value}
                            </li>
                          ))}
                        </ul>
                        {finding.caveats.map((caveat) => (
                          <p key={caveat} className={styles.note}>
                            {caveat}
                          </p>
                        ))}
                      </details>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>설명 가능한 기초 관찰이 없습니다.</p>
              )}
              <h3>버전과 체크섬</h3>
              <p className={styles.hash}>{result.analysis.fingerprint.hash}</p>
              <details>
                <summary>실제 버전 정보</summary>
                <pre>{JSON.stringify(result.analysis.fingerprint.versions, null, 2)}</pre>
              </details>
            </>
          )}
        </section>
      </div>
      {result && (
        <section className={styles.card} aria-labelledby="export-heading">
          <h2 id="export-heading">JSON과 수동 설명 요청</h2>
          <p className={styles.note}>
            원본 생년월일·시각·좌표는 내보내지 않습니다. 원국과 파생 분석도 민감할 수 있습니다.
          </p>
          <button type="button" onClick={() => copy(json)}>
            JSON 복사
          </button>
          <label htmlFor="analysis-json">분석 JSON</label>
          <textarea id="analysis-json" readOnly rows={12} value={json} spellCheck={false} />
          <button type="button" onClick={() => copy(result.manualPrompt)}>
            프롬프트 복사
          </button>
          <label htmlFor="manual-prompt">수동 ChatGPT 프롬프트</label>
          <textarea
            id="manual-prompt"
            readOnly
            rows={8}
            value={result.manualPrompt}
            spellCheck={false}
          />
          <p role="status" aria-label="복사 상태">
            {copyStatus}
          </p>
        </section>
      )}
    </main>
  );
}
