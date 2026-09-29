'use strict';

/* =====================================================================
   Calculator logic
   ---------------------------------------------------------------------
   How it works:
   - The calculation is stored as a list of tokens, e.g. ['2', '+', '3', '×'].
   - The number being typed lives in state.current (a string).
   - Pressing "=" hands the tokens to evaluate(), which does its own
     arithmetic with two passes (× ÷ first, then + −). eval() is never used,
     and only validated numbers and the four operators are accepted.
   ===================================================================== */

const MAX_DIGITS = 15;                        // Max digits a user can type in one number
const OPERATORS = ['+', '−', '×', '÷'];
const NUMBER_PATTERN = /^-?\d+(\.\d*)?(e[+-]?\d+)?$/i;

// Everything the calculator remembers between key presses
const state = {
  tokens: [],          // Finished part of the expression, e.g. ['2', '+', '3', '×']
  current: '0',        // Number being typed ('' right after an operator is pressed)
  freshResult: false,  // True when current is a result: the next digit starts a new number
  summary: '',         // Text of the last finished calculation, e.g. "2 + 3 ="
  error: null,         // Error message to show, or null
  lastOp: null,        // Remembered for repeated "=" presses (8 + 3 = = → 14)
  lastOperand: null
};

// Custom error type for problems we expect (like dividing by zero)
class CalcError extends Error {}

const resultEl = document.getElementById('result');
const expressionEl = document.getElementById('expression');
const keypad = document.getElementById('keypad');

/* ---------------------------------------------------------------------
   Safe evaluation
   --------------------------------------------------------------------- */

// Checks the token list has the shape: number (operator number)*
function validateTokens(tokens) {
  if (tokens.length % 2 === 0) throw new CalcError('Invalid expression');
  tokens.forEach(function (token, i) {
    const valid = i % 2 === 0 ? NUMBER_PATTERN.test(token) : OPERATORS.includes(token);
    if (!valid) throw new CalcError('Invalid expression');
  });
}

// Evaluates tokens with correct precedence: × and ÷ first, then + and −
function evaluate(tokens) {
  validateTokens(tokens);

  // Pass 1: resolve × and ÷, keep + and − for later
  const reduced = [Number(tokens[0])];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const value = Number(tokens[i + 1]);
    if (op === '×') {
      reduced[reduced.length - 1] *= value;
    } else if (op === '÷') {
      if (value === 0) throw new CalcError('Cannot divide by zero');
      reduced[reduced.length - 1] /= value;
    } else {
      reduced.push(op, value);
    }
  }

  // Pass 2: resolve + and − from left to right
  let total = reduced[0];
  for (let i = 1; i < reduced.length; i += 2) {
    total = reduced[i] === '+' ? total + reduced[i + 1] : total - reduced[i + 1];
  }
  return total;
}

// Turns a number into a display string: rounds off float noise (0.1 + 0.2)
// and switches to scientific notation for very large or tiny values
function formatResult(value) {
  if (!Number.isFinite(value)) throw new CalcError('Number too large');
  let rounded = Number(value.toPrecision(12));
  if (rounded === 0) rounded = 0;             // turns -0 into 0
  const abs = Math.abs(rounded);
  if (abs >= 1e15 || (abs !== 0 && abs < 1e-6)) return rounded.toExponential();
  return String(rounded);
}

/* ---------------------------------------------------------------------
   Key handlers
   --------------------------------------------------------------------- */

// Starts a fresh number after a result was shown
function beginNewEntry() {
  state.current = '0';
  state.freshResult = false;
  state.summary = '';
  state.lastOp = null;
}

// Adds a digit to the current number
function handleNumber(digit) {
  if (state.error) return;
  if (state.freshResult) beginNewEntry();

  if (state.current === '' ) {
    state.current = digit;
  } else if (state.current === '0') {
    state.current = digit;                    // avoid leading zeros ("05")
  } else if (state.current === '-0') {
    state.current = '-' + digit;
  } else if (state.current.replace(/\D/g, '').length < MAX_DIGITS) {
    state.current += digit;
  }
}

