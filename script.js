/**
 * ====================================================================
 * SCRIPT.JS — Flora Duel: แข่งจัดแจกันดอกไม้กับ Algorithm Bot
 * ผู้เล่นแข่งจัดเรียงดอกไม้ประลองความเร็วกับ Algorithm Bot ที่ทำงานอยู่ตรงหน้า
 * มีระบบกติกา คะแนนแพ้ชนะชัดเจน และคอมเมนต์อธิบายขั้นตอน Algorithm
 * ====================================================================
 */

const BLOOMS = ['🌷', '🌼', '🌸', '🌻', '🌹', '🪻'];
const N = 6; // จำนวนแจกันดอกไม้

let initialHeights = [];
let playerHeights = [];
let botHeights = [];

let currentBot = 'bubble'; // 'bubble' | 'selection'
let isRacing = false;
let raceWinner = null;

// ระบบคะแนนและเวลา
let totalScore = 1000;
let timerInterval = null;
let startTime = 0;
let elapsedTime = 0;

// สถิติการเล่น
let playerSwaps = 0;
let selectedVaseIdx = null;

// สถิติบอท
let botSwaps = 0;
let botComps = 0;

/**
 * สังเคราะห์เสียงเอฟเฟกต์เบาๆ นุ่มนวล (Web Audio API)
 */
let audioCtx = null;
function playTone(freq, duration = 0.08) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

/**
 * สุ่มชุดดอกไม้ใหม่ ทั้งผู้เล่นและบอทจะได้ชุดเดียวกันเพื่อความยุติธรรม
 */
function resetDuel() {
  stopTimer();
  isRacing = false;
  raceWinner = null;
  selectedVaseIdx = null;

  playerSwaps = 0;
  botSwaps = 0;
  botComps = 0;
  elapsedTime = 0;

  // สุ่มความสูง 18 - 92 cm
  initialHeights = [];
  const set = new Set();
  while (initialHeights.length < N) {
    const h = Math.floor(Math.random() * 75) + 18;
    if (!set.has(h)) {
      set.add(h);
      initialHeights.push(h);
    }
  }

  playerHeights = [...initialHeights];
  botHeights = [...initialHeights];

  updateDashboardUI();

  document.getElementById('playerSortHint').innerText = 'ยังไม่เรียง';
  document.getElementById('playerSortHint').style.color = '#718096';
  document.getElementById('playerStatus').innerText = 'รอกดเริ่ม';
  document.getElementById('playerStatus').className = 'status-pill';

  document.getElementById('botComps').innerText = '0';
  document.getElementById('botStepText').innerText = 'กำลังรอกดปล่อยตัว...';
  document.getElementById('botStatus').innerText = 'รอกดเริ่ม';
  document.getElementById('botStatus').className = 'status-pill';

  document.getElementById('btnStart').disabled = false;

  renderPlayerShelf();
  renderBotShelf();
}

/**
 * อัปเดตตัวเลขบนแผงแดชบอร์ด และคำนวณการเปรียบเทียบสถิติการสลับ
 */
