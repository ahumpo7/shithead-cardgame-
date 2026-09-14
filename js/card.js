/**
 * Card Model & Rendering
 * Represents a single playing card with suits, ranks, values, and HTML/SVG rendering.
 */

class Card {
  static SUITS = {
    SPADES: { symbol: '♠', name: 'spades', color: 'black' },
    HEARTS: { symbol: '♥', name: 'hearts', color: 'red' },
    DIAMONDS: { symbol: '♦', name: 'diamonds', color: 'red' },
    CLUBS: { symbol: '♣', name: 'clubs', color: 'black' }
  };

  static RANKS = [
    { label: '2', value: 2 },
    { label: '3', value: 3 },
    { label: '4', value: 4 },
    { label: '5', value: 5 },
    { label: '6', value: 6 },
    { label: '7', value: 7 },
    { label: '8', value: 8 },
    { label: '9', value: 9 },
    { label: '10', value: 10 },
    { label: 'J', value: 11 },
    { label: 'Q', value: 12 },
    { label: 'K', value: 13 },
    { label: 'A', value: 14 }
  ];

  constructor(suit, rank, value) {
    this.id = `card-${suit.name}-${rank}-${Math.random().toString(36).substr(2, 6)}`;
    this.suit = suit;
    this.rank = rank;
    this.value = value;
    this.selected = false;
    this.faceUp = true;
  }

  toString() {
    return `${this.rank}${this.suit.symbol}`;
  }

  renderHTML(options = {}) {
    const { interactive = false, faceUp = this.faceUp, selected = this.selected, disabled = false } = options;
    const cardEl = document.createElement('div');
    cardEl.className = `playing-card ${this.suit.color} ${faceUp ? 'face-up' : 'face-down'} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`;
    cardEl.dataset.cardId = this.id;

    if (!faceUp) {
      cardEl.innerHTML = `
        <div class="card-back-pattern">
          <div class="card-back-inner">
            <span class="card-back-icon">♠</span>
          </div>
        </div>
      `;
      return cardEl;
    }

    // Special card badge text if applicable
    let badgeText = options.badgeText || '';
    if (!badgeText) {
      if (this.rank === '2') badgeText = options.special2PlayAgain ? 'RESET+1' : 'RESET';
      if (this.rank === '10') badgeText = 'BURN';
      if (this.rank === '7') badgeText = '≤7';
      if (this.rank === '8') badgeText = 'INVISIBLE';
      if (this.rank === '4' && options.special4Reverse) badgeText = 'REV';
    }

    const peekUnderText = options.peekUnderText || '';

    cardEl.innerHTML = `
      ${selected ? '<div class="card-selected-badge" title="Selected">✓</div>' : ''}
      <div class="card-corner top-left">
        <span class="card-rank">${this.rank}</span>
        <span class="card-suit">${this.suit.symbol}</span>
      </div>
      <div class="card-center">
        <span class="center-suit">${this.suit.symbol}</span>
        ${badgeText ? `<span class="card-special-badge ${this.rank}">${badgeText}</span>` : ''}
        ${peekUnderText ? `<span class="card-peek-badge">${peekUnderText}</span>` : ''}
      </div>
      <div class="card-corner bottom-right">
        <span class="card-rank">${this.rank}</span>
        <span class="card-suit">${this.suit.symbol}</span>
      </div>
    `;

    return cardEl;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Card;
}
