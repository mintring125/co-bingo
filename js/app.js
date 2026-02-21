/**
 * app.js — Main controller: routing, session, Firebase listeners, game actions.
 */
import {
  getRoom, onRoomChange, setupOnDisconnect, reconnectPlayer,
  updateRoom, submitBoard, callNumber, advanceTurn, setWinner,
  startGame, startPlaying, restartGame, deleteRoom,
} from './db.js';
import { createNewRoom, joinExistingRoom } from './room.js';
import { countBingoLines, normalizeArray, normalizeBoard } from './game.js';
import {
  renderHome, renderJoin, renderLobby, renderSetup, renderGame, renderResult,
  showToast, resetSetupState,
} from './ui.js';
import { playMark, playBingo, playWin, playTurn, playJoin } from './audio.js';

// ─── App State ────────────────────────────────────────────────────────────────

const State = {
  roomId: null,
  playerId: null,
  playerName: null,
  room: null,
  unsubscribe: null,
  startingGame: false,  // guard for host auto-start
};

// ─── Session ──────────────────────────────────────────────────────────────────

function saveSession(roomId, playerId, playerName) {
  localStorage.setItem('co-bingo-session', JSON.stringify({ roomId, playerId, playerName }));
  Object.assign(State, { roomId, playerId, playerName });
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem('co-bingo-session')); } catch { return null; }
}

