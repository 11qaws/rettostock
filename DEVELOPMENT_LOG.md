# Retto Stock Widget - Development Log & Architecture

## 2026-07-13: v1.0.35 Yahoo chart path removed
- **Root-cause removal:** production widgets no longer call Yahoo Finance or public CORS proxies for charts. The Cloudflare Function serves both cached Finnhub five-minute candles and a separately cached Finnhub company profile, so a shared-proxy Yahoo 429 cannot occur or take away a mini chart.
- **Honest failure mode:** if Finnhub has no two valid candle points yet (for example, immediately after a new listing) the line stays empty; the card price remains on its independent live path. The app never falls back to synthetic or unrelated historical values.

## 2026-07-13: v1.0.34 Reliable charts and viewport-safe five-card preview
- **SPCX and newly listed symbols:** the optional Cloudflare market API now serves five-minute Finnhub candles through `/v1/charts`, cached for two minutes (up to 15 minutes only when its chart upstream is unavailable). This removes the chart's dependency on Yahoo/public CORS proxy availability; the displayed price and its WebSocket path are unchanged. Yahoo remains a non-critical fallback until the Function is redeployed.
- **Five-card review in the configurator:** the sticky preview retains its viewport height and gains its own scrollbar whenever needed. Its fifth card no longer escapes below a 1080p browser window or requires scrolling the settings page to inspect it.

## 2026-07-13: v1.0.33 Recovery status uses the existing badge row
- **No size change:** restored `업데이트 중` appears immediately to the left of the existing market-status badge, using the same fixed badge height. The marquee's recovery glyph is also restored.
- **Stable OBS URL:** removed the automatic version query from copied OBS URLs; source URLs remain clean and unchanged.

## 2026-07-13: v1.0.32 Fixed-layout recovery and versioned OBS URLs
- **No layout changes during recovery:** removed the temporary update text and marquee glyph. Recovery state may dim an existing card but never adds content or changes its dimensions.
- **No stale deployment bundle:** newly copied OBS URLs carry the app version before the hash, bypassing GitHub Pages' 10-minute `index.html` cache on a new deployment.

## 2026-07-13: v1.0.31 Three-minute local quote recovery
- **Fast, honest refresh:** the browser stores only source-timestamped quotes for up to three minutes. Each quote's own receipt time is checked again on restore, so an outage cannot keep extending an old value's lifetime. A manual refresh or OBS browser-source restart paints the qualifying local value immediately while the live connection starts.
- **Stable broadcast layout:** recovery never adds a badge, text row, or marquee glyph. The first live reconciliation suppresses artificial pump/dump, surge, and sign-flip effects; visual setting changes still do not read this cache because their preview iframe is kept alive.

## 2026-07-13: v1.0.30 No stale-quote fallback; visual settings update in place
- **Correct broadcast behaviour:** removed the v1.0.29 short-lived quote snapshot. A visual setting must never have the option to display an old quote just to avoid `---`.
- **Real fix:** the embedded Configurator preview now keeps one live widget instance for theme, colour scheme, display mode, opacity, rotation speed, event focus, targets, and effect controls. These values are updated in place over a same-origin message; only a genuine data-source change (symbols or demo mode) replaces the iframe. The existing live REST/WebSocket state therefore remains on screen throughout visual adjustments.

## 2026-07-13: v1.0.29 Instant quote continuity across visual reloads (superseded)
- **No `---` on a visual-only change:** the widget now keeps a short-lived same-tab quote snapshot (price, change, name, chart references, and market state). A remounted preview or browser source paints that last valid quote immediately, then replaces it with the live REST/WebSocket value as usual.
- **Scope and safety:** snapshots expire after 15 minutes and only contain already public, displayed market values. Writes are throttled to once per 500ms, so high-frequency WebSocket ticks do not introduce synchronous-storage pressure.

## 2026-07-13: v1.0.28 Broadcast-safe effect preview
- **No price-feed restart on effect selection:** the Configurator no longer changes the preview iframe URL or key when Full/Card/Off is selected or replayed. It sends the preview command over a same-origin message instead, so the existing quote state, REST loop, and Finnhub WebSocket remain alive.
- **Reliable handoff:** the preview widget announces when its message listener is ready, and the Configurator re-sends the current setting. This avoids a slow-device load race while keeping preview-only commands out of the OBS URL and remote sync.
- **Live-path check:** the deployed Cloudflare quote endpoint returned current values for KORU, MUU, SNXX, and SOXL with the production origin. The immediate blank-card issue was therefore the preview iframe reset, not an upstream outage.

## 2026-07-13: v1.0.27 Reliable four-card preview and Full preview duration
- **All cards reliably render:** preview overlays are now derived directly from the preview token instead of depending on short-lived state updates. This fixes the deployed Pages build where only the first card's visual survived; surge/card glow, zero-cross, target reached, and 52-week record now stay on their respectively assigned cards for the full preview window.
- **Full remains unmistakable:** the Full-only first card now keeps a subtle pulse and shake for all three seconds, with three particle waves spread across that same window. Card effects retain the card glow but none of those Full-only moving cues.

## 2026-07-13: v1.0.26 Distributed effect preview
- **Card-specific preview:** selecting an effect level now distributes the preview across cards instead of stacking every effect on the first card: surge/card glow (plus Full-only pulse, shake, and particles), zero-cross, target reached, and 52-week record. The sequence repeats for additional cards; Rotate uses the currently shown card's sequence position.

## 2026-07-13: v1.0.25 Effect preview no longer waits for live events
- **Preview reliability:** selecting 전체 or 약한 연출 now starts its visual preview immediately. It no longer waits for a live price, surge, crossing, or target event, so the card glow/overlays and (at 전체) particles, pulse, and shake always appear for the three-second preview.

## 2026-07-13: v1.0.24 Advanced broadcast controls and selector simplification
- **Clean selector:** removed all explanatory copy, comparison-guide rows, and hover tooltips from the broadcast-effect selector. Only **전체 / 약한 연출 / 끄기** remain; runtime behavior is unchanged.
- **Event focus:** Rotate mode now exposes a default-on toggle for automatically cutting to the relevant card after an eligible event. Turning it off writes `event_focus=0`, so the overlay only advances on its chosen rotation interval.
- **Effect preview:** selecting 전체 or 약한 연출 automatically replays that level on the first embedded-preview card for three seconds. It overlays visuals without changing the quote, is never copied into the OBS URL or remote-sync message, and adds particles/pulse/shake only at 전체. The embedded iframe is remounted for every selection so the preview token always reaches the card.
- **Friendly advanced labels:** every advanced control now carries a short parenthetical purpose, including the exact scope of event focus and effect preview.

