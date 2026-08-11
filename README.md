# 1990 레트로 채팅 웹앱

> "나는 1990년에 살고 있습니다" — 그 시절 PC통신 감성의 클래식 채팅 프로그램 (개인/소수용 컨셉놀이)

검은 배경 + 초록 인광(monospace) + CRT 스캔라인 + 커서 깜빡임 + 타자기 출력으로
1990년대 하이텔/천리안/나우누리 터미널 느낌을 재현한 단일 파일(`index.html`) 프론트엔드.

## 구성

```
브라우저(index.html) ──POST──▶ Cloudflare Worker 프록시 ──▶ OpenAI Responses API
   암호는 메모리에만            OPENAI_API_KEY 보관(비노출)
```

- **프론트엔드**: `index.html` (CSS/JS 인라인, 외부 의존성 없음)
- **백엔드 프록시**: Cloudflare Workers — `https://proxy4chat.oouuung.workers.dev/`
  - 프론트 요청에 OpenAI API 키를 붙여 중계. 키는 Worker 안에만 존재, 브라우저에 노출 안 됨.
  - Worker 시크릿: `OPENAI_API_KEY`, `APP_PASSWORD`(문지기 암호)

## 향후 연동 맥락 (참고용 · 코드 미포함)

이 AI 챗은 과학관 안내 생태계의 한 구성요소다. 아래 시스템과 연동 예정이며,
**지금은 맥락 참고만** 하고 코드는 가져오지 않는다(설계가 어긋나지 않게 기록만).

- **GNSSnavi** (자체 제작) — 위치 기반 내비게이션. 관람객 위치·거점에 따라 챗 진입/안내를 연동할 수 있음.
- **NFC 스탬프 투어** — 태그로 스탬프 수집. 스토리 단계 진행·보상 트리거로 연동할 수 있음.
- **QR 코드 거점 안내 웹앱** — QR로 특정 거점 진입. 챗을 특정 캐릭터/장면으로 딥링크할 수 있음.
- **WebAR 전시패널 텍스트 강조** — AR로 패널 텍스트를 강조. 챗이 강조 내용을 설명/연계할 수 있음.

**설계 시사점(미리 열어둘 것, 아직 구현 X)**: 이 앱이 향후 URL 파라미터
(예: 거점 id·캐릭터·언어)로 **딥링크 진입**을 받을 수 있도록 여지를 남겨둔다.
시나리오(스토리 큰 틀)가 확정되면 그때 단계↔거점 매핑을 붙인다.

## 퍼소나 (다중 · 폴더 단위)

퍼소나는 `personas/` 아래 폴더 단위로 관리합니다.

```
personas/
  index.json              # 목록 매니페스트 (+ default 퍼소나)
  seoul-1990/
    persona.json          # id·이름·대화명(handle)·헤더제목(title)·인사(greeting)·system 프롬프트
    lore.json             # 이 퍼소나의 지식 카드(간이 RAG)
  mansu-1990/ ...
  _template/              # 새 퍼소나용 복붙 템플릿 (앞에 _ 라 목록에 안 뜸)
```

**퍼소나 추가법**
1. `personas/_template/`를 복사해 `personas/<새id>/` 로 만들고 `persona.json`(+선택 `lore.json`) 내용을 채운다.
   - `persona.json`의 `system`은 문자열 또는 **줄 배열**(권장, 읽기 편함) 둘 다 됨.
2. `personas/index.json`의 `personas` 배열에 한 줄 추가: `{ "id": "<새id>", "name": "표시이름", "dir": "personas/<새id>" }`
3. 커밋 → 자동배포. 헤더 드롭다운에 새 퍼소나가 뜬다.

헤더 드롭다운으로 전환하면 system 프롬프트·지식카드·대화·컨셉 메모가 **퍼소나별로** 통째로 바뀝니다.

## 세션(대화)·컨셉 메모

- **대화·컨셉 메모는 퍼소나별로 저장**됩니다.
  - 브라우저: `localStorage`(`retro1990.<personaId>.history/.memory/.mark`) → 새로고침해도 대화 이어짐.
  - 서버(선택): Worker **KV**에 컨셉 메모를 누적 → 모든 기기가 공유(아래 KV 설정).
- **컨셉 메모(자동 축적)**: 대화 window(최근 10개)에서 **6메시지마다 한 번** 모델로
  "컨셉 충실도를 높이는 정보"(이 대화에서 확립된 캐릭터·세계 설정, 등장한 1990년 고증 디테일,
  사용자가 알려준 그 시절 사실·정정)를 추출해 누적. 사용자 현대 개인정보/미래 사실은 제외.
  다음 요청에 `[컨셉 메모]`로 주입해 일관성·몰입을 높인다.
