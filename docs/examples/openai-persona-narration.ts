/**
 * R01 개념 예시. 프로젝트 패키지 버전/실제 FeatureResult 및 Zod 스키마에 맞춰 조정할 것.
 * 직접 실행 가능한 완성 구현 아님. 실 API 호출은 개발자 승인 테스트에서만 허용.
 */
import OpenAI from 'openai';

// 실제 프로젝트에는 문서의 시스템 프롬프트를 '코드펜스 제외'하여 이 파일 대신 import.
import { COMMON_SYSTEM_PROMPT } from '../src/infrastructure/openai/prompt/system';
import { PersonaProfileSchema } from '../src/infrastructure/openai/persona/schema';
import { NarrationResultSchema } from '../src/infrastructure/openai/persona/output-schema';
import type { FeatureResult, FeatureNarrationSpec } from '../src/schemas/feature';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const narrationJsonSchema = {
  type: 'object',
  properties: {
    featureId: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sectionId: { type: 'string' },
          title: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
          evidenceIds: { type: 'array', items: { type: 'string' } }
        },
        required: ['sectionId', 'title', 'paragraphs', 'evidenceIds'],
        additionalProperties: false
      }
    },
    limitations: { type: 'array', items: { type: 'string' } }
  },
  required: ['featureId', 'sections', 'limitations'],
  additionalProperties: false
} as const;

export async function narrateFeature(input: {
  result: FeatureResult;
  approvedPersonaJson: unknown;
  narrationSpec: FeatureNarrationSpec;
}) {
  // 1) 페르소나는 서버에 등록된 승인 프로필만 가능하다.
  const persona = PersonaProfileSchema.parse(input.approvedPersonaJson);
  if (input.result.featureId !== input.narrationSpec.featureId) {
    throw new Error('Feature mismatch');
  }
  // 2) 개인정보와 임의 지시를 제거한 허용 필드만 전송한다.
  const claims = input.result.findings.map((f) => ({
    id: f.id, topic: f.topic, assertion: f.assertion,
    evidence: f.evidence, caveats: f.caveats, precision: f.precision
  }));
  const response = await client.responses.create({
    model: 'gpt-4o-mini',
    store: false,
    instructions: COMMON_SYSTEM_PROMPT,
    input: [
      {
        role: 'developer',
        content: JSON.stringify({
          instructionType: 'server-approved-style-only',
          persona,
          narrationSpec: input.narrationSpec
        })
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: '제공된 명리 판단을 요청한 기능의 한국어 풀이로 서술해 주세요.',
          featureId: input.result.featureId,
          findings: claims,
          limitations: input.result.limitations,
          status: input.result.status
        })
      }
    ],
    text: { format: {
      type: 'json_schema',
      name: 'fortune_narration',
      strict: true,
      schema: narrationJsonSchema
    }}
  });
  if (!response.output_text) throw new Error('Empty or refused response');
  const generated = NarrationResultSchema.parse(JSON.parse(response.output_text));
  if (generated.featureId !== input.result.featureId) throw new Error('Invalid feature');
  const valid = new Set(input.result.findings.map((f) => f.id));
  for (const section of generated.sections) {
    if (!input.narrationSpec.sections.some((s) => s.id === section.sectionId)) {
      throw new Error('Unknown section');
    }
    for (const id of section.evidenceIds) if (!valid.has(id)) throw new Error('Unknown finding evidence');
  }
  // 추가: 사실 재해석/환각 평가, 허용 기간·문구 검사, 필요시 폴백.
  return {
    ...generated,
    meta: {
      personaId: persona.personaId,
      personaVersion: persona.personaVersion,
      promptVersion: '1.0.0',
      modelId: 'gpt-4o-mini'
    }
  };
}