function updateDashboardUI() {
  document.getElementById('totalScore').innerText = totalScore.toLocaleString();
  document.getElementById('raceTimer').innerText = `${elapsedTime.toFixed(1)}s`;
  document.getElementById('playerSwapCount').innerText = playerSwaps;
  document.getElementById('footPlayerSwaps').innerText = playerSwaps;
  document.getElementById('botSwapCount').innerText = botSwaps;
  document.getElementById('footBotSwaps').innerText = botSwaps;

  // อัปเดตแผงเปรียบเทียบสถิติการสลับ (Swap Comparison Tracker)
  document.getElementById('compPlayerVal').innerText = playerSwaps;
  document.getElementById('compBotVal').innerText = botSwaps;

  const total = playerSwaps + botSwaps;
  let playerPct = 50;
  let botPct = 50;
  if (total > 0) {
    playerPct = Math.max(10, Math.min(90, Math.round((playerSwaps / total) * 100)));
    botPct = 100 - playerPct;
  }
  document.getElementById('playerBarFill').style.width = `${playerPct}%`;
  document.getElementById('botBarFill').style.width = `${botPct}%`;

  const badge = document.getElementById('swapDiffBadge');
  const analysis = document.getElementById('swapAnalysisText');

  if (playerSwaps === 0 && botSwaps === 0) {
    badge.className = 'diff-badge equal';
    badge.innerText = 'สลับเท่ากัน (0 vs 0)';
    analysis.innerText = '💡 เริ่มสลับแจกันเพื่อเปรียบเทียบความสามารถในการจัดเรียงระหว่างคุณกับอัลกอริทึม';
  } else if (playerSwaps < botSwaps) {
    const diff = botSwaps - playerSwaps;
    badge.className = 'diff-badge better';
    badge.innerText = `คุณสลับน้อยกว่าบอท ${diff} ครั้ง (Optimal!)`;
    analysis.innerText = `🟢 เยี่ยมมาก! คุณสลับไปเพียง ${playerSwaps} ครั้ง น้อยกว่า ${currentBot === 'bubble' ? 'Bubble Bot' : 'Selection Bot'} (${botSwaps} ครั้ง) เพราะคุณสามารถสลับข้ามตำแหน่งที่ถูกต้องได้ทันที`;
  } else if (playerSwaps > botSwaps) {
    const diff = playerSwaps - botSwaps;
    badge.className = 'diff-badge worse';
    badge.innerText = `คุณสลับมากกว่าบอท ${diff} ครั้ง`;
    analysis.innerText = `🟠 ปัจจุบันคุณสลับ ${playerSwaps} ครั้ง มากกว่าบอท (${botSwaps} ครั้ง) ลองวางแผนคู่ที่จะสลับให้แม่นยำขึ้นเพื่อลดจำนวนก้าว`;
  } else {
    badge.className = 'diff-badge equal';
    badge.innerText = `สลับเท่ากัน (${playerSwaps} vs ${botSwaps})`;
    analysis.innerText = `🟡 กำลังสูสี! จำนวนการสลับของคุณและบอทเท่ากันอยู่ที่ ${playerSwaps} ครั้ง`;
  }
}

function startTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    elapsedTime = (Date.now() - startTime) / 1000;
    document.getElementById('raceTimer').innerText = `${elapsedTime.toFixed(1)}s`;
  }, 100);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/**
 * สลับเลือกบอทคู่แข่ง (Bubble Bot vs Selection Bot)
 */
function chooseBot(type) {
  if (isRacing) return;
  currentBot = type;

  document.getElementById('btnBotBubble').classList.toggle('active', type === 'bubble');
  document.getElementById('btnBotSelect').classList.toggle('active', type === 'selection');

  const title = document.getElementById('botTitle');
  const exTitle = document.getElementById('botExplainTitle');
  const exBody = document.getElementById('botExplainBody');

  if (type === 'bubble') {
    title.innerText = '🤖 โต๊ะของ Bubble Bot';
    exTitle.innerText = '📋 กระดานสังเกตขั้นตอนของ Bubble Bot';
    exBody.innerText = 'สังเกตที่โต๊ะบอท: บอทจะเปรียบเทียบแจกันคู่ที่อยู่ติดกันทีละคู่ หากใบซ้ายสูงกว่าใบขวา จะสลับเพื่อดันแจกันสูงไปท้ายแถว';
  } else {
    title.innerText = '🤖 โต๊ะของ Selection Bot';
    exTitle.innerText = '📋 กระดานสังเกตขั้นตอนของ Selection Bot';
    exBody.innerText = 'สังเกตที่โต๊ะบอท: บอทจะกวาดสายตาหาแจกันที่เตี้ยที่สุด (Minimum) ในโซนที่ยังไม่เรียง แล้วสลับมาไว้หน้าสุดทีละรอบ';
  }

  resetDuel();
}

/**
 * ====================================================================
 * ฝั่งผู้เล่น: คลิกแจกันใบแรก แล้วคลิกใบที่สองเพื่อทำการสลับ (Swap)
 * ====================================================================
 */
