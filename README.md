# 📈 Retto Stock Widget for OBS
[![English](https://img.shields.io/badge/Language-English-blue)](#english) [![Korean](https://img.shields.io/badge/Language-Korean-red)](#korean)

---

<h2 id="english">🇬🇧 English</h2>

A real-time stock and cryptocurrency ticker widget with a remote control web interface, designed specifically for OBS Studio and live streamers.
Adjusting settings on the remote control website will seamlessly synchronize the OBS widget in real-time!

### ✨ Key Features

* **Real-time Market Data**: Uses the Finnhub API to fetch live data for stocks (e.g., AAPL, TSLA), crypto (e.g., BINANCE:BTCUSDT), and ETFs.
* **Remote Control**: No more manually copy-pasting URLs into OBS! Change the ticker symbols, theme, or animation mode on the remote page, and the OBS browser source **updates automatically**.
* **Display Modes**:
  * `Scroll`: Smooth continuous marquee animation.
  * `Loop`: Symbols appear and disappear elegantly one by one.
  * `Rotate`: Smooth vertical flip rotation between symbols.
* **Custom Aesthetics**: Features a modern, premium design with `Outfit` and `Quicksand` fonts, fully supporting both Light and Dark themes.

### 🚀 How to Use

This project is hosted on GitHub Pages and is ready to use without any local installation.

1. Go to the [Remote Control Page](https://11qaws.github.io/rettostock/).
2. Add your desired ticker symbols (e.g., `AAPL`, `BINANCE:BTCUSDT`).
3. Click the **[Copy Widget URL for OBS]** button at the bottom.
4. Open OBS Studio, add a new **[Browser]** source.
5. Paste the copied link into the URL field. (⚠️ Do NOT check the "Local file" option!)
6. Keep the remote control page open on your phone or second monitor. Any changes you make will be instantly reflected on your stream!

### 🛠️ Tech Stack

* **Framework**: React (Vite)
* **Styling**: Vanilla CSS, Lucide React
* **Animation**: Framer Motion
* **API**: Finnhub
* **Sync**: Real-time cross-tab synchronization using `BroadcastChannel` and `localStorage` API.
* **Deployment**: GitHub Actions & GitHub Pages

---

<h2 id="korean">🇰🇷 한국어</h2>

OBS 스튜디오 인터넷 방송인을 위한 실시간 주식/암호화폐 전광판 위젯 및 원격 제어(리모컨) 웹 서비스입니다. 
웹 브라우저에서 리모컨을 조작하면 OBS 화면의 전광판이 실시간으로 동기화되어 즉각 반영됩니다!

### ✨ 주요 기능

* **실시간 시세 연동**: Finnhub API를 사용하여 주식(AAPL, TSLA 등), 암호화폐(BINANCE:BTCUSDT 등), ETF 등 전 세계 금융 데이터를 실시간으로 가져옵니다.
* **원격 제어 (리모컨)**: URL을 복사해서 OBS에 매번 다시 붙여넣을 필요가 없습니다. 리모컨 웹 페이지에서 종목, 테마, 모드를 변경하면 OBS 화면이 **실시간으로 자동 변경**됩니다.
* **다양한 디스플레이 모드**:
  * `Scroll`: 전광판처럼 자연스럽게 좌측으로 흐르는 애니메이션
  * `Loop`: 종목들이 하나씩 나타났다가 사라지는 루프 애니메이션
  * `Rotate`: 위아래로 부드럽게 회전하며 종목이 전환되는 모드
* **커스텀 디자인**: 고급스럽고 세련된 느낌을 주는 Outfit, Quicksand 폰트가 적용되었으며 라이트 모드 / 다크 모드 테마를 완벽 지원합니다.

### 🚀 사용 방법

이 프로젝트는 GitHub Pages로 배포되어 있어 다운로드 없이 웹에서 바로 사용할 수 있습니다.

1. [리모컨 페이지 접속하기](https://11qaws.github.io/rettostock/) 에 접속합니다.
2. 원하는 종목 심볼(예: `AAPL`, `BINANCE:BTCUSDT` 등)을 입력하고 추가합니다.
3. 리모컨 하단의 **[OBS용 위젯 링크 복사]** 버튼을 누릅니다.
4. OBS Studio를 열고 **[브라우저(Browser)]** 소스를 추가합니다.
5. 복사한 링크를 URL 칸에 붙여넣고 확인을 누릅니다. (⚠️ 절대 '로컬 파일' 옵션을 체크하지 마세요!)
6. 이제 핸드폰이나 다른 모니터에서 리모컨 페이지를 띄워두고 조작하면, OBS 화면이 실시간으로 변하는 것을 볼 수 있습니다!

### 🛠️ 기술 스택 (Tech Stack)

* **프레임워크**: React (Vite)
* **스타일링**: Vanilla CSS, Lucide React (아이콘)
* **애니메이션**: Framer Motion
* **API**: Finnhub 실시간 금융 API 연동
* **통신**: `BroadcastChannel` 및 `localStorage` 이벤트를 통한 브라우저 탭 간 실시간 데이터 동기화
* **배포**: GitHub Actions & GitHub Pages