## 2026-07-13: v1.0.22 Three broadcast-effect levels and complete REST outage state
- **Clear, cumulative levels:** the compact selector and its always-visible guide now use **전체 / 약한 연출 / 끄기**. 약한 연출 keeps the static ±5/10/15% card colour and glow, market-session transition, positive/negative crossings, target reached, and 52-week high/low milestones. 전체 adds particles, the continuous card pulse, and tick shake. 끄기 removes all of those, except the deliberately retained one-shot up/down price-number flash. Former 강한 연출 URLs and saved settings map to 약한 연출.
- **Session transition classification:** PRE/regular/POST status text remains available in every level. Its sliding/fading treatment and countdown pulse start from 약한 연출, rather than being unlabelled movement effects.
- **Complete REST failure:** when the cache and REST path both fail, cards without a WebSocket trade in the last 15 seconds enter the existing dimmed stale state. Recent direct trades stay bright; partial quote failures also count toward the existing per-symbol stale handling.

## 2026-07-13: v1.0.20 Cached REST may not overwrite a newer live tick
- **Latency bound:** regular-session WebSocket trade ticks still bypass the cache. The 5-second REST cache is normally 0–5 seconds old, with an almost-10-second conservative bound when its freshness boundary aligns with the browser's 5-second poll. The 60-second stale response is only an outage fallback.
- **Guard:** each direct WebSocket trade records its receipt time. A REST response whose cache timestamp is older preserves the newer displayed trade price instead of making the card briefly jump backwards. This keeps the free shared cache from changing the live-tick experience.

## 2026-07-13: v1.0.19 Free shared market cache (Cloudflare Pages Function)
- **Goal:** keep the OBS URL and the visible card experience unchanged while avoiding one Finnhub REST request per browser source. The optional `market-api/` Pages Function shares quote, metric, and market-status reads through Cloudflare Cache API.
- **Cache policy:** quotes are fresh for 5 seconds and can fall back to a value up to 60 seconds old; 52-week metrics are 6 hours / 24 hours; market status is 60 seconds / 15 minutes. A same-isolate in-flight lock coalesces simultaneous cache misses. If the upstream fails, stale data is returned and refresh attempts wait 5 seconds before trying again.
- **Key handling:** both Finnhub keys are registered as Cloudflare encrypted secrets (`FINNHUB_API_KEY_1`, `FINNHUB_API_KEY_2`), not in the Function source. Only HTTP 429 and a 5-second timeout try the standby key; 401/403 does not rotate. `MARKET_API_BASE` is a GitHub Actions variable, so an empty value preserves the existing direct REST route until the service is deployed.
- **Free-plan limit:** Pages Functions share Workers Free's 100,000 dynamic requests/day. A 24/7 overlay polls the quote endpoint about 17,280 times/day, so this is a small-beta design (about five always-on overlays with headroom), not an unlimited public relay. Cache API is POP-local rather than globally shared. The direct Finnhub WebSocket remains for the existing sub-second tick feel; relaying it would require long-lived stateful connections whose free limits are less suitable.

이 문서는 무료 API들을 조합하여 실시간에 가까운 주식 위젯을 구현하는 과정에서 겪은 주요 이슈들과, 이를 해결하여 완성된 데이터 동기화 아키텍처를 기록한 문서입니다.

## 1. 주요 디버깅 및 트러블슈팅 과정

### 🚨 Race Condition (경합 조건) 덮어쓰기 문제
- **증상:** 정규장(REGULAR) 시간이 되었는데도 뱃지가 정규장으로 바뀌었다가 잠시 후 다시 프리장(PRE)으로 덮어씌워지는 문제.
- **원인:** 시간 계산 로직은 정규장 진입을 즉시 인지하여 상태를 변경했으나, 이와 동시에 출발했던 보조 데이터(TradingView) 통신이 1~2초 뒤에 도착하면서 덜 갱신된 과거 프리장 데이터를 덮어써버리는 경합(Race Condition) 발생.
- **해결:** 시스템이 정규장으로 상태를 확정하면, 그 이후에 도착하는 TradingView의 프리장/애프터장 데이터 업데이트는 무조건 무시(return)하도록 방어막 추가.

### 🚨 정규장 15분 지연 (15-min Delay) 페널티
- **증상:** TSLA 등 변동성이 큰 주식이 정규장 시간에 증권사 앱과 몇 달러씩 크게 차이 나는 현상.
- **원인:** 폴링 속도를 높이기 위해 정규장에서도 TradingView Scanner API를 활용했으나, TradingView는 무료 사용자가 미국 주식 정규장 데이터를 요청할 경우 **강제로 15분 지연된 데이터**를 제공하는 정책이 있었음.
- **해결:** 정규장 시간에는 15분 지연 페널티가 있는 TradingView 서버 호출을 완전히 배제하고, Finnhub 실시간 웹소켓(WebSocket) 및 REST API에만 100% 의존하도록 구조 분리.

### 🚨 ETF 종목(SOXL) 가격 고정 현상
- **증상:** AAPL, TSLA 같은 일반 주식은 실시간으로 잘 움직이나, SOXL 같은 ETF 종목이 특정 가격(예: 182달러)에 영원히 멈춰있는 현상.
- **원인:** 
  1. ETF 종목은 무료 Finnhub 웹소켓 실시간 푸시 대상에서 제외되는 경우가 많음.
  2. 이를 보완하기 위해 10초마다 백그라운드 폴링(REST API)을 돌렸으나, 과거 코드에 "이미 값이 있으면 덮어쓰지 않는다"는 조건이 있어 ETF의 갱신이 완전히 막혀 있었음.
  3. 최초 페이지 로드 시, 미니 차트를 그리기 위해 가져온 Yahoo Finance의 5분 봉 오픈 가격(182.4달러)이 메인 가격으로 잘못 세팅되면서 그 가격에 영원히 갇힘.
- **해결:** 10초 폴링이 가져오는 데이터는 무조건 기존 가격을 덮어쓰도록 강제하여 ETF 종목도 10초 주기로 정상 갱신되게 수정. 또한 미니 차트의 옛날 가격이 메인 가격에 간섭하지 못하도록 로직 분리.

---

## 2. 무적의 시장 데이터 동기화 아키텍처

무료 API들의 한계(요청 횟수 제한, 지연 시간, 웹소켓 누락 등)를 우회하기 위해 장 상태별로 가장 최적화된 API를 교차 사용하는 구조로 완성되었습니다.

### ⏰ 장 상태 판별 로직 (Time-based State)
과거에는 서버(Finnhub)가 알려주는 세션 상태 문자열에 의존했으나 서버 지연이 심해 버려짐.
- **휴장일 체크:** Finnhub에는 오늘이 휴장일인지(`isOpen`) 여부만 확인.
- **시간 직접 계산:** 브라우저 시계를 **뉴욕 현지 시계(EST/EDT)**로 변환하여 1초의 오차도 없이 상태를 칼같이 가름.
  - `04:00 ~ 09:30` ➔ **프리장 (PRE)**
  - `09:30 ~ 16:00` ➔ **정규장 (REGULAR)**
  - `16:00 ~ 20:00` ➔ **애프터장 (POST)**