- **명령어**: `/메모`(보기) · `/메모내보내기`(lore.json 카드 스니펫으로 출력) · `/메모지우기` · `/대화지우기` · `/도움`

## Worker (프록시 + 컨셉 메모 KV)

Worker 코드는 `worker/worker.js`에 있습니다(레포에서 버전관리). 하는 일:
1. 프론트 요청에 `OPENAI_API_KEY`를 붙여 OpenAI(Responses API)로 중계
2. `op: "notes.get" | "notes.add"` 요청 시 퍼소나별 컨셉 메모를 **KV**에 조회/누적

**바인딩/시크릿**: `OPENAI_API_KEY`(Secret), `APP_PASSWORD`(Secret), `NOTES`(KV 바인딩).

### KV 자동축적 켜기 (한 번만)
```bash
# 1) KV 네임스페이스 생성
npx wrangler kv namespace create NOTES
#    → 출력된 id 를 wrangler.toml 에 추가:
#        [[kv_namespaces]]
#        binding = "NOTES"
#        id = "출력된_id"
# 2) worker/worker.js 내용을 배포
npx wrangler deploy
```
또는 대시보드: **Worker → Settings → Bindings → Add → KV namespace**, Variable name = `NOTES`,
새 네임스페이스 선택 → **Deploy**. (프론트는 KV/새 Worker가 없으면 자동으로 로컬 저장만 사용하므로,
순서 상관없이 안전하게 전환됩니다.)

## 프록시 호출 규약

- 메서드: `POST`, `Content-Type: application/json`
- GPT-5.6 계열은 **Responses API** 사용 → body 키가 `messages`가 아니라 `input`, model id는 `gpt-5.6-luna`
- 요청 본문:

```json
{
  "passphrase": "<APP_PASSWORD 값>",
  "payload": {
    "model": "gpt-5.6-luna",
    "input": [
      {"role": "system", "content": "..."},
      {"role": "user",   "content": "..."}
    ]
  }
}
```

- 응답: OpenAI Responses API 응답 JSON 그대로. 답변 텍스트는 `output_text`(편의 필드)
  또는 `output` 배열에서 추출. (`index.html`의 `extractText()`가 여러 형태를 모두 처리)
- 실패: 암호 틀리면 `{"error":"접근 거부"}` (401). GET 요청은 405 (POST만 허용).

## 암호(문지기) 처리

- `APP_PASSWORD`는 **코드에 하드코딩하지 않음**. 접속 화면에서 사용자가 입력.
- **"이 기기에서 암호 기억" 체크박스** (기본 켜짐):
  - **켜면** → 그 브라우저의 `localStorage`에만 저장. 다음 방문 시 자동으로 채워 **바로 접속**.
    사실상 그 기기에선 한 번만 입력하면 끝. 암호는 코드·서버가 아니라 브라우저 안에만 있으므로
    공개 레포여도 노출되지 않음.
  - **끄면** → 메모리에만 보관(기존 방식). 새로고침하면 사라져 매번 입력.
- 암호가 틀리면 401을 받고 → 기억된 암호를 지우고 접속 화면으로 되돌아감.
- 같은 기기에서 저장을 없애려면: 체크박스를 끄고 재접속하거나, 브라우저 사이트 데이터 삭제.

## 로컬에서 열어보기

`index.html`을 브라우저로 바로 열면 됨. (`file://`에서도 fetch가 동작하려면 Worker의
CORS 허용이 필요한데, 현재 Worker는 `Access-Control-Allow-Origin: *`라 문제없음.)

정적 서버로 확인하려면:

```bash
python3 -m http.server 8080
# http://localhost:8080 접속
```

## GitHub Pages 배포

1. 이 레포(`elderlord/AIWebChat`)에 `index.html`을 푸시.
2. GitHub → **Settings → Pages** → Source를 `Deploy from a branch`로,
   브랜치는 `main`(또는 배포용 브랜치) / 폴더는 `/ (root)` 선택.
3. 잠시 후 `https://elderlord.github.io/AIWebChat/` 주소로 접속.
4. 접속 화면에서 문지기 암호 입력 → 채팅 시작.

> CORS: 현재 Worker가 `*`로 열려 있어 어느 출처에서든 호출됨. 원하면 나중에 Worker의
> `Access-Control-Allow-Origin`을 `https://elderlord.github.io`로 좁혀 보안 강화 가능.

## 안전장치 (개인 컨셉놀이 기준)

- OpenAI 전용 키에 월 지출 상한을 걸어둘 것.
- 문지기 암호는 프론트에 하드코딩 금지(사용자 입력 방식) — 이미 그렇게 되어 있음.
- 필요 시 Worker CORS 허용 출처를 본인 github.io 주소로 제한.
