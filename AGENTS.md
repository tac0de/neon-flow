# neon-flow 작업 검증

- 저장소를 변경하는 작업은 DTP로 검증합니다. 작업을 시작할 때 `tracework_dtp.get_project_context`를 호출하고 반환된 작업 트리가 `git rev-parse --show-toplevel`과 같은 실제 경로인지 확인합니다. 경로가 다르면 그 연결로 검사를 실행하지 않습니다.
- 코드 변경 후 `run_feedback`으로 영향받는 테스트를 실행합니다. 검증할 최종 판본이 깨끗한 Git 작업 트리에 준비되면 `run_check`로 빌드와 전체 검사를 실행합니다.
- `get_run_receipt`에서 대상 작업 트리와 Git 판본, 검사 결과를 확인합니다. 전체 검사를 통과하면 최종 답변에 실행 ID를 남깁니다. 변경이 남아 있거나 검사가 실패하면 확인한 결과와 전체 검증을 마치지 못한 이유를 보고합니다.
- MCP를 호출할 수 없으면 `dtp-project` 스킬의 로컬 실행 경로를 사용합니다. 작업 중인 Git 루트를 `DTP_CHECKOUT`으로 전달합니다.