// Adds a decimal point, but only one per number
function handleDecimal() {
  if (state.error) return;
  if (state.freshResult) beginNewEntry();

  if (state.current === '') {
    state.current = '0.';
  } else if (!state.current.includes('.')) {
    state.current += '.';
  }
}

// Stores the current number and the chosen operator.
// Pressing a second operator in a row replaces the first one.
function handleOperator(op) {
  if (state.error) return;

  if (state.current !== '') {
    state.tokens.push(state.current.replace(/\.$/, ''), op);
    state.current = '';
  } else if (state.tokens.length > 0) {
    state.tokens[state.tokens.length - 1] = op;
  } else {
    state.tokens.push('0', op);               // operator pressed first: start from 0
  }
  state.freshResult = false;
  state.summary = '';
  state.lastOp = null;
}

// Calculates the result. Pressing "=" again repeats the last operation.
function calculate() {
  if (state.error) return;

  let tokens;
  if (state.freshResult && state.tokens.length === 0 && state.lastOp) {
    tokens = [state.current, state.lastOp, state.lastOperand];
  } else {
    tokens = state.tokens.slice();
    if (state.current !== '') {
      tokens.push(state.current.replace(/\.$/, ''));
    } else {
      tokens.pop();                           // ignore a trailing operator ("5 +" then "=")
    }
  }
  if (tokens.length < 3) return;              // nothing to calculate yet

  try {
    const result = formatResult(evaluate(tokens));
    state.summary = formatTokens(tokens) + ' =';
    state.lastOp = tokens[tokens.length - 2];
    state.lastOperand = tokens[tokens.length - 1];
    state.tokens = [];
    state.current = result;
    state.freshResult = true;
  } catch (err) {
    showError(err, tokens);
  }
}

// Switches to the error state (only AC works until it is cleared)
function showError(err, tokens) {
  state.error = err instanceof CalcError ? err.message : 'Error';
  state.summary = tokens ? formatTokens(tokens) + ' =' : '';
  state.tokens = [];
  state.current = '0';
  state.freshResult = false;
  state.lastOp = null;
}

// Resets everything, including any error
function clearCalculator() {
  state.tokens = [];
  state.current = '0';
  state.freshResult = false;
  state.summary = '';
  state.error = null;
  state.lastOp = null;
  state.lastOperand = null;
}

// Removes the last typed character. When the number is empty it removes the
// last operator instead. A finished result cannot be edited.
function deleteLast() {
  if (state.error || state.freshResult) return;

  if (state.current !== '') {
    const next = state.current.slice(0, -1);
    if (next === '' || next === '-') {
      state.current = state.tokens.length > 0 ? '' : '0';
    } else {
      state.current = next;
    }
  } else if (state.tokens.length > 0) {
    state.tokens.pop();                       // remove the operator
    state.current = state.tokens.pop() || '0'; // bring the number back for editing
  }
}

// Flips the current number between positive and negative
function toggleSign() {
  if (state.error) return;

  if (state.current === '') {
    state.current = '-0';                     // e.g. "5 × ±" starts a negative number
  } else if (state.current === '0' && state.freshResult) {
    return;
  } else if (state.current.charAt(0) === '-') {
    state.current = state.current.slice(1);
  } else {
    state.current = '-' + state.current;
  }
}

// Percentage: divides the current number by 100 (50 % → 0.5, 200 % → 2).
// It always acts on the number on screen, so the result is predictable.
// "200 + 50 %" becomes "200 + 0.5".
function handlePercentage() {
  if (state.error || state.current === '') return;

  const value = Number(state.current.replace(/\.$/, '')) / 100;
  state.current = formatResult(value);
  state.freshResult = true;                   // typing a digit next starts a new number
  state.lastOp = null;
  if (state.tokens.length === 0) state.summary = '';
}

/* ---------------------------------------------------------------------
   Display
   --------------------------------------------------------------------- */

