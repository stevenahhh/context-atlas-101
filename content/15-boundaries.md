# 15 · 근거와 한계 — 이 보고서가 말할 수 있는 것과 없는 것

> **한 줄 요약:** 이 보고서는 코드를 읽어 "어떤 조건에서 무엇이 실행되는지"를 밝힌 분석이며, 실제로 얼마나 절약되는지를 잰 측정은 아닙니다.

## 이 장에서 배우는 것

- 하네스 효율의 세 축과, 세 축이 서로 영향을 주는 방식
- 이 분석이 어떤 코드 기준과 방법으로 이루어졌는지
- 이 분석이 하지 않은 일과, 앞으로 무엇을 재야 하는지
- 근거 01~20이 각각 무엇을 뒷받침하는지

## 왜 이 장이 필요한가

앞 장들에서 많은 숫자와 조건을 배웠습니다. 이제 남은 질문은 하나입니다. "그래서 이 하네스는 실제로 효율적인가?"

이 장의 답은 조심스럽습니다. 원문은 그 질문에 아직 답할 수 없다고 말합니다. 왜 그런지, 그리고 어디까지는 믿어도 되는지를 정리하는 것이 이 장의 목적입니다.

## 세 축: 무엇을 줄이려 하는가

원문은 이 구현이 세 가지 변수를 각각 다른 장치로 다룬다고 봅니다.

| 축 | 목표 | 다루는 장치 |
|---|---|---|
| 요청량 | 보내는 토큰을 줄입니다 | admission, reduction, emergency prune, compaction |
| 과금 단가 | 보낸 토큰을 캐시 단가로 받습니다 | provider별 캐시 표시와 세션 키, TTL을 넘기지 않는 대기 예산, 요청 형태를 안정시키는 히스테리시스 |
| 대기 시간 | 요약 대기를 작업 시간과 겹칩니다 | speculative 생성, grace band, 유휴 warm-up |

::: term 용어 — TTL
Time To Live의 줄임말입니다. 캐시가 살아 있는 시간을 뜻합니다. 이 시간이 지나면 캐시가 사라져 다시 비싼 단가로 보내야 합니다.
:::

## 세 축은 서로 부딪힙니다

세 축은 따로 놀지 않습니다. 한쪽을 좋게 하면 다른 쪽이 나빠질 수 있습니다. 원문이 든 예는 두 가지입니다.

- **압축은 요청량을 줄입니다.** 하지만 그 직후 호출에서는 캐시가 비워집니다. 앞부분이 바뀌었기 때문입니다.
- **축소 단계가 바뀔 때도 마찬가지입니다.** 요청량은 줄지만 prefix(요청의 앞부분)가 달라집니다.

::: analogy 비유 — 책상 정리와 메모
책상을 치우면 공간은 넓어집니다. 하지만 동료가 "어제 그 자리에 있던 자료"를 기억하고 있었다면, 다시 설명해야 합니다. 공간을 얻는 대신 이어 말하기의 이점을 잠시 잃는 셈입니다.
:::

그래서 결론은 이렇습니다. 어느 한 축의 지표만 보고 하네스의 효율을 판단할 수는 없습니다. 캐시 적중률이 높다고, 또는 요청량이 줄었다고 해서 그것만으로 "효율적이다"라고 말할 수 없습니다.

## 분석 기준: 어떤 코드를 봤는가

원문은 분석한 코드를 정확히 고정해 두었습니다.

| 항목 | 값 |
|---|---|
| 분석 기준 커밋 | `f81aee565f2aeb6d774c93801596e523c017c4c5` |
| 정책 디렉터리 파일 | TypeScript 파일 47개 |
| 정책 디렉터리 분량 | 8,537줄 |
| 변경 이력 | 2026-04-27 이후 216커밋 |

커밋을 고정하는 이유는 간단합니다. 코드는 계속 바뀝니다. 어느 시점의 코드를 봤는지 밝혀야 다른 사람이 같은 결과를 확인할 수 있습니다.

