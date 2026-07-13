# 📈 Rettostock (레토스탁) - OBS 주식 위젯
[![English](https://img.shields.io/badge/Language-English-blue)](#english) [![Korean](https://img.shields.io/badge/Language-Korean-red)](#korean)

---

<h2 id="korean">🇰🇷 한국어 매뉴얼</h2>

인터넷 방송(OBS 스튜디오) 화면에 실시간 미국 주식/ETF 시세를 띄워주는 위젯과 전용 설정(리모컨) 페이지입니다.

### 🚀 시작하기 (OBS에 추가하는 법)
1. **[설정 페이지(리모컨) 열기](https://11qaws.github.io/rettostock/)**: 먼저 설정 페이지에 접속합니다.
2. **종목 및 디자인 세팅**: 원하는 주식 종목(최대 10개)을 검색해서 추가하고, 방송 화면에 어울리는 테마와 모드를 선택합니다. (설정을 바꿀 때마다 오른쪽 미리보기에 즉시 반영됩니다.)
3. **주소(URL) 복사**: 설정이 완료되면 화면 하단의 **[복사]** 버튼을 눌러 완성된 위젯 주소를 복사합니다.
4. **OBS에 소스 추가**: OBS Studio에서 `+` 버튼을 누르고 **[브라우저(Browser)]** 소스를 추가합니다.
5. **주소 붙여넣기 및 크기 조절**: URL 입력 칸에 복사한 주소를 붙여넣습니다. (⚠️ '로컬 파일' 체크 해제). 그리고 설정 페이지에 안내된 **권장 가로/세로 크기**를 입력하면 세팅이 끝납니다!

> 💡 **Tip:** 위젯을 더 크게 표시하고 싶다면 OBS 화면에서 모서리를 마우스로 잡아당겨서 늘리지 마세요. 화면이 흐려질 수 있습니다. 대신 브라우저 소스 속성창에서 가로/세로 크기 숫자를 직접 비례해서(예: 1.5배) 키워주세요. 글자가 절대 깨지지 않고 선명하게 유지됩니다.

### 🎨 화면 설정 가이드

#### 📌 일반 설정
* **💖 테마**: 아모레 핑크, 오로라 별밤 등 6개의 고퀄리티 디자인 중 내 방송에 어울리는 테마를 고릅니다.
* **✨ 디스플레이 모드**:
  * `리스트`: 위에서 아래로 차곡차곡 쌓아서 보여줍니다. 세로로 긴 공간에 적합합니다.
  * `로테이트`: 한 번에 하나의 종목만 깔끔하게 보여주고, 일정 시간마다 다음 종목으로 넘어갑니다.
  * `마퀴`: 뉴스 속보처럼 우측에서 좌측으로 흘러갑니다. 화면 하단의 긴 띠 영역에 적합합니다.

#### ⚙️ 고급 설정
* **🎨 상승/하락 색상**: 한국식(빨강↑/파랑↓) 또는 미국식(초록↑/빨강↓) 색 조합을 선택합니다.
* **✨ 테마 디테일**: 기본값은 **기본**. '디테일'로 변경 시 카드 내부에 미세한 빛 반사나 장식 효과가 추가됩니다.
* **▭ 카드 비율**: (마퀴 모드 제외)
  * `상자형`: 아담하고 둥글둥글한 박스 모양입니다.
  * `카드형`: 진짜 신용카드처럼 세로 비율이 적고 가로로 긴 세련된 와이드 형태입니다.
* **💥 이벤트 이펙트**: 주가가 크게 움직이거나 52주 신고가/신저가를 달성할 때 위젯이 애니메이션으로 반응합니다. 기본값은 방송을 방해하지 않는 **'약한 연출'**이며, '전체' 또는 '끄기'로 변경할 수 있습니다.
* **⏱️ 종목 전환 간격**: (로테이트 모드 전용) 기본값은 **10초**. 하나의 카드가 화면에 머무는 시간을 초 단위로 설정합니다.
* **⚡ 이벤트 포커스**: (로테이트 모드 전용) 켜두면 다른 카드가 돌아가고 있을 때 특정 종목에서 이벤트가 발생하면 즉시 해당 카드로 화면을 전환합니다.
* **🎢 마퀴 속도**: (마퀴 모드 전용) 기본값은 **1.0배**. 카드가 이동하는 속도를 조절합니다.
* **🫧 카드 불투명도**: 기본값은 **100%**. 위젯 전체의 불투명도를 조절합니다. 테마 디자인 자체에 이미 반투명한 유리 질감이 적용되어 있으므로 100%로 두어도 기본적으로 뒷 배경이 은은하게 비칩니다.
* **🎯 목표가 알림 사용하기**: 켜둔 뒤 특정 종목의 목표가를 입력해 두면, 주가가 그 가격에 도달했을 때 폭죽이 터지는 특별한 축하 효과가 발생합니다.
---

<h2 id="english">🇺🇸 English Manual</h2>

A real-time US Stock/ETF ticker widget and configurator built for OBS Studio streamers.

### 🚀 How to Add to OBS
1. **[Open Configurator](https://11qaws.github.io/rettostock/)**: Go to the settings page.
2. **Customize**: Add your favorite US stocks or ETFs (up to 10), and select a theme and display mode that fits your stream. The preview on the right will update instantly.
3. **Copy URL**: Once you are happy with the look, click the **[Copy]** button at the bottom to grab your custom widget URL.
4. **Add to OBS**: In OBS Studio, add a new **Browser source**.
5. **Paste and Resize**: Paste the copied URL into the URL field. (⚠️ Make sure "Local file" is unchecked). Set the Width and Height to the **Recommended Size** shown on the configurator page.

> 💡 **Tip:** If you want the widget to appear larger, do not stretch it by dragging the corners in OBS (it will become blurry). Instead, increase the Width and Height values directly in the Browser source properties by the same multiplier (e.g., 1.5x). The vector graphics will remain perfectly crisp.

### 🎨 Configuration Guide

#### 📌 General Settings
* **💖 Theme**: Choose from 6 premium designs like Amore Pink or Aurora Starry Night to match your stream.
* **✨ Display Mode**:
  * `List`: Stacks cards vertically. Best for sidebars.
  * `Rotate`: Shows one stock at a time and cycles through them automatically. Clean and compact.
  * `Marquee`: Scrolls horizontally like a news ticker. Best for the bottom or top of your stream.

#### ⚙️ Advanced Settings
* **🎨 Up/Down Colors**: Switch between color logics (e.g., Red Up / Blue Down vs. Green Up / Red Down).
* **✨ Theme Detail**: Default is **Basic**. Setting to 'Rich' adds subtle light reflections and extra aesthetic depth inside the cards.
* **▭ Card Ratio**: (Not applicable in Marquee mode)
  * `Box`: A compact, rounded square shape.
  * `Card`: A sleek, wider format with a shorter vertical proportion, much like a real credit card.
* **💥 Event Effects**: The widget reacts to live market action! It shakes on sudden price drops/surges, bursts particles, and triggers celebratory banners on 52-week highs/lows. The default is **'Weak'** to avoid distracting your viewers, but you can turn it up to 'Full' or completely 'Off'.
* **⏱️ Rotate Interval**: (Rotate mode only) Default is **10s**. Sets how long each card stays on screen before moving to the next.
* **⚡ Event Focus**: (Rotate mode only) If an event occurs on a stock that isn't currently displayed, the widget will instantly skip to that card.
* **🎢 Marquee Speed**: (Marquee mode only) Default is **1.0x**. Controls the scrolling speed.
* **🫧 Opacity**: Default is **100%**. Adjusts the overall widget opacity. Note that all themes already feature built-in glassmorphism (semi-transparent backgrounds), so the widget is naturally translucent even at 100%.
* **🎯 Target Price Alerts**: When enabled, you can set target prices for specific stocks. Hitting the target triggers a special celebration effect.
---
*(For developers, data architecture and troubleshooting notes are kept in [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md))*
