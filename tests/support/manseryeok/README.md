# SDK 경계 검증 자산

day-calendar.ts와 solar-calendar.ts는 기존 고정 SDK 경계 골든/오류 검증을 위한 어댑터다. 제품용 barrel에서 내보내지 않는다. 실제 원국 경로는 `manseryeokPolicyCalendarAdapter`다.

domain/calendar의 SolarCalendarAdapter·DayCalendarAdapter와 해당 DTO는 공개 계약 호환성을 위해 유지한다. 향후 WBS-39/40의 시기 계산이 필요하면 그 작업에서 채택 여부와 별도 버전을 검토하며, 이 테스트 자산을 제품 어댑터로 자동 승격하지 않는다.