### 🌙 프리장 / 애프터장 (PRE / POST)
거래량이 적어 실시간 웹소켓 지원이 안 되므로, 차단당하지 않는 선에서 가장 빠르고 한 번에 데이터를 가져오는 폴링 전략 사용.
- **메인 가격 (5초 주기):** `TradingView Scanner`
  - 가장 빠르며 한 번의 HTTP 요청으로 8개 종목을 모두 긁어옴.
- **기준 가격 (10초 주기):** `Finnhub REST API`
  - 어제 장 마감 가격(`Previous Close`) 기준점 갱신용.
- **미니 차트 (2분 주기):** `Yahoo Finance`

### ☀️ 정규장 (REGULAR)
정규장에서는 딜레이를 없애기 위해 웹소켓(실시간 푸시)을 최우선으로 사용하며, 15분 지연 페널티가 있는 TradingView는 완전히 배제.
- **메인 가격 (0.1초 실시간):** `Finnhub WebSocket`
  - 일반 주식 체결 데이터 실시간 수신 (딜레이 사실상 없음).
- **ETF 및 땜빵용 가격 (10초 주기):** `Finnhub REST API`
  - SOXL 같이 웹소켓에서 제외된 종목이나 웹소켓 핑이 끊겼을 때를 대비해 10초마다 최신 가격으로 덮어씌움 (Finnhub 무료 API 요금제 마지노선).
- **미니 차트 (1분 주기):** `Yahoo Finance`
  - 주가 변동이 심한 정규장이므로 차트 업데이트 주기를 1분으로 단축.

## 3. GitHub Pages 정적 배포 최우선 아키텍처
이 프로젝트는 백엔드(Node.js 등)가 존재하지 않는 100% 클라이언트 사이드 위젯입니다.
* **리스크 방어:** 외부 API(Yahoo, Finnhub) 호출 시 CORS 문제가 발생하지 않도록 클라이언트 레벨에서 우회하거나 허용된 API만 선별하여 사용했습니다.
* **영구기관 달력 (marketCalendar.js):** 매년 휴장일을 갱신해야 하는 외부 서버의 의존성을 없애기 위해, 부활절 계산(Gregorian computus) 및 대체 휴일 로직을 순수 수학적 알고리즘으로 구현했습니다. 외부 호출 없이 브라우저 자체적으로 휴장일과 조기 마감일을 도출해내는 무한 달력입니다.

## 4. 단일 진실 공급원 (Single Source of Truth)
UI(TickerCard)가 비즈니스 로직(시간표)을 스스로 판단하지 못하게 막았습니다.
* **시간 계산의 중앙화:** 장 상태(프리마켓, 정규장 등) 및 **전환 5분 전(upcomingState)** 로직은 오직 데이터 훅(useStockData)에서만 10초 주기로 폴링하며 판단합니다.
* **조기 마감(Half-day) 대응:** 추수감사절이나 크리스마스이브 등 13:00에 조기 마감하는 특수 상황에서도, UI 컴포넌트는 전혀 수정될 필요 없이 데이터 레이어가 던져주는 POST 상태에 맞춰 완벽하게 대응합니다.

## 5. UI 구성 요소 간의 충돌 방지 (CSS Layout)
텍스트 길이의 가변성으로 인한 아이콘/배지 중첩(Overlap)을 CSS 레이아웃 구조로 근본적으로 해결했습니다.
* **.surge-badge (🚀/🔻):** 일반적인 `margin`이나 `flex` 간격이 아닌, 부모 폭 기준 밖으로 밀어내는 `right: 100%` 절대 좌표(absolute) 앵커링을 사용했습니다.
* 그 결과, 전환 임박으로 글씨가 [프리 >> 장중]으로 길어지더라도 이모지는 자연스럽게 왼쪽으로 밀려나며 절대 겹치지 않습니다.

## 6. 데모(시연) 환경의 하이재킹 (Hijacking)
리모컨(Configurator)에서 특정 이벤트(양전/음전, 목표가 도달)가 잘 작동하는지 테스트하기 위한 설계입니다.
* 데이터 레이어(useStockData)에 복잡한 시연용 UI 로직을 섞는 대신, **URL 쿼리 파라미터(&demo_transition=true 등)**를 통해 순수하게 외부에서 데모 엔진의 출력을 강제 왜곡(Distort)시킵니다.
* 리모컨은 iframe과 직접적인 통신(postMessage)을 주고받지 않고 URL만 변경하므로, 결합도가 현저히 낮아져 버그 발생률을 극단적으로 낮춥니다.

---

## 7. 버전 히스토리 (Version History)

### v1.0.14 — 어두운 테마 가독성: 카드 불투명도 baseline 상향 + 리모컨 기본 100%
- **문제:** 어두운 테마(글래스·네온·유레카·전광판)가 너무 비쳐서, 밝거나 복잡한 OBS 씬 위에서 뒷배경(예: 바 씬의 술병) 디테일이 카드로 배어 나와 숫자와 경쟁 → 가독성 저하. 특히 네온(`--bg-a` 0.55)이 과투명. (참고: OBS 브라우저 소스는 아래 씬을 알 수 없어 `backdrop-filter` 블러가 무효 → 불투명도 상향이 유일한 실효 수단.)
- **테마 baseline(`--bg-a`) 상향:** 글래스 0.85→0.92, 네온 0.55→0.86, 유레카 0.93→0.96, 전광판 0.94→0.96. "유리감 힌트"는 남기되 기본 상태에서 배경 디테일이 뮤트되도록. 라이트 테마(amore·pastel)는 그대로.
- **리모컨 불투명도 기본값 0.95→1(100%):** 배경 알파 = `--bg-a × --card-opacity`(곱셈)라, 테마 baseline을 올린 만큼 슬라이더 기본은 100%가 자연스러움. 마이그레이션 v2→v3: v2가 전 사용자에게 force-stamp했던 0.95 홀드오버만 1로 이동, **직접 고른 값(≠0.95)은 보존**. 신규 사용자는 defaultConfig에서 바로 1. (Playwright로 신규=100%/홀드오버=100%/커스텀0.6=60% 유지 검증.)
- **슬라이더 유지:** 유리감을 더 원하는 사용자는 직접 낮출 수 있음(초심자 기본값은 가독성 우선).

