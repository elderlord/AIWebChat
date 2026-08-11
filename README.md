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

- `APP_PASSWORD`는 **코드에 하드코딩하지 않음**. 접속 화면에서 사용자가 입력 → JS 메모리에만 보관.
- 레포가 공개여도 암호가 노출되지 않음. 새로고침하면 사라짐.
- 암호가 틀리면 401을 받고 접속 화면으로 되돌아감.

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
