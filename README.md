# 삼각별 이야기 — 과학관 캐릭터 스토리텔링 AI 웹챗

> 시간의 세 친구 **샘이 · 탐이 · 꿈이**가 관람객을 '삼각별' 이야기로 맞이하고,
> 대화로 몰입시키며 안내하는 웹 채팅. 과학관 안내 생태계의 대화/스토리텔링 담당 모듈.

- **주인공(퍼소나)**: 샘이(과거의 빛 · 꼬마 공룡), 탐이(현재의 빛 · 호기심 대장), 꿈이(미래의 빛 · 상상가)
- **핵심**: 캐릭터가 관람객을 반갑게 맞이 → 삼각별 이야기로 끌어들여 몰입 → 짧은 대화를 주고받으며 안내
- 관람객은 **암호 없이 바로** 입장(공개), 헤더 드롭다운으로 캐릭터 전환
- **화면(무대) 레이아웃**: 번역기처럼 상하 2분할 — **위=캐릭터가 지금 하는 말**, **아래=내가 방금 한 말**.
  긴 로그 대신 '지금 이 순간'만 크게 보여줘 몰입·게이미피케이션에 맞춤(키오스크 친화).
- **음성 대화**: 🎙️ **마이크를 꾹 누른 채 말하고 손을 떼면 전송**(음성 입력, STT) → 캐릭터가 **소리로 답**(TTS).
  둘 다 브라우저 내장 Web Speech API라 별도 API·키·비용이 없다. 음성 안 되는 환경은 텍스트 입력으로 자동 대체.

> 세계관: 우주의 작은 별 '삼각별(Triangulon)'의 시간 균형이 무너지자, 트라이아 박사가
> 시간의 세 빛(과거·현재·미래)을 모아 세 친구를 만들었다. 세 친구가 관람객과 함께 별을 되살린다.

---

## 구성

```
브라우저(index.html) ──POST──▶ Cloudflare Worker 프록시 ──▶ OpenAI Responses API
   퍼소나·대화·컨셉 메모        OPENAI_API_KEY 보관(비노출)
   (localStorage)              컨셉 메모 KV 누적(선택) ◀──▶ Workers KV
```

- **프론트엔드**: `index.html` 단일 파일 (CSS/JS 인라인, 외부 의존성 없음)
- **백엔드 프록시**: Cloudflare Workers — `https://proxy4chat.oouuung.workers.dev/` (코드: `worker/worker.js`)
  - 프론트 요청에 OpenAI 키를 붙여 중계. 키는 Worker 안에만 존재(브라우저 비노출).
  - 퍼소나별 **컨셉 메모**를 KV에 조회/누적 (선택 기능).
- **모델**: `gpt-5.6-luna` (Responses API)

### 저장소 구조
```
index.html                     프론트엔드 (UI·대화·간이 RAG·기억·퍼소나 로더)
worker/worker.js               Cloudflare Worker (프록시 + 컨셉 메모 KV + Origin 제한)
personas/
  index.json                   퍼소나 목록 매니페스트 (+ default)
  saemi/  tami/  kkumi/         삼각별 세 주인공 (각 persona.json + lore.json)
  seoul-1990/  mansu-1990/      1990 프로토타입 퍼소나 (예시로 남겨둠)
  _template/                    새 퍼소나 복붙 템플릿 (앞의 _ 라 목록에 안 뜸)
docs/scenarios/                노선(스토리)·시스템 설계 문서
  commonframework.md           세 캐릭터 노선 공통 설계 기준 (상위 프레임)
  saemi.md                     샘이 노선 「샘이가 놓친 한 가지」 · 4거점
  tami.md                      탐이 노선 「탐이가 틀리는 법」·「균형이 멈춘 날」 · 3거점
  kkumi.md                     꿈이 노선 「미래의 첫 장이 사라졌다」 · 3거점
  integration-ui.md            세 노선 통합: Soft Gating·기록 교차·삼각별 완성·NFC 카드
.github/workflows/deploy-pages.yml   push 시 GitHub Pages 자동 배포
```

---

## 퍼소나 (다중 · 폴더 단위)

각 퍼소나는 `personas/<id>/` 폴더로 관리한다.

- `persona.json` — `id` · `name` · `handle`(대화명) · `color`(캐릭터색) · `title`(헤더) · `greeting`(인사) · `system`(프롬프트)
  - `system`은 문자열 또는 **줄 배열**(권장, 읽기 편함) 둘 다 가능.
