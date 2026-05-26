/* ==============================
KATLA/WORDLE CLONE (Fixed)
- Load word list from data/words.json
- Fast validation via Set
- Safe init (wait for loadWords)
- Board 6x5 + keyboard + flip + share
============================== */
const ROWS = 6;
const COLS = 5;

/* ===== DOM ===== */
const boardEl     = document.getElementById("board");
const keyboardEl  = document.getElementById("keyboard");
const inputEl     = document.getElementById("guess");
const submitBtn   = document.getElementById("submit");
const resetBtn    = document.getElementById("reset");
const shareBtn    = document.getElementById("share");
const messageEl   = document.getElementById("message");
const shareTextEl = document.getElementById("shareText");

/* ===== Wordlist (loaded) ===== */
let GUESSES = [];          // uppercase 5-letter words
let ANSWERS = [];          // answer pool
let VALID_SET = new Set(); // fast lookup
let answer = "";           // set after load
let wordsReady = false;    // guard to block submit before load finished

/* ===== UI State ===== */
let cells = [];
let keyButtons = new Map(); // "A" -> button
let currentRow = 0;
let currentCol = 0;
let gameOver = false;
let guesses = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
let colorHistory = [];

/* ===== Helpers ===== */
function setMessage(t) { messageEl.textContent = t || ""; }
function idx(r, c) { return r * COLS + c; }
function getRowWord(r) { return guesses[r].join(""); }
function isRowComplete(r) { return guesses[r].every(ch => ch && ch.length === 1); }

function clampGuessString(s) {
  return (s || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, COLS);
}

function isValidWord(word) {
  return VALID_SET.has(word);
}

function pickAnswer() {
  return ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
}

/* ===== Load Words =====
Format data/words.json:
{ "words": ["abadi","abang", ...] }
*/
async function loadWords() {
  setMessage("Memuat kamus kata...");
  const res = await fetch("/data/words.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Fetch words.json gagal. Status: " + res.status);

  const data = await res.json();
  if (!data || !Array.isArray(data.words)) {
    throw new Error('Format words.json harus { "words": [ ... ] }');
  }

  // normalisasi: uppercase, A-Z, length=5, unique
  const seen = new Set();
  const list = [];
  for (const w of data.words) {
    const s = String(w).toUpperCase().replace(/[^A-Z]/g, "");
    if (s.length === 5 && !seen.has(s)) {
      seen.add(s);
      list.push(s);
    }
  }

  GUESSES = list;
  ANSWERS = list;
  VALID_SET = new Set(GUESSES);

  if (ANSWERS.length === 0) throw new Error("Wordlist kosong setelah normalisasi.");

  answer = pickAnswer();
  wordsReady = true;
  setMessage(`Kamus siap: ${GUESSES.length} kata. Mulai!`);
}

/* ===== Build Board ===== */
function buildBoard() {
  boardEl.innerHTML = "";
  cells = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      boardEl.appendChild(cell);
      cells.push(cell);
    }
  }

  paintActiveRow();
  renderAll();
}

function renderAll() {
  for (let r = 0; r < ROWS; r++) renderRow(r);
}

function renderRow(r) {
  for (let c = 0; c < COLS; c++) {
    cells[idx(r, c)].textContent = guesses[r][c] || "";
  }
}

function paintActiveRow() {
  cells.forEach(cell => cell.classList.remove("active"));
  if (currentRow < ROWS && !gameOver) {
    for (let c = 0; c < COLS; c++) {
      cells[idx(currentRow, c)].classList.add("active");
    }
  }
}

/* ===== Keyboard Virtual ===== */
const KEY_LAYOUT = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["ENTER","Z","X","C","V","B","N","M","⌫"]
];