function handlePlayerVaseClick(idx) {
  if (!isRacing) return; // ต้องกดเริ่มแข่งก่อนถึงจะขยับได้

  if (selectedVaseIdx === null) {
    // เลือกแจกันใบแรก
    selectedVaseIdx = idx;
    playTone(450);
    renderPlayerShelf();
  } else if (selectedVaseIdx === idx) {
    // ยกเลิกการเลือก
    selectedVaseIdx = null;
    renderPlayerShelf();
  } else {
    // สลับแจกันที่เลือกกับแจกันเป้าหมาย (Player Swaps Two Vases)
    const temp = playerHeights[selectedVaseIdx];
    playerHeights[selectedVaseIdx] = playerHeights[idx];
    playerHeights[idx] = temp;

    playerSwaps++;
    selectedVaseIdx = null;
    playTone(650);

    updateDashboardUI();
    renderPlayerShelf();

    // ตรวจสอบว่าผู้เล่นจัดเรียงเสร็จสมบูรณ์หรือยัง
    if (checkSorted(playerHeights)) {
      document.getElementById('playerSortHint').innerText = '✓ เรียงถูกต้องแล้ว!';
      document.getElementById('playerSortHint').style.color = '#065f46';
      finishRace('player');
    }
  }
}

/**
 * ตรวจสอบความเรียงลำดับจากเตี้ยไปสูง
 */
function checkSorted(arr) {
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] > arr[i + 1]) return false;
  }
  return true;
}

/**
 * เรนเดอร์โต๊ะดอกไม้ของผู้เล่น
 */
function renderPlayerShelf() {
  const shelf = document.getElementById('playerShelf');
  shelf.innerHTML = '';
  const maxH = Math.max(...playerHeights, 95);

  playerHeights.forEach((h, idx) => {
    const el = document.createElement('div');
    el.className = 'flower-item';
    if (idx === selectedVaseIdx) el.classList.add('selected');
    if (checkSorted(playerHeights)) el.classList.add('sorted');

    const icon = BLOOMS[idx % BLOOMS.length];
    const stemH = Math.max(25, (h / maxH) * 90);

    el.innerHTML = `
      <div class="bloom-icon">${icon}</div>
      <div class="flower-stem" style="height: ${stemH}px;"></div>
      <div class="ceramic-vase">
        <div class="vase-height">${h}cm</div>
      </div>
      <div class="flower-idx">[${idx}]</div>
    `;

    el.onclick = () => handlePlayerVaseClick(idx);
    shelf.appendChild(el);
  });
}

/**
 * เรนเดอร์โต๊ะดอกไม้ของ AI Bot พร้อมไฮไลต์สถานะการทำงานสดๆ
 */
function renderBotShelf(highlightComparing = [], highlightSwapping = false) {
  const shelf = document.getElementById('botShelf');
  shelf.innerHTML = '';
  const maxH = Math.max(...botHeights, 95);

  botHeights.forEach((h, idx) => {
    const el = document.createElement('div');
    el.className = 'flower-item';

    if (highlightComparing.includes(idx)) {
      el.classList.add(highlightSwapping ? 'swapping' : 'comparing');
    }
    if (checkSorted(botHeights) && !isRacing) {
      el.classList.add('sorted');
    }

    const icon = BLOOMS[idx % BLOOMS.length];
    const stemH = Math.max(25, (h / maxH) * 90);

    el.innerHTML = `
      <div class="bloom-icon">${icon}</div>
      <div class="flower-stem" style="height: ${stemH}px;"></div>
      <div class="ceramic-vase">
        <div class="vase-height">${h}cm</div>
      </div>
      <div class="flower-idx">[${idx}]</div>
    `;
    shelf.appendChild(el);
  });
}

/**
 * ====================================================================
 * ALGORITHM RUNNER: บอทจำลองการทำงานจริงทีละก้าวตรงหน้าผู้เล่น
 * ====================================================================
 */
async function startRace() {
  if (isRacing) return;
  isRacing = true;
  raceWinner = null;

  document.getElementById('btnStart').disabled = true;
  document.getElementById('playerStatus').innerText = 'กำลังแข่ง...';
  document.getElementById('playerStatus').className = 'status-pill running';
  document.getElementById('botStatus').innerText = 'กำลังจัด...';
  document.getElementById('botStatus').className = 'status-pill running';

  startTimer();
  playTone(550, 0.15);

  const speed = parseInt(document.getElementById('botSpeed').value);

  if (currentBot === 'bubble') {
    await runBubbleBot(speed);
  } else {
    await runSelectionBot(speed);
  }
}

