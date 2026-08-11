/**
 * 1990 레트로 채팅 — Cloudflare Worker 프록시 (+ 컨셉 메모 KV 저장)
 *
 * 역할:
 *  1) 프론트 요청에 OpenAI 키를 붙여 OpenAI(Responses API)로 중계 (기존 기능)
 *  2) 퍼소나별 "컨셉 메모"를 KV에 누적/조회 (op: notes.get / notes.add)
 *
 * 필요한 바인딩/시크릿:
 *  - env.OPENAI_API_KEY  (Secret)   OpenAI API 키
 *  - env.APP_PASSWORD    (Secret)   문지기 암호
 *  - env.NOTES           (KV 바인딩) 컨셉 메모 저장소  ← 새로 추가해야 함
 *
 * KV 네임스페이스 만들고 연결하기 (한 번만):
 *   npx wrangler kv namespace create NOTES
 *   → 출력된 id 를 wrangler.toml 에 추가:
 *       [[kv_namespaces]]
 *       binding = "NOTES"
 *       id = "여기에_출력된_id"
 *   또는 대시보드: Worker → Settings → Bindings → Add → KV namespace,
 *   Variable name = NOTES, 새 네임스페이스 선택 → Deploy
 */

const OPENAI_URL = "https://api.openai.com/v1/responses"; // GPT-5.6는 Responses API 사용
const NOTES_MAX = 300; // KV에 퍼소나당 보관할 컨셉 메모 최대 개수

// 허용 도메인(Origin). 공개 입장 시 여기 있는 출처의 브라우저 요청은 암호 없이 통과.
// 과학관 최종 도메인이 정해지면 여기에 추가하세요. (필요하면 env.ALLOWED_ORIGINS 로 콤마 구분 설정도 지원)
const DEFAULT_ALLOWED_ORIGINS = [
  "https://elderlord.github.io",
  "http://localhost:8099",
  "http://localhost:8080",
];

function allowedOrigins(env) {
  if (env && env.ALLOWED_ORIGINS) {
    return String(env.ALLOWED_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}
function isAllowedOrigin(origin, env) {
  return !!origin && allowedOrigins(env).indexOf(origin) >= 0;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const originOK = isAllowedOrigin(origin, env);

    // CORS 프리플라이트 — 허용 출처면 그 출처를 반사
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin, originOK) });
    if (request.method !== "POST") return json({ error: "POST만 허용" }, 405, origin, originOK);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "JSON 형식 오류" }, 400, origin, originOK); }

    // 문지기: (1) 허용 도메인의 브라우저 요청이면 통과(공개 입장), 또는 (2) 올바른 암호면 통과(호환).
    const passOK = body.passphrase === env.APP_PASSWORD;
    if (!originOK && !passOK) return json({ error: "접근 거부" }, 401, origin, originOK);

    // 컨셉 메모 저장/조회 (KV)
    if (body.op === "notes.get" || body.op === "notes.add") {
      return handleNotes(body, env, origin, originOK);
    }

    // 기본: OpenAI 채팅 중계 (passphrase는 떼고 payload만 전달)
    const upstream = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body.payload),
    });

    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { ...cors(origin, originOK), "Content-Type": "application/json" },
    });
  },
};

// ===== 컨셉 메모 (KV) =====
async function handleNotes(body, env, origin, originOK) {
  if (!env.NOTES) return json({ notes: [], error: "no-kv" }, 200, origin, originOK); // KV 미설정 시 빈 목록으로 degrade

  const id = String(body.persona || "default").replace(/[^\w.\-]/g, "_");
  const key = "notes:" + id;

  let notes = [];
  try { notes = JSON.parse(await env.NOTES.get(key)) || []; } catch { notes = []; }
  if (!Array.isArray(notes)) notes = [];

  if (body.op === "notes.get") return json({ notes }, 200, origin, originOK);

  // notes.add — 새 항목만 중복 없이 누적
  const incoming = Array.isArray(body.notes) ? body.notes : [];
  let added = 0;
  for (const raw of incoming) {
    const line = String(raw || "").trim();
    if (!line) continue;
    const dup = notes.some((n) => String(n).toLowerCase() === line.toLowerCase());
    if (!dup) { notes.push(line); added++; }
  }
  if (notes.length > NOTES_MAX) notes = notes.slice(notes.length - NOTES_MAX);
  if (added > 0) await env.NOTES.put(key, JSON.stringify(notes));
  return json({ notes, added }, 200, origin, originOK);
}

// 허용 출처면 그 출처를 반사(도메인 제한), 아니면 "null"로 브라우저 읽기를 막음
function cors(origin, originOK) {
  return {
    "Access-Control-Allow-Origin": originOK ? origin : "null",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(obj, status = 200, origin = "", originOK = false) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...cors(origin, originOK), "Content-Type": "application/json" },
  });
}