function buildKeyboard() {
  keyboardEl.innerHTML = "";
  keyButtons.clear();

  KEY_LAYOUT.forEach(rowKeys => {
    const row = document.createElement("div");
    row.className = "krow";

    rowKeys.forEach(k => {
      const btn = document.createElement("button");
      btn.className = "key";
      btn.type = "button";
      btn.textContent = k;

      if (k === "ENTER" || k === "⌫") btn.classList.add("wide");

      btn.addEventListener("click", () => handleVirtualKey(k));
      row.appendChild(btn);

      // simpan A-Z saja untuk pewarnaan keyboard
      if (/^[A-Z]$/.test(k)) keyButtons.set(k, btn);
    });

    keyboardEl.appendChild(row);
  });
}

function handleVirtualKey(k) {
  if (gameOver) return;
  setMessage("");

  if (k === "ENTER") return submitRow();
  if (k === "⌫") return removeLetter();
  addLetter(k);
}

/* ===== Update warna keyboard (prioritas g > y > b) ===== */
const RANK = { b: 1, y: 2, g: 3 };

function currentKeyColor(btn) {
  if (btn.classList.contains("g")) return "g";
  if (btn.classList.contains("y")) return "y";
  if (btn.classList.contains("b")) return "b";
  return null;
}

function updateKeyboardColors(word, colors) {
  for (let i = 0; i < COLS; i++) {
    const letter = word[i];
    const color = colors[i];
    const btn = keyButtons.get(letter);
    if (!btn) continue;

    const existing = currentKeyColor(btn);
    if (!existing || RANK[color] > RANK[existing]) {
      btn.classList.remove("g","y","b");
      btn.classList.add(color);
    }
  }
}

/* ===== Input handling ===== */
function syncInputBox() {
  if (!inputEl) return;
  inputEl.value = guesses[currentRow].join("");
}

function addLetter(ch) {
  if (gameOver || currentRow >= ROWS || currentCol >= COLS) return;
  guesses[currentRow][currentCol] = ch;
  renderRow(currentRow);
  currentCol++;
  syncInputBox();
}

function removeLetter() {
  if (gameOver || currentRow >= ROWS || currentCol <= 0) return;
  currentCol--;
  guesses[currentRow][currentCol] = "";
  renderRow(currentRow);
  syncInputBox();
}

/* Keyboard fisik */
function handleKeyDown(e) {
  if (gameOver) return;

  const key = e.key;
  if (key === "Backspace") {
    e.preventDefault();
    setMessage("");
    return removeLetter();
  }
  if (key === "Enter") {
    e.preventDefault();
    setMessage("");
    return submitRow();
  }
  if (/^[a-zA-Z]$/.test(key)) {
    e.preventDefault();
    setMessage("");
    return addLetter(key.toUpperCase());
  }
}

/* Input box (mobile) */
function handleInputBox() {
  if (gameOver) return;

  const clean = clampGuessString(inputEl.value);
  guesses[currentRow] = Array(COLS).fill("");
  for (let i = 0; i < clean.length; i++) guesses[currentRow][i] = clean[i];

  currentCol = clean.length;
  renderRow(currentRow);
}

function handleInputEnter(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    submitRow();
  }
}

/* ===== Evaluasi warna (2-pass: hijau dulu lalu kuning) ===== */
function evaluateGuess(guess, answerWord) {
  const result = Array(COLS).fill("b");
  const ans = answerWord.split("");
  const g = guess.split("");

  // PASS 1: green
  for (let i = 0; i < COLS; i++) {
    if (g[i] === ans[i]) {
      result[i] = "g";
      ans[i] = null;
    }
  }

  // PASS 2: yellow
  for (let i = 0; i < COLS; i++) {
    if (result[i] === "g") continue;
    const j = ans.indexOf(g[i]);
    if (j !== -1) {
      result[i] = "y";
      ans[j] = null;
    }
  }

  return result;
}

/* ===== Animasi flip berurutan per tile ===== */
function revealRowWithFlip(rowIndex, colors) {
  for (let c = 0; c < COLS; c++) {
    const cell = cells[idx(rowIndex, c)];
    cell.classList.remove("reveal");
    cell.classList.remove("g","y","b");

    // set warna final sebelum animasi (CSS flip akan tetap jalan)
    cell.classList.add(colors[c]);
    cell.style.animationDelay = `${c * 140}ms`;
    cell.classList.add("reveal");
  }
}