// Adds thousands separators to a number string ("1234567.89" → "1,234,567.89")
function formatNumberString(str) {
  if (/e/i.test(str)) return str;
  const parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// Turns tokens into readable text: ['2', '+', '3'] → "2 + 3"
function formatTokens(tokens) {
  return tokens.map(function (t) {
    return OPERATORS.includes(t) ? t : formatNumberString(t);
  }).join(' ');
}

let shownResult = null;
let shownExpression = null;

// Writes the state to the screen (only touches the DOM when text changed)
function updateDisplay() {
  let main;
  if (state.error) {
    main = state.error;
  } else if (state.current !== '') {
    main = formatNumberString(state.current);
  } else {
    main = formatNumberString(state.tokens[state.tokens.length - 2]);
  }
  const expression = state.tokens.length > 0 ? formatTokens(state.tokens) : state.summary;

  if (main !== shownResult) {
    shownResult = main;
    resultEl.textContent = main;
    resultEl.dataset.size = main.length > 16 ? 'xs' : main.length > 12 ? 'sm' : 'md';
    resultEl.dataset.error = state.error ? 'true' : 'false';
  }
  if (expression !== shownExpression) {
    shownExpression = expression;
    expressionEl.textContent = expression;
  }
}

/* ---------------------------------------------------------------------
   Input wiring (mouse/touch and keyboard share one entry point)
   --------------------------------------------------------------------- */

// Runs one calculator action, then refreshes the screen.
// A try/catch here means a bug can never freeze the UI.
function runAction(action, value) {
  try {
    switch (action) {
      case 'number':   handleNumber(value); break;
      case 'decimal':  handleDecimal(); break;
      case 'operator': handleOperator(value); break;
      case 'equals':   calculate(); break;
      case 'clear':    clearCalculator(); break;
      case 'delete':   deleteLast(); break;
      case 'sign':     toggleSign(); break;
      case 'percent':  handlePercentage(); break;
    }
  } catch (err) {
    showError(err);
  }
  updateDisplay();
}

// Handles clicks/taps on any key (event delegation: one listener for all buttons)
function handleClick(event) {
  const button = event.target.closest('button[data-action]');
  if (button) runAction(button.dataset.action, button.dataset.value);
}

// Maps a keyboard key to a calculator action, or null if it isn't ours
function keyToAction(key) {
  if (key >= '0' && key <= '9' && key.length === 1) return { action: 'number', value: key };
  switch (key) {
    case '+':         return { action: 'operator', value: '+' };
    case '-':         return { action: 'operator', value: '−' };
    case '*':
    case 'x':
    case 'X':         return { action: 'operator', value: '×' };
    case '/':         return { action: 'operator', value: '÷' };
    case '.':
    case ',':         return { action: 'decimal' };
    case 'Enter':
    case '=':         return { action: 'equals' };
    case 'Backspace': return { action: 'delete' };
    case 'Escape':    return { action: 'clear' };
    case '%':         return { action: 'percent' };
    default:          return null;
  }
}

// Handles physical keyboard input. Enter always means "=", and
// preventDefault stops browser shortcuts (like "/" quick find in Firefox).
// Space still presses whichever button has focus.
function handleKeyboard(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;   // leave browser shortcuts alone
  const mapped = keyToAction(event.key);
  if (!mapped) return;

  event.preventDefault();
  if (event.repeat && mapped.action !== 'delete') return;       // ignore held-down keys (except Backspace)
  runAction(mapped.action, mapped.value);

  // Briefly highlight the matching on-screen key
  let selector = '[data-action="' + mapped.action + '"]';
  if (mapped.value !== undefined) selector += '[data-value="' + mapped.value + '"]';
  const button = keypad.querySelector(selector);
  if (button) {
    button.classList.add('is-pressed');
    setTimeout(function () { button.classList.remove('is-pressed'); }, 100);
  }
}

keypad.addEventListener('click', handleClick);
document.addEventListener('keydown', handleKeyboard);
updateDisplay();