/**
 * --------------------------------------------------------------------
 * 1. BUBBLE SORT BOT ENGINE
 * --------------------------------------------------------------------
 * หลักการ:
 * - บอทวนลูปเปรียบเทียบทีละคู่ติดกัน: botHeights[j] กับ botHeights[j+1]
 * - หากคู่ซ้าย > คู่ขวา -> ไฮไลต์สีส้มแดง และสลับ (Swap)
 * - แสดงข้อความบรรยายขั้นตอนที่กำลังทำอยู่สดๆ บนหน้าจอ
 */
async function runBubbleBot(delay) {
  const n = botHeights.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1 - i; j++) {
      if (!isRacing) return; // ผู้เล่นชนะแล้ว จบการแข่งขันทันที

      botComps++;
      document.getElementById('botComps').innerText = botComps;
      document.getElementById('botStepText').innerText = `เทียบแจกัน [${j}] ${botHeights[j]}cm กับ [${j+1}] ${botHeights[j+1]}cm`;
      renderBotShelf([j, j + 1], false);
      playTone(400);

      await new Promise(r => setTimeout(r, delay));

      // ตรวจสอบเงื่อนไขว่าซ้ายมากกว่าขวาหรือไม่
      if (botHeights[j] > botHeights[j + 1]) {
        if (!isRacing) return;
        document.getElementById('botStepText').innerText = `สลับ [${j}] กับ [${j+1}] ดันค่าสูงไปท้าย`;
        renderBotShelf([j, j + 1], true);
        playTone(600);

        // สลับค่าในอาเรย์ของบอท
        const temp = botHeights[j];
        botHeights[j] = botHeights[j + 1];
        botHeights[j + 1] = temp;
        botSwaps++;
        updateDashboardUI();

        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  renderBotShelf();
  if (isRacing && checkSorted(botHeights)) {
    finishRace('bot');
  }
}

/**
 * --------------------------------------------------------------------
 * 2. SELECTION SORT BOT ENGINE
 * --------------------------------------------------------------------
 * หลักการ:
 * - ในโซนที่ยังไม่จัด (i ถึง n-1) บอทจะวนลูปสแกนหาแจกันที่เตี้ยที่สุด (minIdx)
 * - ไฮไลต์แจกันที่กำลังสแกนเปรียบเทียบ
 * - เมื่อจบรอบ จะสลับแจกันที่เตี้ยที่สุดนั้นมาไว้ที่ตำแหน่ง i
 */
async function runSelectionBot(delay) {
  const n = botHeights.length;
  for (let i = 0; i < n - 1; i++) {
    let minIdx = i;
    document.getElementById('botStepText').innerText = `เริ่มรอบที่ ${i+1}: หาแจกันที่เตี้ยสุดตั้งแต่ [${i}] ถึง [${n-1}]`;

    for (let j = i + 1; j < n; j++) {
      if (!isRacing) return;

      botComps++;
      document.getElementById('botComps').innerText = botComps;
      renderBotShelf([minIdx, j], false);
      playTone(400);

      await new Promise(r => setTimeout(r, delay));

      if (botHeights[j] < botHeights[minIdx]) {
        minIdx = j;
        document.getElementById('botStepText').innerText = `พบแจกันที่เตี้ยกว่าที่ [${minIdx}] สูง ${botHeights[minIdx]}cm`;
      }
    }

    // ทำการสลับแจกันเตี้ยสุดมาไว้ข้างหน้า
    if (minIdx !== i) {
      if (!isRacing) return;
      document.getElementById('botStepText').innerText = `สลับแจกันเตี้ยสุด [${minIdx}] มาไว้หน้าสุด [${i}]`;
      renderBotShelf([i, minIdx], true);
      playTone(600);

      const temp = botHeights[i];
      botHeights[i] = botHeights[minIdx];
      botHeights[minIdx] = temp;
      botSwaps++;
      updateDashboardUI();

      await new Promise(r => setTimeout(r, delay));
    }
  }

  renderBotShelf();
  if (isRacing && checkSorted(botHeights)) {
    finishRace('bot');
  }
}

/**
 * ====================================================================
 * ผลแพ้ชนะและคำนวณคะแนนที่ชัดเจน (Clear Win/Loss & Scoring System)
 * ====================================================================
 */
function finishRace(winner) {
  stopTimer();
  isRacing = false;
  raceWinner = winner;

  document.getElementById('playerStatus').innerText = winner === 'player' ? '🏆 ชนะ!' : 'แพ้';
  document.getElementById('playerStatus').className = 'status-pill finished';
  document.getElementById('botStatus').innerText = winner === 'bot' ? '🏆 ชนะ!' : 'เสร็จสิ้น';
  document.getElementById('botStatus').className = 'status-pill finished';

  const modal = document.getElementById('resultModal');
  const title = document.getElementById('resultTitle');
  const desc = document.getElementById('resultDesc');
  const icon = document.getElementById('resultIcon');
  const breakdown = document.getElementById('resultBreakdown');

  let baseScore = 0;
  let speedBonus = 0;
  let moveBonus = 0;
  let roundDelta = 0;

  if (winner === 'player') {
    playTone(700, 0.25);
    icon.innerText = '🏆';
    title.innerText = '🎉 คุณชนะการแข่งขัน!';
    desc.innerText = `คุณจัดแจกันดอกไม้เสร็จเรียบร้อยก่อน ${currentBot === 'bubble' ? 'Bubble Bot' : 'Selection Bot'} ทำงานจบ!`;

    baseScore = 500;
    // โบนัสความเร็ว: ยิ่งใช้เวลาน้อย ยิ่งได้แต้มเยอะ
    speedBonus = Math.max(50, Math.floor(300 - elapsedTime * 12));
    // โบนัสจำนวนก้าว: สลับน้อยครั้ง ยิ่งมีประสิทธิภาพ
    moveBonus = Math.max(50, (10 - playerSwaps) * 20);

    roundDelta = baseScore + speedBonus + moveBonus;
    totalScore += roundDelta;

    breakdown.innerHTML = `
      <div class="breakdown-row"><span>🌟 คะแนนฐานชนะบอท:</span><b>+${baseScore} แต้ม</b></div>
      <div class="breakdown-row"><span>⚡ โบนัสความเร็ว (${elapsedTime.toFixed(1)}s):</span><b>+${speedBonus} แต้ม</b></div>
      <div class="breakdown-row"><span>🎯 โบนัสประสิทธิภาพ (สลับ ${playerSwaps} ครั้ง):</span><b>+${moveBonus} แต้ม</b></div>
      <div class="breakdown-row"><span>📊 เทียบสถิติการสลับ:</span><b style="color:${playerSwaps <= botSwaps ? '#059669' : '#ea580c'};">คุณ ${playerSwaps} ครั้ง vs บอท ${botSwaps} ครั้ง</b></div>
      <div class="breakdown-row"><span>รวมได้รับในรอบนี้:</span><b>+${roundDelta} แต้ม</b></div>
      <div class="breakdown-row"><span>🌟 คะแนนสะสมทั้งหมด:</span><b style="color:#065f46;">${totalScore.toLocaleString()} แต้ม</b></div>
    `;
  } else {
    playTone(200, 0.3);
    icon.innerText = '🤖';
    title.innerText = 'บอทชนะในรอบนี้!';
    desc.innerText = `${currentBot === 'bubble' ? 'Bubble Bot' : 'Selection Bot'} จัดดอกไม้ตามขั้นตอนเสร็จสมบูรณ์ก่อนคุณ!`;

    roundDelta = -200;
    totalScore = Math.max(0, totalScore + roundDelta);

    breakdown.innerHTML = `
      <div class="breakdown-row"><span>⚠️ ผลการแข่งขัน:</span><b style="color:#ef4444;">แพ้บอท (-200 แต้ม)</b></div>
      <div class="breakdown-row"><span>⏱️ เวลาที่ใช้:</span><b>${elapsedTime.toFixed(1)} วินาที</b></div>
      <div class="breakdown-row"><span>📊 เทียบสถิติการสลับ:</span><b style="color:${playerSwaps <= botSwaps ? '#059669' : '#ea580c'};">คุณ ${playerSwaps} ครั้ง vs บอท ${botSwaps} ครั้ง</b></div>
      <div class="breakdown-row"><span>🌟 คะแนนสะสมคงเหลือ:</span><b style="color:#3d405b;">${totalScore.toLocaleString()} แต้ม</b></div>
    `;
  }

  updateDashboardUI();
  modal.classList.add('open');
}

function closeModal() {
  document.getElementById('resultModal').classList.remove('open');
  resetDuel();
}

window.addEventListener('DOMContentLoaded', () => {
  resetDuel();
});