- `lore.json` — 그 퍼소나의 지식 카드(간이 RAG). `{ cat, k:[키워드…], t:"사실" }` 배열.
- `scenario.json`(선택) — **미션 state machine**. 있으면 그 캐릭터는 '능동 스토리텔링' 모드로 동작하고, 없으면 자유 대화(하위호환).

**퍼소나 추가법**
1. `personas/_template/`를 복사해 `personas/<새id>/`로 만들고 내용을 채운다.
2. `personas/index.json`의 `personas` 배열에 추가: `{ "id":"<새id>", "name":"표시이름", "dir":"personas/<새id>" }`
3. 커밋 → 자동배포. 헤더 드롭다운에 새 퍼소나가 뜬다.

헤더 드롭다운으로 전환하면 **시스템 프롬프트·지식카드·대화·컨셉 메모·미션 단계가 퍼소나별로 통째로** 바뀐다.

---

## 미션 엔진 (능동 스토리텔링 · state machine)

관람객이 뭘 해야 할지 몰라도 **캐릭터가 먼저 이끌도록**, 미션을 코드가 쥔 상태기계로 돌린다.
`personas/<id>/scenario.json` 이 있으면 그 캐릭터에서 자동으로 켜진다(없으면 자유 대화).

**시나리오 구조** (`scenario.json`)
```jsonc
{
  "id": "saemi", "title": "샘이가 놓친 한 가지", "start": "intro",
  "stages": [
    {
      "id": "natural",            // 단계 id
      "kind": "site",             // intro | site(거점) | end(완주)
      "spot": "자연사관",          // 진행바에 표시할 장소
      "label": "모으고 지킨다",
      "goal": "이 단계에서 관람객이 도달해야 할 목표(모델 연출 기준, 화면엔 안 보임)",
      "opening": "단계 진입 시 캐릭터가 먼저 던지는 대사",
      "director": "모델(연출가)에게 주는 이 단계 진행 지시(beats)",
      "suggest": ["추천 답변 칩1", "칩2"],
      "next": "human"             // 다음 단계 id (마지막은 null)
    }
  ]
}
```

**동작 방식**
- **먼저 말 건다**: 단계에 들어가면 `opening` 을 캐릭터가 자동 발화(수동 대기 X).
- **연출 주입**: 매 턴 시스템 프롬프트에 `goal`+`director` 를 넣어, 모델이 목표로 유도하고 매 답변을
  '다음 행동 제안/질문' 하나로 끝내게 한다(목표를 설명문처럼 나열 금지 → 몰입 유지).
- **하이브리드 전환(Soft Gating)**: 모델이 목표 달성을 판단하면 답변 끝에 숨은 신호 `[[NEXT]]` 를
  붙이고, 프론트가 이를 떼어내(화면 노출 X) 다음 단계로 넘어가며 새 `opening` 을 발화한다.
  동시에 **`다음 장소로 ▶` 칩**으로 관람객·운영자가 직접 넘길 수도 있다(강제 잠금 없음).
- **예상 답변 칩(2개)**: 모델이 매 답변마다 대화 맥락에 맞는 예상답변 2개를 숨은 태그
  `[[SUGGEST: a | b]]` 로 함께 내보내고(추가 호출 없음), 프론트가 이를 칩으로 바꾼다.
  없으면 단계의 기본 `suggest` 2개로 폴백. 탭하면 그 말이 전송 → 관람객이 손가락으로 진행.
  입력 우선순위 = **예상답변 칩 → 🎙️ 음성 → ⌨️ 키보드**(화면 배치 순서 동일).
- **진행 표시**: 상단에 `거점 n/N · 장소` 와 점(●○) 진행바(캐릭터색).
- **명령**: `/미션`(현재 단계) · `/다음`(수동 전환) · `/처음`(미션 리셋).
- 진행 단계는 `retro1990.<personaId>.stage` 로 저장 → 새로고침해도 이어짐.

현재 **샘이**가 완성(안내데스크→자연사관→인류관→한국과학기술사관→우주과학공원→완주).
탐이·꿈이는 `scenario.json` 을 같은 형식으로 추가하면 바로 미션 모드가 된다(문서: `docs/scenarios/`).

---

## 세션(대화) · 컨셉 메모