### v1.0.13 — 모바일(삼성 브라우저) 스파크라인 디더링("지지직") 제거
- **🚨 증상:** 안드로이드 삼성 인터넷에서 tier2·3 카드의 스파크라인(오라 색이 깔린 영역)에 입자 노이즈(디더링)가 지지직거리고 색이 매끄럽게 안 채워짐. **PC 브라우저는 정상**(모바일 GPU 한정).
- **원인:** 서지 글로우가 `filter: drop-shadow`로 애니메이션되면서, 카드 전체(반투명 오라 그라디언트 + 반투명 스파크라인 채움 포함)를 매 프레임 **오프스크린 필터 버퍼**에 렌더. 모바일 GPU는 이 버퍼를 저정밀(RGB565 등)으로 잡는 경우가 많아, 겹친 반투명 레이어가 **디더링 노이즈**로 보임. 데스크톱은 고정밀이라 비가시.
- **해결:** 외곽 글로우를 `filter: drop-shadow` → **`box-shadow`**로 교체(`@keyframes surgePulse`). box-shadow는 자식을 오프스크린 버퍼로 재래스터화하지 않아 오라·스파크라인이 풀 정밀도로 합성됨. 카드가 둥근 사각형이라 글로우 모양은 시각적으로 동일. 서지 중 테마 box-shadow가 덮이므로 은은한 중립 그림자(`0 2px 10px rgba(0,0,0,.28)`)를 함께 실어 카드 엣지 유지. `overflow:hidden` 테마(LED)도 카드 자체 box-shadow는 클리핑 안 됨(확인). `.fx-off`의 `filter:none` 정리.
- **검증:** PC에서 amore·LED 테마 글로우가 drop-shadow와 동일하게 렌더됨 확인. 모바일 디더링 제거는 삼성 브라우저 실기 확인 필요(로컬에서 저정밀 버퍼 재현 불가).

### v1.0.12 — 서지 이펙트 깜박임(맥놀이) 제거
- **🚨 증상:** tier2·3 카드의 하단 추세 바(스파크라인) 근처에서 뭔가 깜박임.
- **원인:** 하단 스파크라인 영역에서 두 글로우 애니메이션이 겹쳐 도는데 **주기가 달라 맥놀이(beat)** 발생. ①서지 오라 `auraEmber`(불투명도 0.42↔0.72, **2.4초**)가 하단에 열기를 모으는데 그 자리가 반투명 스파크라인 바로 뒤 → 밝기가 스파크라인 너머로 맥동. ②카드 전체 `surgePulse`(drop-shadow 블러 2↔22px, **2.2초**) 헤일로. 2.4초 vs 2.2초라 약 26초 주기로 위상이 어긋났다 겹쳤다 반복 → 부드러운 한 번의 숨쉬기가 아니라 불규칙한 깜박임. (Playwright로 aura opacity·filter blur 시계열 측정해 확정.)
- **해결(주기 정렬+진정):** 모든 서지 애니메이션을 2.2초 하모닉으로 락. `auraEmber` 2.4→2.2초, `auraFrost` 4.6→4.4초(=2×2.2, 느리지만 위상 락). 진폭 완화: 오라 0.42~0.72→0.50~0.66, `surgePulse` 저점 2px→6px(거의 꺼지던 저점이 깜박임처럼 보이던 것 완화).
- **검증:** 수정 후 aura·glow 피크 시각차 **[0,0]ms**(정확히 동시 피크) 측정 → 맥놀이 제거, 한 번의 은은한 숨쉬기로 합쳐짐. 색·무드·이모지 제거 상태 모두 유지 확인.

### v1.0.11 — 서지 색 튜닝 + 서지 이모지 제거 + 버전 표기 + 데모 경고 문구
- **tier3 하락 얼음 강화:** -15%의 얼어붙음이 잘 안 보이던 문제(색이 흰빛 `#bdefff`에 가까워 저대비). 색을 선명한 얼음 시안 `#8fdcff`로, 서리 오라 범위·불투명도 상향(top 145%×85%·corner 72%×64%, `--aura-lo/hi` 0.62/0.92)해 "얼음처럼 변함"을 뚜렷하게.
- **tier2 상승 노랑 완화:** +10%의 노랑이 세서 주황 `#ff8f2e` → 붉은 주황 `#ff6a2b`으로. "빨강이 지배하고 노랑이 살짝 비치는" 톤. 중간 오라(`.aura-mid`) 불투명도 ~10%↓(0.16/0.28 → 0.14/0.25).
- **서지 이모지(🔥/💦) 제거:** 등급별 색(달아오름/얼어붙음)으로 상태를 표현하므로 카드의 불꽃/물방울 이모지는 중복 → 삭제. 관련 죽은 CSS(`.surge-badge`, `@keyframes surgeBounce`, `.fx-off .surge-badge`) 정리. 배지행 높이는 여전히 장 배지가 결정(카드 크기 불변).
- **버전 표기:** `package.json`의 version을 import해 Configurator 고급 설정 끝 우하단에 `v1.0.11` 표시(항상 최신 버전 자동 반영).
- **데모 경고 문구:** 개발자 데모 모드 토글 바로 아래 "⛔ 라이브 방송 중에는 누르지 마세요"를 항상 표시(켜기 전에도 경고). 기존 "가짜 데이터 송출 주의" 경고는 켠 뒤 표시로 유지.

### v1.0.10 — 급등/급락 데모 + 서지 무드 3단화 + 목표가 이펙트 레이스 수정
**1) 급등/급락 데모 시나리오 (`demo_surge`)**
- Configurator 데모 토글 "급등/급락 테스트 (±5·10·15% 글로우 동시)" 추가. `useStockData` 데모 루프에서 종목을 `[+15,-15,+10,-10,+5,-5]` 순환 배정(`SURGE_TARGETS`)해 상승·하락 6개 글로우 등급을 한 화면에서 동시 확인.
- 각 tier 경계(surgeTier 5/10/15%)보다 0.5%p 위에 고정하고 밴드 안에서만 ±0.4%p 진동 → tick 애니메이션은 유지하되 tier가 흔들리지 않음. Playwright로 6등급 정확 배정 검증.

**2) tier3(±15%) 카드 무드 — 달아오름/얼어붙음**
- 기존엔 외곽 drop-shadow 글로우 한 겹뿐이라 "달아오른/얼어붙은" 분위기가 카드 전체로 드러나지 않던 문제. → tier3 카드에 몸체 오라 오버레이(`.surge-aura`) 추가. 상승=아래에서 열기가 피어오르며 flicker(`aura-hot`/`auraEmber`), 하락=위 가장자리·상단 모서리에서 서리가 스며들며 느리고 정적(`aura-frozen`/`auraFrost`).
- blend-mode 없이 일반 알파 합성이라 흰 카드(라이트 테마)에서도 사라지지 않음(screen 블렌드는 흰 배경서 소실되므로 배제). 콘텐츠(`.card-row`/`.sparkline-wrap`)를 `z-index:1`로 올려 오라(`z-index:0`)가 텍스트를 가리지 않음. 다크글래스/LED/파스텔라이트/유레카 4테마 육안 검증.

