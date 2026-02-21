# 🎯 Co-Bingo

> QR 코드 스캔으로 연결하는 실시간 멀티플레이어 빙고 게임

## 🚀 빠른 시작

### 로컬 개발 서버 실행

```bash
npx serve .
# 또는
python -m http.server 3000
```

브라우저에서 `http://localhost:3000` 접속

> **중요**: `file://` 프로토콜로 직접 열면 ES 모듈이 작동하지 않습니다. 반드시 HTTP 서버를 통해 접속하세요.

---

## 🔧 Firebase 설정 (이미 완료 ✅)

Firebase 프로젝트 `co-bingo-game`이 이미 설정되어 있습니다.

| 항목 | 값 |
|------|-----|
| 프로젝트 ID | `co-bingo-game` |
| RTDB URL | `https://co-bingo-game-default-rtdb.asia-southeast1.firebasedatabase.app` |
| 보안 규칙 | 테스트 모드 (30일 만료 → 갱신 필요) |

### Firebase 보안 규칙 갱신

[Firebase Console](https://console.firebase.google.com/project/co-bingo-game/database/co-bingo-game-default-rtdb/rules) 에서 다음 규칙 적용:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

---

## 📦 배포 (Vercel)

### 1. GitHub 저장소 생성

```bash
git init
git add .
git commit -m "feat: initial Co-Bingo implementation"
git remote add origin https://github.com/{username}/co-bingo.git
git push -u origin main
```

### 2. Vercel 연결

1. [vercel.com](https://vercel.com) → GitHub 로그인
2. **"Add New Project"** → `co-bingo` 저장소 선택
3. Framework Preset: **Other**
4. Build Command: (비워두기)
5. Output Directory: `.`
6. **Deploy** 클릭

배포 URL: `https://co-bingo.vercel.app` (또는 유사)

---

## 🎮 게임 방법

1. **방 만들기**: 닉네임 입력 후 "방 만들기" 클릭
2. **친구 초대**: QR 코드 스캔 또는 6자리 방 코드 공유
3. **보드 배치**: 숫자를 탭하여 빙고판 배치 (또는 랜덤)
4. **준비 완료**: 전원 준비 시 게임 자동 시작
5. **숫자 호출**: 자기 차례에 숫자 선택
6. **빙고!**: 설정한 줄 수 달성 시 승리

---

## 📁 프로젝트 구조

```
co-bingo/
├── index.html              # SPA 셸
├── css/
│   └── style.css           # 글래스모피즘 다크 테마
├── js/
│   ├── app.js              # 메인 컨트롤러 & 라우터
│   ├── firebase-config.js  # Firebase 초기화
│   ├── db.js               # Firebase RTDB 래퍼
│   ├── room.js             # 방 생성/참가
│   ├── game.js             # 빙고 로직 (순수 함수)
│   ├── ui.js               # 화면 렌더링
│   ├── qr.js               # QR 코드 생성
│   └── audio.js            # Web Audio 효과음
├── assets/
│   └── favicon.svg
├── vercel.json
└── PLAN.md
```

---

## ⚙️ 게임 설정 옵션

| 옵션 | 기본값 | 범위 |
|------|--------|------|
| 보드 크기 | 5×5 | 3×3 / 4×4 / 5×5 |
| 승리 조건 | 5줄 | 1 ~ 12 |
| 최대 인원 | 12명 | 2 ~ 12 |