::: warn 주의
이 숫자들은 정책 구현의 크기와 변경 이력을 보여 줄 뿐입니다. 파일이 많거나 커밋이 많다고 해서 압축 품질이 좋거나 실행이 효율적이라는 뜻은 아닙니다. 원문도 이 수치를 그런 증거로 쓸 수 없다고 분명히 말합니다.
:::

## 분석 방법: 이름보다 실행 경로를 믿었습니다

원문은 세 단계로 코드를 읽었습니다.

1. 정책 함수의 조건과 반환값을 읽었습니다.
2. 그 값을 실제로 쓰는 곳, 즉 이벤트 훅과 호출부에서 어떻게 소비되는지 대조했습니다.
3. 관련 테스트는 기대 동작을 확인하는 **보조** 근거로 읽었습니다.

가장 중요한 원칙은 따로 있습니다. 함수 이름이나 주석이 암시하는 기능을 그대로 믿지 않았습니다. 실행 경로가 그 기능을 실제로 강제하는지 확인했습니다.

이 원칙 덕분에 드러난 사례가 두 가지 있습니다. 둘 다 14장에서 자세히 다뤘습니다.

- **비효율 집계와 breaker의 비연결:** 이름만 보면 비효율 요약을 breaker가 막을 것 같습니다. 실제로는 두 장치가 이어져 있지 않습니다.
- **유휴 생성과 적용 조건의 차이:** 유휴 상태에서 요약을 만드는 조건과, 그것을 적용하는 조건은 다릅니다.

::: note 핵심
"이름이 그렇다"와 "코드가 그렇게 돈다"는 다른 이야기입니다. 이 보고서의 결론은 뒤쪽에 근거를 둡니다.
:::

## 이 분석이 하지 않은 일

원문은 하지 않은 일을 숨기지 않습니다. 다음 세 가지는 수행하지 않았습니다.

- 원본 코드의 테스트 실행
- 실제 모델로 요약을 부르는 호출
- cache hit, 지연, 비용의 벤치마크(성능 측정)

보고서에 들어 있는 대화형 시각화도 측정 결과가 아닙니다. 명시된 가정 아래에서 공식과 상태 판정을 재현해 보여 주는 **설명 도구**입니다.

그럼 공식을 재현했으니 효과도 확인된 것 아닐까요? 그렇지 않습니다. 수식을 재현했다는 사실만으로는 특정 작업에서 요약 품질이 유지된다고 말할 수 없습니다. 총비용이 줄었다고 말할 수도 없습니다.

## 설계의 방향과 남는 위험

원문이 정리한 설계 방향은 두 가지입니다.

- 요청에 들어가는 정보를 **규칙적으로** 줄입니다.
- 요약이 필요해지기 **전에** 생성을 시작합니다. 그래서 기다리는 시간의 일부를 다른 작업 시간과 겹칩니다.

이 방향에는 대가가 있습니다.

- 원본 기록은 남지만, 현재 요청에서는 정보가 빠집니다.
- 미리 만든 결과를 결국 쓰지 못할 가능성도 남습니다.

## 앞으로 무엇을 재야 하는가

실제 효과를 평가하려면 후속 검증이 필요합니다. 원문은 같은 작업 조건에서 다음을 **함께** 관찰해야 한다고 말합니다.

- 줄어든 요청량
- 요약 요청 수
- 폐기된 결과
- 재탐색(빠진 정보를 다시 찾는 일)
- 사용자 대기 시간

요청량만 재면 절약처럼 보일 수 있습니다. 하지만 요약을 자주 만들고 버렸거나, 빠진 정보를 다시 찾느라 시간이 들었다면 이야기가 달라집니다.

::: warn 주의
이 목록은 앞으로 측정할 때의 기준입니다. 이 보고서가 이미 확보한 실측 결과가 아닙니다.
:::

## 근거를 직접 확인하려면 (재현 범위)