**3) 등급별 색 진행(열 램프) + tier2 중간 단계**
- **열/냉 색 램프:** 등급이 오를수록 글로우·오라 색이 hue까지 달아오르거나 얼어붙게 함. 상승=테마색(예: 빨강) → 주황(`#ff8f2e`) → 노랑(`#ffd23a`), 하락=테마색 → 얼음(`#56c2ff`) → 흰-파랑(`#bdefff`). tier1만 테마색으로 시작해 램프가 네이티브하게 출발, tier2·3은 고정 열/냉 앵커로 "노랑/얼음"이 모든 테마에서 명확. (초기엔 테마 gold `--fx-high-glow`를 썼으나 앰버라 tier1 빨강과 hue가 가까워 진행이 안 보이던 문제 → 명확한 노랑으로 교체. `color-mix()` 보간은 구버전 OBS CEF 미지원이라 배제하고 고정 앵커 채택.)
- `--surge-glow` 하나가 외곽 글로우와 카드 오라 색을 함께 구동 → 글로우와 무드가 같은 색으로 달아오름/얼어붙음.
- **tier2 중간 단계:** tier1→tier3 사이가 급격해, tier2 오라를 `--aura-lo/--aura-hi` 변수로 opacity만 0.16~0.28로 낮춘 `.aura-mid`로 "색감만 살짝" 넣어 연결 → tier1(글로우만)·tier2(옅은 색)·tier3(풀 무드) 3단 그라데이션. LED·기본·라이트 검증.

**🚨 4) 목표가 달성 이펙트 숫자 증발 (레이스 컨디션)**
- **증상:** 목표가 달성 → `🎯 목표가 $XXX` 배너 재생 시작 → 애니메이션 도중 숫자가 사라지고 `🎯 목표가 $`만 남음.
- **원인:** 달성 시 TickerCard가 부모(Configurator)에 `TARGET_REACHED`를 보내고, Configurator가 그 심볼의 목표가를 즉시 삭제(`targets` 파라미터 변경)함. 프리뷰 위젯이 리렌더되며 `targetPrice` prop이 `undefined`가 되는데, 2.7초짜리 배너가 아직 재생 중인 상태에서 텍스트가 **live `targetPrice`를 참조**해 빈 값이 됨. 즉 "이펙트 수명"과 "목표가 상태 수명"이 묶여 있던 문제. (실제 OBS 위젯은 `window.parent===window`라 목표가 삭제가 없어 정상이었고, Configurator 프리뷰 한정 재현.)
- **해결(스냅샷 분리):** 달성 순간의 목표가를 `targetPop` 상태에 캡처(`{ n, price: targetPrice }`)하고, 배너가 live prop 대신 `targetPop.price` 스냅샷을 렌더. 목표가가 해제돼도 배너는 자기 값으로 끝까지 재생.
- **검증:** 위젯 구동 후 배너 발화 시점에 해시에서 `targets` 제거(=목표가 해제와 동일한 prop 전이). 수정 전 `🎯 목표가 $`(숫자 증발)→수정 후 `🎯 목표가 $810.00`(유지). 동일 테스트로 수정 전 실패·수정 후 통과를 확인해 판별력 입증.

### v1.0.9 — 매직 상수 감사: 근거 문서화 + 유사값 통일 (동작 변화 최소)
전 코드베이스의 숫자 상수를 근거 유무로 감사. "이유 있으면 문서화, 근거 없이 갈린 유사값은 분석 후 통일".
- **M1 — WS 재접속 8s/10s → `WS_RECONNECT_MS`(8s) 통일:** 초기 생성 실패(10s)와 onclose(8s)로 갈려 있었으나 원칙 없는 차이 → 하나로.
- **M2 — 이펙트 리셋 타이머 명명(`TICK_MS`/`PARTICLE_MS`/`BANNER_MS`/`CROSS_MS`):** 값은 유지하되 "각 CSS 키프레임 duration + 버퍼"라는 근거를 주석화하고 상수로 묶음. CSS↔JS 이중 관리 드리프트 방지(플립에서 실제로 겪었던 문제). 근거: pumpShake/priceFlash 0.5–0.6s→600, fxPop 1.15s+0.15s stagger→1400, w52Pop 2.6s→2700, crossFlip 1.4s→1500.
- **M3 — fetch 타임아웃 4s/4s/5s → `FETCH_TIMEOUT_MS`(5s) 통일:** dev 프록시와 공개 프록시가 결국 같은 느린 upstream을 치므로 4s/5s 구분 근거 없음 → 단일 5s.
- **M4 — publish 이중 디바운스 제거:** Configurator가 publishSync를 500ms setTimeout으로 감싸고, useRemoteSync 내부가 다시 800ms 디바운스 → 네트워크 발행이 1300ms 지연되고 같은-브라우저 동기화까지 500ms 늦던 문제. Configurator 래퍼 제거(같은-브라우저 즉시), 네트워크 디바운스는 `RELAY_DEBOUNCE_MS`(800ms) 한 곳으로 단일화.
- 유지(근거 명확): `MAX_SPARK_POINTS=48`, `ENRICH_INTERVALS`, CLOSED 10분, metrics 6h, 52주 warm-up/쿨다운, target 데드존, 종목 상한 10, 리로드 가드, 포커스 warm-up 5s/쿨다운 6s 등. 순수 연출·데모 상수(fxIntensity, 파티클 랜덤 등)는 미대상.

### v1.0.8 — 변동폭 등급 시각화(5/10/15%) + 로테이트 자동 포커스
- **등급 글로우(전반적 시각 표현, 일회성 아님):** 등락률 크기에 따라 카드 글로우가 지속적으로 상승. `surgeTier`(±5→1, ±10→2, ±15→3). 색은 1(등락색)→2(진한 등락색)→**3(52주 신고/신저 색 = 골드/아이스)**. CSS 변수 `--surge-glow`/`--surge-max`를 등급 클래스(`surge-up/down-1/2/3`)가 세팅하고 단일 `surgePulse` 키프레임이 사용. 파티클 버스트(이벤트 연출)는 별개로 기존 유지. 검증: +6/+12/+18% → 초록→골드, -18% → 아이스.
- **로테이트 자동 포커스("속보 컷", 방안 D):** 데이터는 표시모드와 무관하게 전 종목 폴링되므로, off-screen 종목에 큰 이벤트(급등 등급 상승·52주 기록·목표가 도달) 발생 시 그 종목으로 로테이션을 즉시 전환. `focusNonce`로 dwell 타이머 재시작(컷된 카드에 정상 체류시간 부여), 6초 쿨다운으로 튐 방지. 양전음전/흔들림 같은 잦은 이벤트는 포커스 대상 아님.
  - **시작가 일괄 세팅 대응(warm-up):** 부팅 시 전 종목 값이 여러 소스(Finnhub/Yahoo/캐시)에서 우르르 세팅되며 튀는데, 이를 급등 크로싱으로 오인하면 안 됨 → 마운트 후 **첫 5초는 baseline만 기록하고 포커스 안 함**. 부팅부터 이미 급등 상태인 종목도 baseline이 되어 포커스를 뺏지 않고, 웜업 이후 "진짜 상승"만 컷. 검증(격리 프로필): calm 부팅→AAA 유지, BBB가 +7%로 부팅→포커스 안 뺏김, 웜업 후 CCC 급등→CCC로 컷.