- **대화·컨셉 메모는 퍼소나별로 저장**된다.
  - 브라우저: `localStorage`(`retro1990.<personaId>.history/.memory/.mark`) → 새로고침해도 대화가 이어짐.
  - 서버(선택): Worker **KV**에 컨셉 메모를 누적 → 모든 기기가 공유(아래 KV 설정).
- **컨셉 메모(자동 축적)**: 최근 대화 window(10개)에서 **6메시지마다 한 번** 모델로
  "그 퍼소나의 컨셉 충실도를 높이는 정보"(이 대화에서 확립된 캐릭터·세계 설정, 등장한 세계관 디테일,
  관람객이 알려준 사실·정정)를 추출·누적한다. 관람객 개인정보/세계관 밖 사실은 제외.
  다음 요청에 `[컨셉 메모]`로 주입해 캐릭터 일관성·몰입을 높인다.
- **명령어**: `/메모`(보기) · `/메모내보내기`(lore.json 카드 스니펫 출력) · `/메모지우기` · `/대화지우기` · `/도움`

> `retro1990.*` 는 내부 저장키 접두어(프로토타입 잔재)일 뿐 화면에는 노출되지 않는다.

### 무대(2분할) UI · 음성 대화

화면은 위(캐릭터)·아래(나) 2분할이고, 각각 **가장 최근 한 마디**만 크게 보여준다.
대화 맥락(`history`)은 그대로 이어지되, 화면엔 '지금'만 남겨 몰입을 높인다.

**음성 입력(STT · `SpeechRecognition`)**
- 하단 🎙️ **마이크를 꾹 누르는 동안 듣고, 손을 떼면(또는 버튼 밖으로 나가면) 그 말을 전송**한다.
- 인식 중엔 아래 패널에 임시 텍스트(기울임)로 실시간 표시, 확정되면 전송.
- 마이크 권한 거부·미지원(파이어폭스 등)이면 마이크를 숨기고 **텍스트 입력**으로 자동 대체.

**음성 재생(TTS · `speechSynthesis`)**
- 헤더의 **`🔊 읽기 ON` / `🔇 읽기 OFF`** 로 자동 낭독을 켜고 끈다(설정은 `retro1990.voice`에 저장, **음성 UI라 기본 ON**).
- 켜져 있으면 캐릭터 답변이 도착할 때마다 한국어(`ko-KR`)로 자동 재생. 위 패널의 **`🔊`** 로 지금 대사를 다시 들을 수 있다.

> 둘 다 브라우저 내장 Web Speech API라 **API·키·비용이 없다.** 음성 품질·인식률은 브라우저/OS 음성과
> 주변 소음에 좌우되므로(과학관은 시끄러움) **텍스트 입력을 항상 fallback으로 함께 제공**한다.
> 지원: 크롬·엣지·삼성인터넷·iOS 사파리 계열(마이크 권한 필요). 크롬 STT는 온라인(구글) 인식.

---

## 입장(접속) · 보안

- **공개 입장**: `index.html`의 `OPEN_ACCESS = true` → 관람객이 암호 화면 없이 바로 채팅에 진입.
- 보안 경계는 **암호가 아니라 도메인(Origin) 제한**으로 둔다:
  - `worker/worker.js`의 `DEFAULT_ALLOWED_ORIGINS`(또는 `env.ALLOWED_ORIGINS`)에 허용 도메인을 두면,
    그 도메인의 브라우저 요청만 통과(+ 응답 CORS도 해당 출처로 제한). 최종 과학관 도메인이 정해지면 여기에 추가.
  - 하위호환: 올바른 `APP_PASSWORD`가 오면 여전히 통과(기존 방식).
- ⚠️ 공개 모드에선 프론트에 실린 기본 통과값이 노출되므로, **공개 배포 전 반드시 업데이트된 Worker를 배포**해
  Origin 제한을 켠다. 그 전까지는 **OpenAI 키 월 지출 상한**이 안전망.

---

## Worker (프록시 + 컨셉 메모 KV)

`worker/worker.js`가 하는 일:
1. 프론트 요청에 `OPENAI_API_KEY`를 붙여 OpenAI(Responses API)로 중계
2. `op: "notes.get" | "notes.add"` 요청 시 퍼소나별 컨셉 메모를 **KV**에 조회/누적
3. **Origin 허용목록**으로 공개 입장 보호

**바인딩/시크릿**: `OPENAI_API_KEY`(Secret) · `APP_PASSWORD`(Secret, 하위호환) · `NOTES`(KV 바인딩)