function clearSession() {
  localStorage.removeItem('co-bingo-session');
  Object.assign(State, { roomId: null, playerId: null, playerName: null, room: null });
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function navigate(path) {
  window.location.hash = '#' + path;
}

function getRoute() {
  return window.location.hash.slice(1) || '/';
}

// ─── Route Handler ────────────────────────────────────────────────────────────

async function handleRoute() {
  const route = getRoute();

  // Tear down previous listener
  if (State.unsubscribe) { State.unsubscribe(); State.unsubscribe = null; }
  State.startingGame = false;

  if (route === '/') {
    showHome();
  } else if (route.startsWith('/lobby/')) {
    await showLobby(route.split('/')[2]);
  } else if (route.startsWith('/setup/')) {
    await showSetup(route.split('/')[2]);
  } else if (route.startsWith('/game/')) {
    await showGame(route.split('/')[2]);
  } else if (route.startsWith('/result/')) {
    await showResult(route.split('/')[2]);
  } else {
    navigate('/');
  }
}

// ─── Home ─────────────────────────────────────────────────────────────────────

function showHome() {
  renderHome(loadSession(), {
    onCreateRoom: handleCreateRoom,
    onJoinRoom: handleJoinRoom,
    onReconnect: handleReconnect,
  });
}

async function handleCreateRoom() {
  const name = getInput('player-name-input');
  if (!name) { showToast('닉네임을 입력해주세요!'); return; }

  try {
    const { roomId, playerId } = await createNewRoom(name);
    saveSession(roomId, playerId, name);
    setupOnDisconnect(roomId, playerId);
    playJoin();
    navigate(`/lobby/${roomId}`);
  } catch (e) {
    showToast('방 생성 실패: ' + e.message);
  }
}

async function handleJoinRoom() {
  const name = getInput('player-name-input');
  const code = getInput('room-code-input')?.toUpperCase();
  if (!name) { showToast('닉네임을 입력해주세요!'); return; }
  if (!code) { showToast('방 코드를 입력해주세요!'); return; }

  try {
    const { roomId, playerId } = await joinExistingRoom(code, name);
    saveSession(roomId, playerId, name);
    setupOnDisconnect(roomId, playerId);
    playJoin();
    navigate(`/lobby/${roomId}`);
  } catch (e) {
    showToast('참가 실패: ' + e.message);
  }
}

async function handleReconnect() {
  const session = loadSession();
  if (!session) return;

  const room = await getRoom(session.roomId);
  if (!room) { clearSession(); showHome(); return; }

  Object.assign(State, { roomId: session.roomId, playerId: session.playerId, playerName: session.playerName });
  await reconnectPlayer(session.roomId, session.playerId);
  setupOnDisconnect(session.roomId, session.playerId);

  const routes = { waiting: 'lobby', setup: 'setup', playing: 'game', finished: 'result' };
  navigate(`/${routes[room.status] ?? 'lobby'}/${session.roomId}`);
}

// ─── QR / Direct Join ─────────────────────────────────────────────────────────

function showJoin(roomId) {
  renderJoin(roomId, {
    onJoin: async () => {
      const name = getInput('player-name-input');
      if (!name) { showToast('닉네임을 입력해주세요!'); return; }
      try {
        const { playerId } = await joinExistingRoom(roomId, name);
        saveSession(roomId, playerId, name);
        setupOnDisconnect(roomId, playerId);
        playJoin();
        // We're already at #/lobby/roomId so hashchange won't fire.
        // Directly call showLobby to set up the Firebase listener.
        await showLobby(roomId);
      } catch (e) {
        showToast('참가 실패: ' + e.message);
      }
    },
  });
}

// ─── Lobby ────────────────────────────────────────────────────────────────────

async function showLobby(roomId) {
  // Restore session if needed (e.g. from QR scan)
  if (!State.playerId) {
    const session = loadSession();
    if (session?.roomId === roomId) {
      Object.assign(State, session);
      await reconnectPlayer(roomId, State.playerId);
      setupOnDisconnect(roomId, State.playerId);
    } else {
      // New visitor — show join screen
      showJoin(roomId);
      return;
    }
  }

  State.roomId = roomId;

  State.unsubscribe = onRoomChange(roomId, room => {
    State.room = room;
    if (!room) { clearSession(); navigate('/'); return; }

    if (room.status === 'setup') { navigate(`/setup/${roomId}`); return; }
    if (room.status === 'playing') { navigate(`/game/${roomId}`); return; }
    if (room.status === 'finished') { navigate(`/result/${roomId}`); return; }

    renderLobby(room, State.playerId, {
      onStartGame: () => actionStartGame(roomId, room),
      onCopyCode: () => copyCode(roomId),
      onSettingsChange: settings => updateRoom(roomId, { settings }),
      onCloseRoom: () => actionCloseRoom(roomId),
    });
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

async function showSetup(roomId) {
  if (!State.playerId) {
    const session = loadSession();
    if (session?.roomId === roomId) {
      Object.assign(State, session);
      await reconnectPlayer(roomId, State.playerId);
      setupOnDisconnect(roomId, State.playerId);
    } else {
      navigate('/'); return;
    }
  }

  State.roomId = roomId;
  resetSetupState();

  State.unsubscribe = onRoomChange(roomId, async room => {
    State.room = room;
    if (!room) { clearSession(); navigate('/'); return; }

    if (room.status === 'waiting') { navigate(`/lobby/${roomId}`); return; }
    if (room.status === 'playing') { navigate(`/game/${roomId}`); return; }
    if (room.status === 'finished') { navigate(`/result/${roomId}`); return; }

    // Host auto-starts when all players are ready
    if (room.host === State.playerId && !State.startingGame) {
      const ps = Object.values(room.players ?? {});
      if (ps.length >= 2 && ps.every(p => p.ready)) {
        State.startingGame = true;
        await startPlaying(roomId);
        return;
      }
    }

    renderSetup(room, State.playerId, {
      onBoardReady: board => actionSubmitBoard(roomId, board),
      onCloseRoom: () => actionCloseRoom(roomId),
    });
  });
}

// ─── Game ─────────────────────────────────────────────────────────────────────

async function showGame(roomId) {
  if (!State.playerId) {
    const session = loadSession();
    if (session?.roomId === roomId) {
      Object.assign(State, session);
      await reconnectPlayer(roomId, State.playerId);
      setupOnDisconnect(roomId, State.playerId);
    } else {
      navigate('/'); return;
    }
  }

  State.roomId = roomId;
  let prevCalledLen = -1;
  let prevTurnId = null;

  State.unsubscribe = onRoomChange(roomId, room => {
    State.room = room;
    if (!room) { clearSession(); navigate('/'); return; }

    if (room.status === 'waiting') { navigate(`/lobby/${roomId}`); return; }
    if (room.status === 'finished') { navigate(`/result/${roomId}`); return; }

    const called = normalizeArray(room.calledNumbers);

    // Sound: new number called
    if (called.length > prevCalledLen && prevCalledLen >= 0) {
      const myPlayer = room.players?.[State.playerId];
      const board = myPlayer?.board ? normalizeBoard(myPlayer.board) : null;
      if (board) {
        const lines = countBingoLines(board, called);
        const prevLines = countBingoLines(board, called.slice(0, -1));
        if (lines > prevLines) { playBingo(); }
        else { playMark(); }
      } else {
        playMark();
      }
    }
    prevCalledLen = called.length;

    // Sound: my turn
    const turnOrder = normalizeArray(room.turnOrder);
    const turnIdx = room.currentTurnIndex ?? 0;
    const curTurnId = turnOrder[turnIdx % (turnOrder.length || 1)];
    if (curTurnId === State.playerId && curTurnId !== prevTurnId) {
      playTurn();
    }
    prevTurnId = curTurnId;

    renderGame(room, State.playerId, {
      onCallNumber: num => actionCallNumber(roomId, num),
      onCloseRoom: () => actionCloseRoom(roomId),
    });
  });
}

// ─── Result ───────────────────────────────────────────────────────────────────

async function showResult(roomId) {
  if (!State.playerId) {
    const session = loadSession();
    if (session?.roomId === roomId) {
      Object.assign(State, session);
    } else {
      navigate('/'); return;
    }
  }

  State.roomId = roomId;

  State.unsubscribe = onRoomChange(roomId, room => {
    State.room = room;
    if (!room) { clearSession(); navigate('/'); return; }
    if (room.status === 'waiting') { navigate(`/lobby/${roomId}`); return; }

    renderResult(room, State.playerId, {
      onRestart: () => actionRestart(roomId),
      onHome: () => { clearSession(); navigate('/'); },
    });
  });
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function actionStartGame(roomId, room) {
  const count = Object.keys(room?.players ?? {}).length;
  if (count < 2) { showToast('2명 이상이어야 시작할 수 있습니다!'); return; }
  await startGame(roomId);
}

async function actionSubmitBoard(roomId, board) {
  await submitBoard(roomId, State.playerId, board);
}

async function actionCallNumber(roomId, number) {
  const room = State.room;
  if (!room) return;

  const turnOrder = normalizeArray(room.turnOrder);
  const turnIdx = room.currentTurnIndex ?? 0;
  const curTurn = turnOrder[turnIdx % (turnOrder.length || 1)];

  if (curTurn !== State.playerId) { showToast('내 차례가 아닙니다!'); return; }

  const called = normalizeArray(room.calledNumbers);
  if (called.includes(number)) { showToast('이미 호출된 숫자입니다!'); return; }

  await callNumber(roomId, number);

  const newCalled = [...called, number];
  const players = room.players ?? {};
  const winCond = room.settings?.winCondition ?? 5;

  // Check for winner
  for (const [pid, p] of Object.entries(players)) {
    if (!p.board) continue;
    const board = normalizeBoard(p.board);
    const lines = countBingoLines(board, newCalled);
    if (lines >= winCond) {
      playWin();
      await setWinner(roomId, pid);
      return;
    }
  }

  const nextIdx = (turnIdx + 1) % turnOrder.length;
  await advanceTurn(roomId, nextIdx);
}

async function actionRestart(roomId) {
  resetSetupState();
  await restartGame(roomId);
}

async function actionCloseRoom(roomId) {
  if (!confirm('정말 방을 닫으시겠습니까?\n모든 플레이어가 퇴장됩니다.')) return;
  await deleteRoom(roomId);
  clearSession();
  navigate('/');
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function getInput(id) {
  return document.getElementById(id)?.value?.trim() ?? '';
}

function copyCode(roomId) {
  navigator.clipboard?.writeText(roomId)
    .then(() => showToast('방 코드 복사됨! (' + roomId + ')'))
    .catch(() => showToast('방 코드: ' + roomId));
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Handle QR scan: ?room=XXXXX query param → redirect to lobby hash
  const params = new URLSearchParams(location.search);
  const qrRoom = params.get('room');
  if (qrRoom) {
    const roomId = qrRoom.toUpperCase().trim();
    history.replaceState({}, '', location.pathname);
    window.location.hash = `#/lobby/${roomId}`;
  }

  window.addEventListener('hashchange', handleRoute);
  await handleRoute();
}

init();
