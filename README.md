# 📈 Rettostock Widget for OBS
[![English](https://img.shields.io/badge/Language-English-blue)](#english) [![Korean](https://img.shields.io/badge/Language-Korean-red)](#korean)

---

<h2 id="korean">🇰🇷 한국어</h2>

OBS 스튜디오 인터넷 방송인을 위한 실시간 주식/암호화폐 전광판 위젯 및 원격 제어(리모컨) 웹 서비스입니다.
리모컨 페이지에서 설정을 바꾸면 OBS 화면의 위젯이 실시간으로 바뀝니다.

### ✨ 주요 기능

* **실시간 시세**: 주식·ETF(Finnhub + Yahoo)를 실시간으로 표시합니다. 스파크라인 미니차트와 장중/프리장/애프터/마감 배지도 함께 나옵니다.
* **테마 6종**: 아모레 핑크 · 파스텔 라이트 · 픽셀 레트로 · 네온 바 · LED 전광판 · 다크 글래스. 상승/하락 색은 테마 기본 / 빨강↑·파랑↓ / 초록↑·빨강↓ 중 선택할 수 있습니다.
* **디스플레이 모드 3종**: `리스트`(세로 목록) · `로테이트`(하나씩 회전) · `마퀴`(전광판처럼 가로로 흐름).
* **이벤트 이펙트**: 등락률이 ±5%를 넘는 순간 파티클이 터지고 카드가 빛나며 🚀/💦 배지가 붙습니다. 강도 조절/끄기 가능.
* **브라우저-OBS 실시간 연결 (옵트인)**: 고급 설정에서 켜면 브라우저에서 바꾼 설정이 OBS 위젯에 바로 적용됩니다.
* **어디서나 안 잘림**: 위젯이 OBS 소스 크기에 맞춰 스스로 글자 크기와 배치를 조절합니다. 좁은 독, 낮고 넓은 띠 모두 OK.
* **데모 모드**: 장이 닫혀 있어도 가짜 시세로 테마와 이펙트를 미리 볼 수 있습니다.

### 🚀 사용 방법

1. [리모컨 페이지](https://11qaws.github.io/rettostock/)에 접속해 종목·테마·모드를 고릅니다.
2. **[복사]** 버튼으로 위젯 URL을 복사합니다.
3. OBS에서 **브라우저(Browser) 소스**를 추가하고 URL 칸에 붙여넣습니다. (⚠️ '로컬 파일' 체크 금지)
4. 크기는 리모컨에 표시되는 권장 크기로 맞추면 끝!

이후에는 리모컨 페이지만 열어두면 됩니다. 설정을 바꾸는 즉시 OBS 위젯이 따라 바뀝니다.
리모컨을 OBS 안에 넣고 싶다면: `도킹 가능한 UI → 사용자 지정 브라우저 독`에 리모컨 주소를 등록하세요.

### 🛠️ 기술 스택

* **프레임워크**: React (Vite)
* **스타일링**: Vanilla CSS (컨테이너 쿼리 기반 반응형), Lucide React
* **애니메이션**: Framer Motion + CSS 키프레임
* **데이터**: Finnhub WebSocket(실시간 체결) + Yahoo Finance(등락률·차트·장 상태)
* **원격 동기화**: BroadcastChannel/localStorage(같은 브라우저) + 옵트인 ntfy.sh 릴레이(ECDSA P-256 서명 검증, 크롬↔OBS·폰)
* **배포**: GitHub Actions & GitHub Pages

---

<h2 id="english">🇬🇧 English</h2>

A real-time stock & crypto ticker widget with a remote-control web page, built for OBS Studio streamers.
Change settings on the remote page and the OBS widget updates live.

### ✨ Key Features

* **Live market data**: stocks/ETFs (Finnhub + Yahoo) with sparkline mini-charts and market-state badges (regular/pre/after/closed).
* **6 themes**: Amore Pink · Pastel Light · Pixel Retro · Neon Bar · LED Board · Dark Glass. Up/down colors: theme default, red-up/blue-down (KR style), or green-up/red-down.
* **3 display modes**: `List`, `Rotate` (one at a time), `Marquee` (horizontal ticker strip).
* **Event effects**: when a ticker crosses ±5%, particles burst, the card glows, and a 🚀/💦 badge appears. Intensity is adjustable.
* **Opt-in live browser-to-OBS link**: enable it in advanced settings and changes made in your browser apply to the OBS widget instantly.
* **Never clipped**: container-query responsive layout adapts to any OBS source size — narrow docks, wide strips, anything.
* **Demo mode**: preview themes and effects with fake ticking prices while markets are closed.

### 🚀 How to Use

1. Open the [Remote Control Page](https://11qaws.github.io/rettostock/) and pick symbols, theme, and mode.
2. Copy the widget URL.
3. In OBS, add a **Browser** source and paste the URL. (⚠️ Do NOT check "Local file")
4. Use the recommended size shown on the remote page. Done!

Keep the remote page open anywhere — every change applies to the OBS widget instantly.
Prefer everything inside OBS? Register the remote page under `Docks → Custom Browser Docks`.

### 🛠️ Tech Stack

* **Framework**: React (Vite)
* **Styling**: Vanilla CSS (container-query responsive), Lucide React
* **Animation**: Framer Motion + CSS keyframes
* **Data**: Finnhub WebSocket (live trades) + Yahoo Finance (change %, chart, market state)
* **Sync**: BroadcastChannel/localStorage (same browser) + opt-in ntfy.sh relay with ECDSA P-256 signature verification (cross-browser/device)
* **Deployment**: GitHub Actions & GitHub Pages