### v1.0.7 — 4자리+ 가격 폰트 축소 + 지터 비례화(매직 상수 제거)
- **가격 폰트 축소:** v1.0.6의 적응형 소수 자리(fmtPrice)로도 극단값(4글자 티커 + 4자리 가격, 예: SNXX $1234.6)에선 넓은 폰트 테마(Jua/Fredoka)에서 제목이 1글자 잘리던 잔여 엣지 → 가격이 $1000 이상이면 `.neon-price.price-lg`로 폰트 `×0.84` 축소. fmtPrice와 stack되어 티커 공간 확보. 검증: SNXX $1234.6 / WXYZ $8888.8 제목 클립 0.
- **지터 비례화:** 업데이트 스태거 지터가 고정 2500ms(quote)/2000ms(pre)였는데, 이는 "고정 10초 주기 시절"의 어림값(주기의 25%)이라 적응형 주기(하한 5초)에선 50%까지 치솟아 자기 원칙("주기보다 충분히 작게")을 위반했음. → **지터 = 현재 주기 × 0.25(`JITTER_FRACTION`)** 로 비례화. 모듈 레벨로 `quoteIntervalMs(n)`·`PREMARKET_INTERVAL`·`JITTER_FRACTION` 추출해 폴링 주기와 지터를 한 곳에서 계산. 결과: 지터가 항상 주기의 1/4 유지(사이클 비겹침·순서 보존 자동 충족), 매직 상수 제거, 5초 하한과의 결합 해소.
- (참고) 본장 갱신주기 개별 튜닝 안은 검토 후 취소 — 기존 `max(5초, ⌈종목×1.2⌉초)` 공식이 이미 비례·쾌적(≤50/분). 5초 하한은 ①WS가 이미 실시간 ②차분한 체감 ③rate limit 근거로 유지.

### v1.0.6 — 안정성 강화 + 코드 정리 + 적응형 갱신 주기
**안정성(S)**
- **S1 레이트리밋 백오프:** Finnhub REST quote 루프가 한 사이클 전부 실패(429/장애)하면 주기를 최대 4×까지 늘려 throttle된 엔드포인트를 그만 두드림. 한 건이라도 성공하면 즉시 원복. (`fetchQuotes`가 성공 건수 반환 → `quoteLoop`가 backoff 조절.) 무료 키의 번들 노출 자체는 클라이언트 전용 구조상 숨길 수 없어, 대신 초과 시 카드가 stale로 표시되고 자동 회복.
- **S2 종목 10개 상한:** Widget/Configurator 모두 `slice(0,10)`. 10종목 × 5폴/분 = 50req/분으로 무료 한도(60) 아래 유지. 초과 입력 시 리모컨에 경고 문구.
- **S3 리로드 루프 방어:** `RecoveryBoundary`가 60초 내 3회 이상 리로드했으면 더는 리로드하지 않고 조용히 투명 렌더(무한 깜빡임 방지).

**적응형 본장 갱신 주기**
- 기존 고정 10초 → **`max(5s, ceil(종목수 × 1.2)s)`**. 종목 적으면 더 빠르게(예: 4종목 5초), 많아도 한도 내(10종목 12초). 일반 종목은 웹소켓이 이미 실시간이라 이 주기는 주로 ETF(SOXL 등 WS 미푸시)·백업 경로에 적용.

**정리(C)**
- C1: 죽은 Galmuri CDN 링크 제거(픽셀 테마 삭제로 미사용, `@latest` unpinned 리스크 제거).
- C2: 죽은 픽셀 코드 제거(Sparkline `pixel` 분기 / TickerCard·Widget `pixel` prop) — 유레카로 픽셀 테마 소멸.
- C3: README 최신화(픽셀 레트로→유레카 별밤, "클릭 즉시 반영" 과장 문구를 재붙여넣기 모델로, 플립 연출 반영).
- C4: 린트 경고 0 (미사용 `regularMarketPrice` 제거, `targets`→`_targets` 별칭). 겸사겸사 목표가 초기화 토스트(`showWipeToast`)가 렌더가 없어 안 뜨던 것 → 실제 표시하도록 완성(규칙1 암묵적 변동 피드백).
- C5 (해결): 4글자 티커+4자리 가격 동시일 때 제목 잘림 → 폰트 축소 대신 **적응형 가격 소수 자리**로 근본 해결. `utils/format.js`의 `fmtPrice`: 정수 4자리면 소수 1자리(`$1234.5`), 5자리+면 0자리(`$12345`)로 총 폭을 일정하게 유지(증권앱 관습과 동일). TickerCard 가격·등락 절대값, Widget 마퀴에 공용 적용.
- C6: `.gitattributes`(`* text=auto eol=lf`)로 CRLF/LF 경고 제거.

**기타**
- 용어: 리모컨의 "등록할 종목 심볼" → "**등록할 종목 티커**".
- **다크 글래스 불투명도 `--bg-a` 0.72 → 0.85**: 밝은/투명 배경에서 뿌옇던(바탕 비침) 현상 완화. 여전히 유리감은 유지하되 밝은 씬에서도 카드로 또렷하게 읽힘. (회귀는 아니었음 — 0.72는 최초 glassmorphism 설계값이었음.)
- **아모레 핑크 · 파스텔 라이트 부드러운 디테일**: 유레카 수준의 은은한 질감 추가(장식 아님). 상단 하이라이트(inset highlight) + 약한 그라데이션 sheen + (아모레) 소프트 이너 글로우. 카드가 더 부드럽고 입체적으로 보이되 요소는 추가하지 않음.

### v1.0.5 — LED 폰트 교체, 유레카 테마 신설, 프리뷰 스크롤바 테마색
세 가지 UI 다듬기를 한 릴리스로 묶음.