### 호출 규약
- `POST`, `Content-Type: application/json`
- GPT-5.6 계열은 **Responses API** → body 키가 `messages`가 아니라 `input`, model id는 `gpt-5.6-luna`
- 채팅 요청 본문:
  ```json
  {
    "passphrase": "<선택: APP_PASSWORD>",
    "payload": {
      "model": "gpt-5.6-luna",
      "input": [
        {"role": "system", "content": "..."},
        {"role": "user",   "content": "..."}
      ]
    }
  }
  ```
- 컨셉 메모 요청: `{ "op":"notes.get", "persona":"<id>" }` / `{ "op":"notes.add", "persona":"<id>", "notes":[...] }`
- 응답: OpenAI Responses 응답 JSON 그대로. 답변 텍스트는 `output_text` 또는 `output[]`에서 추출
  (`index.html`의 `extractText()`가 여러 형태 처리). GET은 405.

### KV 자동축적 켜기 (한 번만)
```bash
# 1) KV 네임스페이스 생성
npx wrangler kv namespace create NOTES
#    → 출력된 id 를 wrangler.toml 에 추가:
#        [[kv_namespaces]]
#        binding = "NOTES"
#        id = "출력된_id"
# 2) worker/worker.js 배포
npx wrangler deploy
```
또는 대시보드: **Worker → Settings → Bindings → Add → KV namespace**, Variable name = `NOTES`,
새 네임스페이스 선택 → **Deploy**. (KV/새 Worker가 없으면 프론트는 자동으로 로컬 저장만 사용하므로
순서 상관없이 안전하게 전환된다.)

---

## 배포 · 로컬 실행

- **배포**: `.github/workflows/deploy-pages.yml` 이 브랜치 push마다 GitHub Pages로 자동 배포한다.
  (레포 **Settings → Pages → Source = GitHub Actions** 필요.) 사이트: `https://elderlord.github.io/AIWebChat/`
- **로컬 확인**:
  ```bash
  python3 -m http.server 8080
  # http://localhost:8080 접속 (localhost 는 Worker Origin 허용목록에 포함되어 있음)
  ```

---

## 향후 연동 맥락 (참고용 · 코드 미포함)

이 AI 챗은 과학관 안내 생태계의 한 구성요소다. 아래 시스템과 연동 예정이며 **지금은 맥락 참고만** 한다.

- **GNSSnavi**(자체 제작) — 위치 기반 내비. 관람객 위치·거점에 따라 챗 진입/안내 연동.
- **NFC 스탬프 투어** — 태그로 스탬프 수집. 스토리 단계 진행·보상 트리거 연동.
- **QR 코드 거점 안내 웹앱** — QR로 특정 거점 진입. 챗을 특정 캐릭터/장면으로 딥링크.
- **WebAR 전시패널 텍스트 강조** — AR로 패널 텍스트 강조. 챗이 강조 내용 설명/연계.

**설계 시사점(미리 열어둘 것, 아직 구현 X)**: 향후 URL 파라미터(거점 id·캐릭터·언어)로 **딥링크 진입**을
받게 여지를 남긴다. 시나리오(스토리 큰 틀) 확정 시 단계↔거점 매핑을 붙인다.

---

## 남은 작업(TODO)

- [~] **시나리오(스토리 큰 틀)**: 샘이·탐이 최신 기준선 기록됨(`docs/scenarios/saemi.md`, `docs/scenarios/tami.md`). 미작성 거점은 각 문서의 확정 상태 표 참조.
      다음 → 이를 `scenario.json`(거점·단계·목표) + 컨텍스트 주입으로 앱에 반영
- [ ] **디자인 가이드** 확정 → 삼각별/캐릭터색(샘이 노랑·탐이 주황·꿈이 파랑) 반영한 UI 리브랜딩
- [ ] **Worker 배포** → Origin 제한 켜기 + `NOTES` KV 바인딩(자동축적)
- [ ] **딥링크 진입**(URL 파라미터로 캐릭터/거점) · 관람객 리셋(키오스크)

## 안전장치

- OpenAI 전용 키에 **월 지출 상한**을 걸어둘 것.
- 공개 배포 전 **Origin 제한 Worker 배포**로 키 남용 방지.
- 필요 시 허용 Origin을 과학관 최종 도메인으로 좁힌다.
