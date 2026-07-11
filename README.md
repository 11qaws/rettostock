# 📈 Rettostock Widget for OBS
[![English](https://img.shields.io/badge/Language-English-blue)](#english) [![Korean](https://img.shields.io/badge/Language-Korean-red)](#korean)

---

<h2 id="korean">🇰🇷 한국어</h2>

인터넷 방송(OBS 스튜디오) 화면을 한층 더 전문적이고 트렌디하게 꾸며줄 **실시간 미국 주식 전광판 위젯 & 전용 리모컨**입니다. 

### ✨ 주요 특징

* **100% 실시간 주식 데이터**: 장중 체결되는 실시간 주식/ETF 시세는 물론, 프리장과 애프터장의 변동 가격까지 정확하게 띄워줍니다. 장 상태(프리/장중/애프터/마감) 배지는 뉴욕 시계와 내장 휴장일 캘린더로 초 단위로 정확합니다.
* **하루가 읽히는 스파크라인**: 미니 차트에 전일 종가 기준선이 깔리고, 그 위는 상승색·아래는 하락색으로 칠해져 차트 모양만으로 오늘의 흐름이 보입니다.
* **살아있는 이벤트 이펙트**: 변동 폭에 비례해 카드가 흔들리고, 등락률이 음↔양으로 뒤집히는 순간 화살표가 카드를 관통하며, 당일 신고가/신저가 경신 팝, ±5% 급등락 시 🚀·💦 파티클까지 — 방송의 재미를 더해줍니다. (강도 조절/끄기 가능)
* **실시간 원격 제어 (옵트인)**: 고급 설정에서 '브라우저-OBS 실시간 연결'을 켜면, 브라우저에서 종목이나 테마를 클릭하는 순간 송출 중인 위젯이 곧바로 변신합니다. 끄면 위젯은 외부와 일절 통신하지 않아요.
* **방송 분위기에 맞춘 6가지 테마**: 아모레 핑크, 네온 바, 픽셀 레트로, LED 전광판 등 6개의 고퀄리티 디자인을 제공합니다. 상승/하락 색상도 한국식(빨강↑/파랑↓) 또는 미국식(초록↑/빨강↓)으로 자유롭게 변경 가능합니다.
* **다양한 송출 레이아웃**: 세로로 쌓는 `리스트 모드`, 하나씩 깔끔하게 돌아가는 `로테이트 모드`, 뉴스 속보처럼 지나가는 `마퀴(전광판) 모드`를 지원합니다.
* **어떤 크기든 선명하고 잘리지 않게**: 좁은 독이든 넓은 띠든 위젯이 스스로 글자 크기와 배치를 맞춰줍니다. 더 크게 쓰고 싶다면 소스 크기 값을 배율로 키우세요 — 전부 벡터라 어떤 크기에서도 또렷합니다.
* **데모 모드**: 장이 닫혀 있어도 가짜 시세가 움직여서 테마와 이펙트를 미리 볼 수 있습니다.

### 🚀 사용 방법

1. [리모컨 페이지](https://11qaws.github.io/rettostock/)에 접속하세요.
2. 원하는 주식 종목, 테마, 모드를 클릭하며 마음대로 꾸며봅니다.
3. 설정이 끝났다면 **[복사]** 버튼을 눌러 위젯 URL을 복사합니다.
4. OBS Studio에서 **[브라우저(Browser)] 소스**를 추가하고 URL 칸에 붙여넣습니다. (⚠️ '로컬 파일' 체크는 해제해 주세요)
5. 리모컨에 표시되는 권장 크기로 맞추면 세팅 끝! (더 크게 쓰려면 가로·세로 값을 같은 배율로 키워 주세요)

이후에는 방송 중 언제든 리모컨 페이지만 열어서 설정을 딸깍 바꾸면 됩니다.
데이터 아키텍처와 트러블슈팅 기록은 [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md)에 있습니다.

---

<h2 id="english">🇺🇸 English</h2>

A gorgeous, real-time US Stock ticker widget with a dedicated web remote control, built specifically for OBS Studio streamers.

### ✨ Key Features

* **100% Live Market Data**: Real-time prices for US stocks and ETFs, including pre-market and after-hours moves. Session badges (pre/regular/after/closed) run on a New York clock with a built-in NYSE holiday calendar.
* **Sparklines that tell the day's story**: each mini-chart is anchored to the previous close — up-colored above the dashed line, down-colored below.
* **Living event effects**: cards shake in proportion to the size of each move, an arrow sweeps through the card when the change flips sign, session high/low records pop a badge, and ±5% moves burst particles with a 🚀 or 💦. All adjustable or off.
* **Opt-in live remote control**: flip on the browser-OBS link in advanced settings and every click on the remote updates the widget live on stream. Leave it off and the widget makes zero external sync traffic.
* **6 Premium Themes**: Neon Bar, Pixel Retro, LED Board, Dark Glass and more. Up/Down color logic is switchable (Green Up / Red Down vs. Red Up / Blue Down).
* **3 Display Modes**: Stack them vertically (`List`), show one at a time (`Rotate`), or let them scroll horizontally like a news ticker (`Marquee`).
* **Sharp at any size**: narrow docks, wide strips, 1.5x blowups — the layout adapts and everything is vector, so nothing ever blurs or clips. Grow the source size values instead of stretching the transform.
* **Demo mode**: preview themes and effects with fake ticking prices while markets are closed.

### 🚀 How to Use

1. Open the [Remote Control Page](https://11qaws.github.io/rettostock/).
2. Pick your favorite stocks, theme, and display mode to customize your look.
3. Click the **[Copy]** button to grab your unique widget URL.
4. In OBS, add a new **Browser source** and paste the URL. (⚠️ Do NOT check "Local file")
5. Use the recommended size shown on the remote page — scale both dimensions by the same factor for a bigger widget. Done!

Keep the remote page open anywhere—whenever you want to change symbols or themes mid-stream, just click the remote and watch your OBS widget update instantly.
See [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) for the data architecture and troubleshooting notes.