**1) LED 전광판 폰트 교체 (DSEG7 → VT323)**
- 증상: LED 테마 숫자 폰트가 "너무 커서" 제대로 표시되지 않음.
- 원인: `--font-num`이 7-세그먼트 폰트 `DSEG7-Classic-MINI`였는데, 이 폰트는 글리프가 크고 넓을 뿐 아니라 `$`, `%`, `(`, `)`를 아예 지원하지 않아 가격/등락률에서 폴백 글리프가 섞여 깨져 보임.
- 해결: 보드 전체를 `VT323`(레트로 LED/터미널 페이스)로 통일. 모든 문자를 정상 렌더하고 좁아서 4글자 티커도 안 잘림. `--fs-*`를 base 근처로 복원(VT323이 em당 작게 보임). 미사용 dseg CDN 링크 제거. 검증: KORU/SOXL/MUU/SNXX + $1234.56까지 오버플로 0, 문자 깨짐 없음.

**2) 유레카(theme-eureka) 테마 신설 — 픽셀 레트로 대체**
- 아무도 안 쓸 픽셀 레트로(theme-retto-pixel)를 제거하고, VTuber '유레카' 캐릭터 컬러로 신규 테마 구성.
- 팔레트: 딥 미드나잇 네이비 배경(별밤, radial-dot 별필드) + 골드 블론드(상승) / 크리스탈 블루(하락) + 에메랄드 틸(primary·상단 글로우 = 머리끝·눈 시그니처). 폰트 Fredoka.
- 참조 정리: Configurator 스와치·씬 자동매칭(`어두운 남색·별밤 톤`), Widget의 `pixel` 플래그는 항상 false로(픽셀아트 테마 없음). Sparkline/TickerCard의 pixel 플럼빙은 무해하게 잔존.

**3) 프리뷰 스크롤바 테마색**
- 6종목+ 프리뷰 박스 스크롤바를 기본 회색 대신 선택 테마 accent(`THEMES[].up`)로 tint. 박스에 `--sb-color` 주입, `.preview-frame-box::-webkit-scrollbar-thumb`(+Firefox `scrollbar-color`)가 참조. 검증: LED #ff5252 / 네온 #39ff14 / 아모레 #e91e63.

**4) 헤더 '위젯 연결됨' → 정직한 문구**
- 우상단 "위젯 연결됨"은 실제 연결을 감지하지 않고 `justApplied`로만 켜지는 가짜 상태였음(붙여넣기/OBS 로드 확인 불가). v1.0.4의 재붙여넣기 안내와도 모순. → 평소 `● OBS에 붙여넣을 준비 완료`, 변경 직후 `✓ 주소 갱신됨 · 다시 복사해 붙여넣기`로 교체. (진짜 연결 감지=하트비트는 위젯 부담·거짓 끊김 경보 리스크로 보류, 별도 검토 문서화.)

**5) 양전/음전 변동(플립) 연출**
- 기존: 새 방향 화살표 하나가 관통. → 반전 서사 강화: OLD 방향 화살표가 먼저 등장 → 중앙에서 `scaleY` 1→-1로 뒤집히며(▼↔▲) 색이 이전→새 색으로 전환 → NEW 방향으로 관통·퇴장. 3D 대신 2D `scaleY`(OBS CEF 안전). 렌더 글리프는 OLD쪽(양전 ▼/음전 ▲)이고 플립이 새 방향을 드러냄. 길이 1.05→1.4s에 맞춰 리셋 타이머 1100→1500ms. 절대위치 오버레이라 카드 크기 무영향. 검증: demo_cross에서 양전 시 파란 ▼ 선등장 확인.

### v1.0.4 — 프리뷰 카드 크기 고정 + 재붙여넣기 안내
- **🚨 증상:** 종목을 늘리면 미리보기에서 카드가 작아짐. 스트리머는 주소만 복붙하므로, 카드 크기가 바뀌면 OBS에서 매번 다시 조정해야 하는 문제.
  - **원인:** 프리뷰 스케일이 `Math.min(1, PREVIEW_W/frameW, 640/frameH)`였는데, 종목이 늘어 권장 높이(frameH = count×165)가 640을 넘으면 `640/frameH` 항이 위젯 전체를 축소시킴. 실제 OBS에서는 카드가 content-height(~146px)로 일정한데 프리뷰만 왜곡되어 스트리머를 오도.
  - **해결 방향(사용자 지시):** 카드 크기는 유지하고 권장 높이를 늘리는 쪽으로. 프리뷰 스케일을 **폭 기준으로만**(`Math.min(1, PREVIEW_W/frameW)`) 계산해 카드를 실제 크기로 렌더.
  - **5개까지 vs 6개부터(사용자 지시):** 5종목까지는 프리뷰 박스가 실제 높이 그대로 길어짐(스크롤 없음). 6종목부터는 박스를 5카드 높이(825px)로 캡하고 박스 내부에서만 스크롤 — 카드 크기는 어느 쪽이든 실제 그대로. 리스트/로테이트 프리뷰일 때는 `.config-preview-wrapper`의 자체 스크롤 캡을 인라인으로 풀어(씬 모드는 CSS 유지) 스크롤 컨테이너가 박스 하나로 결정적으로 정해지게 함. 프리뷰 iframe은 `pointer-events:none`로 휠이 박스 스크롤에 전달됨.
  - **검증:** 3·5·6·8 종목 모두 카드 149px 고정, iframe scale=1(축소 없음). 3·5종목은 박스 스크롤바 없음(패널 성장), 6·8종목은 박스 `overflow-y:auto`로 825px 캡·내부 스크롤. 권장 크기 텍스트는 종목 수만큼 증가(6종목 300×990).
- **재붙여넣기 안내:** 위젯 주소 아래 문구를 "설정을 바꾸면 위젯 주소를 다시 복사해 OBS에 붙여넣으세요"로 정리. OBS 소스 크기는 자동으로 바뀌지 않으므로(라이브 URL 싱크가 있어도), 복붙 워크플로에 맞는 정직한 안내. 기존의 상충하는 "바로 반영돼요" 문구와 통합.

### v1.0.3 — 테마 변경 프리뷰 딜레이 제거 (디바운스 정밀 분리)
- **🚨 증상:** 어느 순간부터 테마 스와치를 클릭해도 프리뷰 반영까지 눈에 띄는 지연(실측 678ms) 발생.
  - **원인:** 커밋 `3227dbf`에서 프리뷰 iframe을 `src={widgetUrl}`(즉시) → `src={debouncedWidgetUrl}`(500ms 디바운스)로 변경. 디바운스의 원래 목적(네트워크 `publishSync` rate limit)은 이미 별도 타이머로 처리되고 있었는데, 로컬 프리뷰 iframe까지 같은 디바운스에 불필요하게 묶임.
  - **실측 진단:** iframe에 마커(`window.__mark`)를 심어 확인한 결과 테마 변경은 **전체 리로드가 아니라 fragment 갱신**(마커 생존). 즉 위젯 재부팅/데이터 재요청과 무관하게 딜레이는 순수 디바운스 탓.
