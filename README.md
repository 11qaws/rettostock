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
* **레이아웃 모드**: 
  * `리스트(List)`: 위에서 아래로 차곡차곡 쌓아서 보여줍니다. 세로로 긴 공간에 적합합니다.
  * `로테이트(Rotate)`: 한 번에 하나의 종목만 깔끔하게 보여주고, 일정 시간마다 다음 종목으로 넘어갑니다.
  * `마퀴(Marquee)`: 뉴스 속보처럼 우측에서 좌측으로 흘러갑니다. 화면 하단의 긴 띠 영역에 적합합니다.
* **이벤트 애니메이션 (이펙트)**:
  * 주가가 위아래로 크게 움직이거나, 양수/음수 전환이 일어날 때, 혹은 52주 신고가/신저가를 달성할 때 위젯이 화려한 애니메이션으로 반응합니다. (시청자의 주의가 분산된다면 '약하게' 또는 '끄기'로 변경할 수 있습니다.)
* **카드 비율 (상자형 / 카드형)**: 
  * `상자형`: 아담하고 둥글둥글한 박스 모양입니다.
  * `카드형`: 가로가 조금 더 긴 세련된 와이드 형태입니다. (두 형태 모두 세로 높이는 완벽하게 동일합니다.)
* **데모 모드**: 주식 시장이 닫혀있는 주말이나 야간에도 가짜 시세를 발생시켜, 방송 전에 디자인과 애니메이션이 어떻게 작동하는지 미리 테스트해 볼 수 있습니다.

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
* **Display Mode**: 
  * `List`: Stacks cards vertically. Best for sidebars.
  * `Rotate`: Shows one stock at a time and cycles through them automatically. Clean and compact.
  * `Marquee`: Scrolls horizontally like a news ticker. Best for the bottom or top of your stream.
* **Event Effects**:
  * The widget reacts to live market action! It shakes on sudden price drops/surges, bursts particles, and triggers celebratory banners on 52-week highs/lows. If this is too distracting, you can turn it down to 'Weak' or 'Off'.
* **Card Ratio (Box / Card)**:
  * `Box`: A compact, rounded square shape.
  * `Card`: A slightly wider, modern card shape. (Both shapes maintain the exact same vertical height).
* **Demo Mode**: Allows you to test themes and animations with fake ticking prices when the real stock market is closed.

---
*(For developers, data architecture and troubleshooting notes are kept in [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md))*