근거 링크에 대해 알아 둘 점이 있습니다.

- 원문 링크는 분석에 사용한 커밋에 **고정**되어 있습니다. 나중에 코드가 바뀌어도 같은 줄을 볼 수 있습니다.
- 보고서 자체는 외부 자산을 내려받지 않고도 열립니다.
- 다만 GitHub 원문을 보려면 인터넷 연결이 필요합니다.
- 정책 파일의 공통 경로는 `packages/coding-agent/src/core/extensions/builtin/compaction/`입니다.

## 근거 목록 (01~20)

아래 표는 원문의 근거 번호와, 각 근거가 뒷받침하는 내용, 핵심 파일을 정리한 것입니다. 파일 위치는 원문 표기 그대로입니다.

| 번호 | 무엇을 뒷받침하는가 | 핵심 파일 |
|---|---|---|
| 01 | 원본 복제와 provider 요청 변환. `emitContext`가 원본을 복제한 뒤 훅을 실행하고, `buildProviderContext`가 변환 결과를 요청에 씁니다. 세션 원본과 요청 투영을 구분하는 근거입니다 | `runner.ts:1560`, `agent-loop.ts:403` |
| 02 | 실행 훅과 파이프라인. pre-turn admission, context projection, turn-end recovery, agent-end warming | `index.ts:825`, `context-pipeline.ts:29` |
| 03 | 도구 출력 admission. 텍스트 예산, 60/20 발췌, 결과 안 여러 텍스트 블록의 예산 배분 | `tool-admission.ts:10`, `orchestration.ts:97` |
| 04 | 일반 context reduction. 50% gate, builtin 옵션, 240토큰 본문 목표, 텍스트 전용 조건, clearable 목록 | `context-reduction.ts:130`, `context-reduction.ts:408`, `context-reduction.test.ts:77` |
| 05 | 긴급 축소와 hysteresis. 95% 초과 진입, 85% 이하 해제, 4096바이트와 800/400자, 출력 reserve 계산 | `emergency-prune.ts:61`, `tool-truncation.ts:4`, `extension-wiring.ts:18`, `hysteresis.test.ts:79` |
| 06 | 임계값·reserve·lead·reminder. 창별 baseline, 직전 yield 조정, reserve scaling, grace 경계와 generation별 안내 | `policy.ts:61`, `speculation-lead.ts:1`, `token-budget-reminder.ts:39`, `compaction-settings.ts:20` |
| 07 | 선행 생성·유휴 적용·anchor. 생성과 적용 조건의 분리, idle 교체 판단, append를 허용하는 경계 검증 | `idle.ts:22`, `index.ts:240`, `orchestration.ts:82`, `speculative.ts:428`, `warm-anchor.ts:17` |
| 08 | 복원 payload의 실제 내용. 본문이 아닌 경로·operation·skill 이름, 선택 순서와 합산 예산 | `restoration-tracker.ts:175`, `restoration-tracker.ts:204` |
| 09 | 실패 breaker와 ineffective telemetry. 실패 3회·60초, success reset, ineffective 기록, 항상 허용하는 cap | `circuit-breaker.ts:4`, `yield.ts:69`, `index.ts:768`, `per-turn-cap.ts:23` |
| 10 | 무텍스트 감시와 복구 시도. turn-end 감시 창, 비-assistant reset, 사이클당 gate와 누적 시도 ceiling | `degradation-monitor.ts:72`, `index.ts:986` |
| 11 | Provider 소유권과 예외. resident SDK stand-down, remote 대상 모델 판정과 해당 경로의 예외 | `lane-policy.ts:99`, `openai-remote-model.ts:62`, `index.ts:888`, `index.ts:1024` |
| 12 | Upstream 비교 기준. 기준은 pi v0.84.4 · f41f8046, `compaction.ts`는 1012줄, 기본 요약 조건은 창에서 reserve 16,384를 뺀 값을 초과할 때. 기존 설명의 '865줄'은 이 기준과 맞지 않습니다 | `.github/upstream.json`, pi `compaction.ts:235` |
| 13 | 캐시 적중률의 정의와 표시. assistant 메시지마다 최근 비율을 덮어쓰고, footer는 10% 이상일 때 표시. 세션 정보 화면은 누적 합계와 cache waste를 따로 계산 | `session-manager.ts:1172`, `footer.ts:185`, `interactive-mode.ts:8890`, `cache-stats.ts:56` |
| 14 | Anthropic 체크포인트와 TTL. system·tools·마지막 user 블록의 `cache_control`, tool loop 때 직전 체크포인트 보존, effort 마커 이후 재표시, short/long retention 판정 | `anthropic-messages.ts:99`, `anthropic-messages.ts:951`, `anthropic-messages.ts:2015`, `anthropic-messages.ts:2464`, `prompt-cache-ttl.ts:11` |
| 15 | 다른 provider의 캐시 키와 사용량 정규화. OpenAI 계열 `prompt_cache_key`와 24시간 retention, `cached_tokens` 계열 필드 통합, Google `cachedContentTokenCount`, Bedrock `cachePoint`, Mistral `promptCacheKey` | `openai-completions.ts:1063`, `openai-completions.ts:1850`, `openai-prompt-cache.ts:1`, `google-generative-ai.ts:264`, `bedrock-converse-stream.ts:881`, `mistral-conversations.ts:529` |
| 16 | 캐시 유지 장치. TTL 기반 도구 대기 예산, 기본 꺼짐인 keepalive의 횟수·비용 상한, 실험 기능의 cache-friendly 요약 prefix 재사용, system prompt의 날짜 항목 | `prompt-cache-budget.ts:37`, `settings-manager.ts:797`, `cache-keepalive/index.ts:101`, `agent-session.ts:5455`, `compaction-execution.ts:218`, `dynamic-prompt/build.ts:63` |
| 17 | Codex compaction 분기와 한도. `run_auto_compact`의 3분기(토큰예산·원격·로컬), 한도 = 창의 90%·하드캡 95%, 요약 대상과 보존 범위, post-turn 임계값 기본 0 | `turn.rs:1488`, `compact.rs:78`, `openai_models.rs:525` |
| 18 | Claude Code auto-compact·context editing·캐시. `/autocompact`와 `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, `/compact`의 동기 요약 구조와 재주입 항목, 서버 측 context editing(`clear_tool_uses`·`clear_thinking`), TTL 버킷 | claude-code docs: context, docs: context editing, docs: prompt caching |
| 19 | 로컬 usage 관측. Claude Code 세션의 `cache_read_input_tokens`·`cache_creation_input_tokens`·`ephemeral_*` 필드와 `context_management:null`, Codex rollout의 `cached_input_tokens`·`cache_write_input_tokens`·`token_count` 이벤트 | `~/.claude/projects/-Users-gahn-Works-01-*/01a031de*.jsonl`, `~/.codex/sessions/2026/09/20/rollout-*.jsonl`, `~/.codex/config.toml` |
| 20 | Codex 캐시 고정 수단. 모든 요청의 `prompt_cache_key`(세션 ID), `previous_response_id` 증분 델타, `x-codex-turn-state` 스티키 라우팅, `store:false`와 `encrypted_content` | `client.rs:356`, `model-provider-info.rs:380`, `tool_call.rs:138` |

## 한 줄 정리

이 하네스는 요청량, 과금 단가, 대기 시간을 서로 다른 장치로 다루며, 세 축은 서로 영향을 줍니다. 분석은 고정된 커밋의 코드를 읽고 이름보다 실행 경로를 믿는 방식으로 이루어졌습니다. 테스트 실행이나 실제 비용·지연 측정은 하지 않았으므로, 실제 효과는 같은 작업 조건에서 여러 지표를 함께 재야만 판단할 수 있습니다.