/* ===== Submit + win/lose ===== */
function submitRow() {
  if (!wordsReady) {
    setMessage("Kamus belum siap. Pastikan words.json bisa dimuat.");
    return;
  }
  if (gameOver || currentRow >= ROWS) return;

  if (!isRowComplete(currentRow)) {
    setMessage("Ketik 5 huruf dulu sebelum submit.");
    return;
  }

  const word = getRowWord(currentRow);

  if (!isValidWord(word)) {
    setMessage("Kata tidak valid (tidak ada di daftar).");
    return;
  }

  const colors = evaluateGuess(word, answer);
  colorHistory.push(colors);

  revealRowWithFlip(currentRow, colors);
  updateKeyboardColors(word, colors);

  shareBtn.disabled = colorHistory.length === 0;
  shareTextEl.value = buildShareText(false);

  if (word === answer) {
    setMessage("🎉 Benar! Kamu menang!");
    endGame();
    shareTextEl.value = buildShareText(true);
    return;
  }

  currentRow++;
  currentCol = 0;

  if (currentRow >= ROWS) {
    setMessage(`😅 Kesempatan habis. Jawabannya: ${answer}`);
    endGame();
    shareTextEl.value = buildShareText(true);
    return;
  }

  paintActiveRow();
  syncInputBox();
  setMessage(`Sisa percobaan: ${ROWS - currentRow}`);
}

function endGame() {
  gameOver = true;
  paintActiveRow();
  submitBtn.disabled = true;
  inputEl.disabled = true;
}

/* ===== Share emoji ===== */
function buildShareText(isFinal) {
  const mapEmoji = { g: "🟩", y: "🟨", b: "⬜" };
  const tries = colorHistory.length;
  const scoreLine = isFinal ? `${tries}/${ROWS}` : `${tries}/${ROWS} (sementara)`;

  let out = `Katla Clone ${scoreLine}\n`;
  for (const row of colorHistory) {
    out += row.map(x => mapEmoji[x] || "⬜").join("") + "\n";
  }
  return out.trimEnd();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      shareTextEl.focus();
      shareTextEl.select();
      document.execCommand("copy");
      return true;
    } catch (__){
      return false;
    }
  }
}

async function handleShare() {
  const text = buildShareText(true);
  shareTextEl.value = text;
  const ok = await copyToClipboard(text);
  setMessage(ok ? "✅ Hasil disalin ke clipboard!" : "❌ Gagal copy otomatis. Salin manual dari kotak hasil.");
}

/* ===== Reset ===== */
function resetGame() {
  if (!wordsReady) {
    setMessage("Kamus belum siap. Pastikan words.json bisa dimuat.");
    return;
  }

  answer = pickAnswer();
  currentRow = 0;
  currentCol = 0;
  gameOver = false;

  guesses = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
  colorHistory = [];

  submitBtn.disabled = false;
  inputEl.disabled = false;
  inputEl.value = "";

  shareBtn.disabled = true;
  shareTextEl.value = "";

  buildBoard();
  buildKeyboard();
  setMessage("Game di-reset. Mulai lagi!");
}

/* ===== Init ===== */
document.addEventListener("keydown", handleKeyDown);
inputEl.addEventListener("input", handleInputBox);
inputEl.addEventListener("keydown", handleInputEnter);
submitBtn.addEventListener("click", submitRow);
resetBtn.addEventListener("click", resetGame);
shareBtn.addEventListener("click", handleShare);

async function init() {
  buildBoard();
  buildKeyboard();
  shareBtn.disabled = true;

  try {
    await loadWords();
  } catch (e) {
    console.error(e);
    wordsReady = false;
    setMessage("❌ Gagal memuat kamus. Cek file data/words.json dan path-nya.");
  }
}

init();