- **해결 (디바운스 정밀 분리):** 디바운스 대상을 free-text 심볼 입력창에만 한정.
  - `config.symbolsInput`만 400ms 디바운스 → `urlSymbolList` 파생, `widgetUrl`이 이를 사용.
  - iframe은 `src={widgetUrl}`(즉시)로 복귀, `debouncedWidgetUrl` state/effect 제거.
  - UI 칩 렌더링용 `symbolList`는 라이브 유지(타이핑 즉시 칩 표시).
  - **근거:** 심볼 입력은 라이브 텍스트라 디바운스가 없으면 "AAPL"을 칠 때 `A→AA→AAP` 매 글자마다 프리뷰 위젯이 쓰레기 티커로 Finnhub 구독/조회를 날림. 이산적(discrete) 컨트롤(테마/모드/투명도/fx)은 그런 문제가 없으므로 즉시 반영.
- **검증:** 테마 클릭 678ms → **115ms**(리로드 없음). 심볼 타이핑 중 프리뷰 URL은 디바운스로 억제(부분 심볼 API 폭주 없음)되면서 칩 UI는 즉시 반영, 멈추면 정착.

### v1.0.2 — 장 전환 애니메이션 배선 복구 + 배지 높이 고정
- **🚨 배선 누락 (Dead Feature):** v1.0.1에서 추가한 장 전환 애니메이션(`프리 ▸ 장중`)이 실제로는 전혀 표시되지 않던 문제.
  - **원인:** 데이터 레이어(`useStockData`)는 `upcomingState`(전환 5분 전 예측)를 정상 계산하고 `TickerCard`도 이를 소비할 준비가 되어 있었으나, 중간의 `Widget.jsx`(`renderCard`)가 카드에 `upcomingState` prop을 넘겨주지 않아 항상 `undefined`가 전달됨. 리스트/로테이트 모드 전체와 Configurator 전환 데모가 무반응이었음.
  - **해결:** `Widget.jsx`에 `upcomingState={ticker?.upcomingState}` 한 줄 배선.
- **🚨 전환 배지의 카드 크기 변동 (Layout Jitter):** 위 배선을 복구하자 잠복해 있던 크기 변동 버그가 드러남. 전환 완료 순간의 fade-out 배지(`<span><span class="fade-out-left">프리 ▸ </span>장중</span>`)에서 카드 높이가 155→159px, 배지가 18→23px로 커짐.
  - **원인:** `inline-block`(`fade-out-left`)이 text 노드("장중")와 형제로 섞이면서 baseline 정렬의 descender gap이 라인 박스 높이를 +5px 키움.
  - **해결:** 전환용 inline-block 헬퍼(`.transition-slide-in`, `.fade-out-left`, `.blink-arrows`)에 `vertical-align: top` 적용. baseline descender gap 제거로 확장 배지가 plain 배지와 정확히 동일한 높이 유지.
  - **검증:** transform(tick shake)의 영향을 받지 않는 `offsetHeight/offsetWidth`(레이아웃 크기)로 측정. 전환 사이클 전체에서 카드 155/292px·배지 18px 완전 고정 확인. (getBoundingClientRect은 tick 애니메이션 transform 때문에 몇 px 흔들리므로 크기 검증에는 부적합 — 이는 의도된 시각 효과이지 레이아웃 변동이 아님.)


## 2026-07-13: 장 전환 애니메이션 클린업 보강 및 E2E 테스트 완료
- **트러블슈팅:** TickerCard.jsx에서 장 전환 시 발생하는 \	ransitioning\ 이펙트의 1초 타이머가 컴포넌트 언마운트 시 클린업되지 않는 문제를 발견하고, \	ransitionTimerRef\를 도입하여 \useEffect\ 클린업 사이클에 통합함.
- **테스트:** Puppeteer 기반으로 백그라운드에서 실시간 5분 대기 E2E 테스트를 수행. 카운트다운 타이머 등장 및 장 전환, 네트워크 단절 후 복구 동작이 메모리 누수 없이 완벽하게 작동함을 확인.

## 2026-07-13: v1.0.16 Calm Live를 기본 이펙트로 도입
- **문제:** 기존 기본값 `full`은 매 틱 카드 흔들림·가격 플래시와 큰 변동의 반복 펄스를 동반해, 장시간 OBS 송출에서 시세보다 움직임이 먼저 보일 수 있었음.
- **해결:** 신규 Configurator의 기본 이펙트를 **Calm Live**로 변경. ±5/10/15%의 상승/하락 색 등급과 tier 2·3 카드 틴트는 낮은 고정 강도로 남기되, 틱 흔들림·가격 플래시·양전/음전 플립·파티클·무한 펄스를 제거. 목표가와 52주 신고가/신저가처럼 드문 이정표 배너는 유지.
- **하위 호환성:** 새 설정 URL은 `fx=calm`을 명시한다. 반대로 `fx`가 없는 기존 OBS URL은 Full 동작을 유지하며, 기존에 저장된 `full` 설정도 사용자가 선택한 값으로 보고 자동 변경하지 않음.
- **검증:** 데모 서지(±10/15%)를 300×660 소스로 렌더해 색·틸트는 유지되고 반복 애니메이션은 사라진 것을 확인. `npm run lint`와 `npm run build` 성공(기존 Vite 설정의 미사용 catch 변수 경고 1건은 유지).

## 2026-07-13: v1.0.17 오로라 별밤 테마명·별 밀도 조정
- **이름:** 사용자에게 보이는 테마명을 `유레카 별밤`에서 **오로라 별밤**(English: Aurora Starry Night)으로 변경. 기존 방송 URL의 `theme=theme-eureka` 내부 식별자는 유지해 하위 호환성을 보장.
- **배경 밀도:** 카드의 별 배경 반복 간격을 26px에서 **52px**로 변경. 별 사이의 가로·세로 거리를 각각 2배로 늘려, 작은 OBS 소스와 인코딩 환경에서 배경이 숫자와 경쟁하지 않도록 밀도를 낮춤.

## 2026-07-13: v1.0.18 Finnhub 타임아웃·레이트리밋 대기 키 추가
- **문제:** 정적 GitHub Pages 위젯에서 Finnhub REST 요청이 응답 없이 지연되면, 해당 폴링 사이클이 실패하고 이후 주기까지 시세 갱신을 기다려야 했음.
- **해결:** Finnhub 요청에 5초 AbortController 타임아웃을 적용하고, 타임아웃 또는 HTTP 429 레이트리밋일 때 즉시 보조 키로 재시도. 성공한 키는 다음 Finnhub REST 요청과 이후 WebSocket 재연결에 사용.
- **범위:** 401·403 같은 인증·권한 오류에서는 키를 교체하지 않음. 두 키가 모두 429를 반환하면 기존 백오프·stale 처리 흐름으로 돌아감.
