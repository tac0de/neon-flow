# neon-flow 작업 지침

- 저장소 변경에는 전역 `dtp-project` 스킬과 프로젝트 MCP `neon_flow`를 사용합니다.
- 수정 전 `neon_flow.prepare_work`에 대상 경로를 `paths`로 전달합니다. 대상 경로를 모르면 작업명이나 심볼을 `query`로 전달합니다. 응답의 `domainSkills`에서 해당 스킬의 버전, 지침, 입출력 계약을 읽고 적용합니다. 이후 변경 범위에 새 도메인이 포함되면 그 경로를 포함해 다시 준비한 뒤 수정합니다.
- 같은 MCP로 `run_feedback`과 최종 판본의 `run_check`를 실행합니다. 도메인 스킬은 `.codex/domain-skills.json`에, 전체 검사 정책은 `.codex/dtp.json`에 둡니다.
